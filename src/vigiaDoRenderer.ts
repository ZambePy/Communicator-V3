/**
 * Vigia de renderer TRAVADO — a parte pura (sem Electron), testável com
 * relógio injetado. A fiação fica em `electron/vigiaDoRenderer.ts`; a batida,
 * em `frontend/src/services/batidaDoRenderer.ts`.
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 4): o
 * `unresponsive` do Chromium depende de eventos de ENTRADA sem resposta, e
 * quem usa só o olhar não gera entrada nenhuma — o dwell é um `.click()` da
 * própria página. Um laço infinito ou um deadlock na thread principal podia
 * nem disparar o evento; e quando disparava, o main só escrevia no log. O
 * `render-process-gone` cobre queda, não travamento. O paciente ficava sem
 * comunicação e sem Emergência até alguém chegar.
 *
 * Como funciona: enquanto o laço do rastreador gira, a página manda uma
 * batida a cada `INTERVALO_DA_BATIDA_MS`. Sem batida por `LIMITE_SEM_BATIDA_MS`
 * — com a janela visível e o rastreamento ligado — o main derruba o processo
 * da página (`forcefullyCrashRenderer`), e a recarga automática que já existe
 * para quedas (`decidirRecarga`) reabre a tela.
 */

/** Canal do IPC (renderer → main, `send`). */
export const CANAL_DA_BATIDA = 'irisflow:vivo';

/** A página bate a cada 2 s enquanto o laço do rastreador gira. */
export const INTERVALO_DA_BATIDA_MS = 2_000;

/**
 * Quanto silêncio o vigia tolera antes de reiniciar a página.
 *
 * O maior trabalho SÍNCRONO legítimo da página é o diagnóstico da calibração
 * (leave-one-target-out, ~9 s medidos no PC de referência com 606 amostras),
 * logo depois do treino (~4 s). Mesmo os dois seguidos (~13 s) ficam abaixo da
 * metade deste limite: há folga para um computador mais lento que o de
 * referência. Mais alto que isto e o paciente travado espera demais sem
 * comunicação e sem Emergência; mais baixo e um computador fraco calibrando
 * teria a tela reiniciada no meio do resultado. A carga do detector de rosto
 * (que também trava a thread por segundos) acontece com o vigia DESARMADO: a
 * página só arma o vigia depois que o laço começa a girar.
 */
export const LIMITE_SEM_BATIDA_MS = 30_000;

/** De quanto em quanto tempo o main confere. */
export const INTERVALO_DO_VIGIA_MS = 5_000;

/**
 * Se o PRÓPRIO vigia ficou este tempo sem conferir, quem parou foi o processo
 * principal ou o computador (suspensão, hibernação, relógio que pulou): o
 * silêncio da página nesse intervalo não é culpa dela, e a contagem recomeça.
 */
export const FOLGA_DO_VIGIA_MS = 3 * INTERVALO_DO_VIGIA_MS;

/** Uma lacuna entre batidas maior que isto vai para o log (diagnóstico, não ação). */
export const LACUNA_QUE_VAI_PARA_O_LOG_MS = 10_000;

/**
 * O vigia vale no app EMPACOTADO. No desenvolvimento, só com
 * `IRISFLOW_VIGIA=1`: um ponto de parada no DevTools para a página de
 * propósito, e o vigia a derrubaria no meio da depuração.
 */
export function vigiaLigado(empacotado: boolean, variavel: string | undefined): boolean {
  return empacotado || variavel === '1';
}

/** O que a página manda. `rastreando: false` = o laço parou DE PROPÓSITO (desarma). */
export interface BatidaDoRenderer {
  rastreando: boolean;
}

/** Aceita só o formato esperado: o IPC traz o que a página mandar. */
export function lerBatida(b: unknown): BatidaDoRenderer | null {
  if (!b || typeof b !== 'object') return null;
  const r = (b as { rastreando?: unknown }).rastreando;
  return typeof r === 'boolean' ? { rastreando: r } : null;
}

export type VereditoDoVigia =
  | { travado: false }
  | { travado: true; semBatidaHaMs: number };

export interface VigiaDoRenderer {
  /** Chegou uma batida. Devolve a lacuna desde a anterior (ms), ou `null` se o vigia estava desarmado. */
  batida(agoraMs: number, dados: unknown): number | null;
  /** Página nova (recarga, queda) ou rastreamento parado: espera a próxima batida para armar. */
  desarmar(): void;
  /** Conta do zero a partir de agora (tela desbloqueada, sistema acordou). */
  desculpar(agoraMs: number): void;
  /**
   * A janela está visível? (`false` = minimizada, escondida pelo Modo
   * Computador, tela bloqueada, sistema suspenso — nada disso é travamento.)
   */
  verificar(agoraMs: number, janela: { visivel: boolean }): VereditoDoVigia;
  /** Armado = a página já bateu com o rastreamento ligado. */
  armado(): boolean;
}

export function criarVigiaDoRenderer(opcoes: { limiteMs?: number; folgaMs?: number } = {}): VigiaDoRenderer {
  const limiteMs = opcoes.limiteMs ?? LIMITE_SEM_BATIDA_MS;
  const folgaMs = opcoes.folgaMs ?? FOLGA_DO_VIGIA_MS;
  /** Última batida com o rastreamento ligado; `null` = desarmado. */
  let ultimaBatidaMs: number | null = null;
  /** O silêncio só conta a partir daqui (janela oculta, suspensão, folga do vigia). */
  let contarDesdeMs = -Infinity;
  /** Última conferência, para perceber que o próprio vigia ficou parado. */
  let ultimaVerificacaoMs: number | null = null;

  return {
    batida(agoraMs, dados) {
      const b = lerBatida(dados);
      if (!b) return null;
      if (!b.rastreando) {
        ultimaBatidaMs = null;
        return null;
      }
      const lacuna = ultimaBatidaMs === null ? null : agoraMs - ultimaBatidaMs;
      ultimaBatidaMs = agoraMs;
      return lacuna;
    },
    desarmar() {
      ultimaBatidaMs = null;
    },
    desculpar(agoraMs) {
      contarDesdeMs = Math.max(contarDesdeMs, agoraMs);
    },
    verificar(agoraMs, janela) {
      const anterior = ultimaVerificacaoMs;
      ultimaVerificacaoMs = agoraMs;
      // O vigia ficou parado (ou o relógio voltou): recomeça a contagem.
      if (anterior !== null && (agoraMs - anterior > folgaMs || agoraMs < anterior)) {
        contarDesdeMs = agoraMs;
        return { travado: false };
      }
      if (!janela.visivel) {
        // Minimizada ou escondida de propósito: o Chromium pode pausar o laço,
        // e ninguém está olhando para ela. Ao voltar, a página tem o limite
        // inteiro para dar sinal.
        contarDesdeMs = agoraMs;
        return { travado: false };
      }
      if (ultimaBatidaMs === null) return { travado: false };
      const desde = Math.max(ultimaBatidaMs, contarDesdeMs);
      if (agoraMs - desde < limiteMs) return { travado: false };
      return { travado: true, semBatidaHaMs: agoraMs - ultimaBatidaMs };
    },
    armado() {
      return ultimaBatidaMs !== null;
    },
  };
}
