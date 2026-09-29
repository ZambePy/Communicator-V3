/**
 * Rearme por saída (FE-7).
 *
 * Depois de um clique pelo olhar, o único freio era um refratário de 800 ms:
 * quem mantém o olhar no alvo para conferir o resultado — comum em quem tem
 * ELA — via a mesma frase falada de novo a cada ~2 s (e repetida no celular do
 * cuidador), e o "Continuar" do tutorial pulava passos. E ao trocar de tela, o
 * botão que caía sob o olhar "herdado" era selecionado sozinho.
 *
 * A regra agora:
 *   - o alvo clicado só volta a valer quando o olhar SAI dele por
 *     `SAIDA_PARA_REARMAR_MS` (teclas que devem repetir, como Apagar, usam
 *     `data-repetir="true"` e ficam fora disto);
 *   - ao trocar de tela, o que estiver sob o olhar fica bloqueado do mesmo
 *     jeito — durante `JANELA_DE_HERANCA_MS` e, depois dela, enquanto o olhar
 *     não SALTAR para outro lugar: a tela nova só aceita uma seleção que o
 *     olhar fez nela. Salto é ficar além de `DISTANCIA_DE_SALTO_PX` do centro
 *     da fixação herdada por `SAIDA_PARA_REARMAR_MS` — a mesma saída que
 *     rearma um alvo clicado — e em `AMOSTRAS_PARA_SALTO` amostras seguidas:
 *     a 3–4 quadros por segundo, 200 ms cabem numa amostra só, e uma amostra
 *     não separa um salto de um pico do ruído do cursor (±80 px nesse
 *     computador, com o One Euro).
 *
 * A janela sozinha não bastava. Num computador lento (detector a 3–4 quadros
 * por segundo, a tela nova carregando o código dela) os 400 ms passavam com a
 * tela ANTIGA ainda desenhada: o bloqueio pegava um botão que ia sumir, o
 * botão da tela nova aparecia depois sob o olhar que não tinha se mexido e era
 * clicado sozinho 1,5 s mais tarde — no tutorial, o "Abrir as frases" voltava
 * a abrir as frases a cada retorno (percurso da Fase 8).
 *
 * Módulo puro (sem DOM): os alvos são comparados por identidade.
 */

import { DISTANCIA_DE_SALTO_PX } from './seguidorDeCursor';

export const SAIDA_PARA_REARMAR_MS = 200;
export const JANELA_DE_HERANCA_MS = 400;
/** Amostras seguidas longe da fixação herdada para o salto valer. */
export const AMOSTRAS_PARA_SALTO = 3;

/** Posição do olhar na tela, em px. */
export interface PontoDoOlhar {
  x: number;
  y: number;
}

export interface EstadoDoRearme {
  /** Alvo que não vale até o olhar sair dele. */
  bloqueado: unknown | null;
  /** Desde quando o olhar está fora do alvo bloqueado. */
  foraDesdeMs: number | null;
  /** Até quando o alvo sob o olhar é "herdado" da tela anterior. */
  herdarAteMs: number | null;
  /**
   * Centro da fixação herdada: a média das amostras perto dela, a começar da
   * que viu a troca de tela. `null` fora de uma herança.
   */
  herdarDe: PontoDoOlhar | null;
  /** Amostras que entraram na média de `herdarDe`. */
  amostrasDaFixacao: number;
  /** Desde quando o olhar está longe de `herdarDe` (um salto em confirmação). */
  saltoDesdeMs: number | null;
  /** Amostras seguidas longe de `herdarDe`. */
  amostrasDoSalto: number;
}

export function criarRearme(): EstadoDoRearme {
  return {
    bloqueado: null, foraDesdeMs: null,
    herdarAteMs: null, herdarDe: null, amostrasDaFixacao: 0, saltoDesdeMs: null, amostrasDoSalto: 0,
  };
}

