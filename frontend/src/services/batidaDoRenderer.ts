/**
 * Batida da página para o vigia de página travada do processo principal.
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 4); a decisão e
 * o limiar estão em `src/vigiaDoRenderer.ts`, a fiação no main em
 * `electron/vigiaDoRenderer.ts`.
 *
 * A batida é MARCADA PELO LAÇO DO RASTREADOR: ela sai das amostras que o
 * engine emite a cada quadro (inclusive as de "sem rosto" e de câmera parada),
 * não de um `setInterval` solto. Assim ela prova as duas coisas que o paciente
 * precisa: a thread da página responde E o laço do olhar está girando. Quando
 * o laço para DE PROPÓSITO (engine parado, carregando, ou se recuperando de
 * uma falha da GPU — estados em que o próprio app já mostra o que houve), a
 * página avisa e o vigia desarma, para não reiniciar a tela à toa.
 */

import type { EngineState, GazeSample } from '@tracker/tracker/engine';
import { INTERVALO_DA_BATIDA_MS, type BatidaDoRenderer } from '@tracker/vigiaDoRenderer';
import { ouvirTrabalhoLongo } from '@tracker/trabalhoLongo';

type Enviar = (b: BatidaDoRenderer) => void;

/** O `irisflowSystem.vivo` do preload; `null` fora do Electron (navegador, testes). */
export function ponteDaBatida(w: Window | undefined = typeof window === 'undefined' ? undefined : window): Enviar | null {
  const vivo = (w as unknown as { irisflowSystem?: { vivo?: unknown } } | undefined)?.irisflowSystem?.vivo;
  return typeof vivo === 'function' ? (vivo as Enviar) : null;
}

/** Estados em que o laço do rastreador está parado de propósito: o vigia desarma. */
const ESTADOS_SEM_LACO: ReadonlySet<EngineState> = new Set<EngineState>(['idle', 'loading', 'error']);

export interface Batida {
  /** Uma volta do laço (uma amostra). Manda no máximo uma batida a cada `INTERVALO_DA_BATIDA_MS`. */
  volta(): void;
  /** O laço parou de propósito: desarma o vigia (uma mensagem só). */
  pausa(): void;
}

export function criarBatida(enviar: Enviar, relogio: () => number = () => performance.now()): Batida {
  let armada = false;
  let ultimoEnvio = -Infinity;
  let avisouFalha = false;
  const mandar = (b: BatidaDoRenderer) => {
    try {
      enviar(b);
    } catch (e) {
      // Uma linha no console, não uma por batida.
      if (!avisouFalha) {
        avisouFalha = true;
        console.warn('[vigia] a batida não pôde ser enviada ao processo principal:', e);
      }
    }
  };
  return {
    volta() {
      const agora = relogio();
      if (armada && agora - ultimoEnvio < INTERVALO_DA_BATIDA_MS) return;
      armada = true;
      ultimoEnvio = agora;
      mandar({ rastreando: true });
    },
    pausa() {
      if (!armada) return;
      armada = false;
      ultimoEnvio = -Infinity;
      mandar({ rastreando: false });
    },
  };
}

/** O que a batida precisa do engine. */
export interface FonteDoLaco {
  subscribe(cb: (s: GazeSample) => void): () => void;
  onStateChange(cb: (s: EngineState) => void): () => void;
}

/**
 * Liga a batida às amostras do engine. Devolve a função que desliga (e
 * desarma o vigia). Fora do Electron não faz nada.
 */
export function ligarBatidaDoRenderer(
  engine: FonteDoLaco,
  enviar: Enviar | null = ponteDaBatida(),
  relogio?: () => number,
): () => void {
  if (!enviar) return () => {};
  const batida = criarBatida(enviar, relogio);
  const pararAmostras = engine.subscribe(() => batida.volta());
  const pararEstado = engine.onStateChange((s) => {
    if (ESTADOS_SEM_LACO.has(s)) batida.pausa();
  });
  // Treino da calibração (trabalho síncrono de segundos): desarma até a
  // próxima volta do laço — revisão de segurança de 19/10/2026.
  const pararTrabalho = ouvirTrabalhoLongo(() => batida.pausa());
  return () => {
    pararAmostras();
    pararEstado();
    pararTrabalho();
    batida.pausa();
  };
}