/** Depois de um clique em `alvo`. `repetivel`: tecla que pode disparar de novo sem sair. */
export function aoClicar(alvo: unknown, repetivel: boolean): EstadoDoRearme {
  return repetivel ? criarRearme() : { ...criarRearme(), bloqueado: alvo };
}

/** A tela mudou, com o olhar em `ponto`. */
export function aoNavegar(agoraMs: number, ponto: PontoDoOlhar): EstadoDoRearme {
  return {
    ...criarRearme(),
    herdarAteMs: agoraMs + JANELA_DE_HERANCA_MS,
    herdarDe: { ...ponto },
    amostrasDaFixacao: 1,
  };
}

/**
 * A cada amostra, com o `alvo` sob o olhar (ou `null`) e o olhar em `ponto`:
 * o novo estado e se esse alvo está bloqueado agora.
 */
export function filtrarAlvo(
  estado: EstadoDoRearme,
  alvo: unknown | null,
  agoraMs: number,
  ponto: PontoDoOlhar,
): { estado: EstadoDoRearme; bloqueado: boolean } {
  let e = estado;
  if (e.herdarAteMs !== null && e.herdarDe !== null) {
    const perto = Math.hypot(ponto.x - e.herdarDe.x, ponto.y - e.herdarDe.y) <= DISTANCIA_DE_SALTO_PX;
    if (agoraMs <= e.herdarAteMs || perto) {
      // Herança: o que estiver sob o olhar vira o bloqueado — a tela nova
      // ainda pode estar entrando, deslizando, ou nem ter substituído a
      // antiga. Vale o último alvo visto: é o que o olhar terá de deixar.
      const n = e.amostrasDaFixacao + 1;
      const centro = perto
        ? { x: e.herdarDe.x + (ponto.x - e.herdarDe.x) / n, y: e.herdarDe.y + (ponto.y - e.herdarDe.y) / n }
        : e.herdarDe;
      e = { ...e, herdarDe: centro, amostrasDaFixacao: perto ? n : e.amostrasDaFixacao, saltoDesdeMs: null, amostrasDoSalto: 0 };
      if (alvo !== null) e = { ...e, bloqueado: alvo, foraDesdeMs: null };
      return { estado: e, bloqueado: alvo !== null };
    }
    // Longe da fixação herdada: salto em confirmação. Enquanto não se
    // confirma, só o herdado continua bloqueado — o alvo lá longe é escolha
    // nova se o salto for de verdade, e não pode virar herança por causa dele.
    // O tempo fora do herdado já conta para rearmá-lo.
    const desde = e.saltoDesdeMs ?? agoraMs;
    const amostras = e.amostrasDoSalto + 1;
    const naHerdada = alvo !== null && alvo === e.bloqueado;
    e = {
      ...e, saltoDesdeMs: desde, amostrasDoSalto: amostras,
      foraDesdeMs: naHerdada ? null : (e.foraDesdeMs ?? agoraMs),
    };
    if (agoraMs - desde < SAIDA_PARA_REARMAR_MS || amostras < AMOSTRAS_PARA_SALTO) {
      return { estado: e, bloqueado: naHerdada };
    }
    // O olhar saltou: acabou a herança, e o último bloqueado segue a regra de
    // sempre (volta a valer quando o olhar fica fora dele).
    e = { ...e, herdarAteMs: null, herdarDe: null, amostrasDaFixacao: 0, saltoDesdeMs: null, amostrasDoSalto: 0 };
  }
  if (e.bloqueado === null) return { estado: e, bloqueado: false };
  if (alvo === e.bloqueado) return { estado: { ...e, foraDesdeMs: null }, bloqueado: true };
  const fora = e.foraDesdeMs ?? agoraMs;
  if (agoraMs - fora >= SAIDA_PARA_REARMAR_MS) return { estado: criarRearme(), bloqueado: false };
  return { estado: { ...e, foraDesdeMs: fora }, bloqueado: false };
}
