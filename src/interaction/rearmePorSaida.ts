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
 *   - ao trocar de tela, o que estiver sob o olhar durante
 *     `JANELA_DE_HERANCA_MS` fica bloqueado do mesmo jeito: a tela nova só
 *     aceita uma seleção que o olhar fez nela.
 *
 * Módulo puro (sem DOM): os alvos são comparados por identidade.
 */

export const SAIDA_PARA_REARMAR_MS = 200;
export const JANELA_DE_HERANCA_MS = 400;

export interface EstadoDoRearme {
  /** Alvo que não vale até o olhar sair dele. */
  bloqueado: unknown | null;
  /** Desde quando o olhar está fora do alvo bloqueado. */
  foraDesdeMs: number | null;
  /** Até quando o alvo sob o olhar é "herdado" da tela anterior. */
  herdarAteMs: number | null;
}

export function criarRearme(): EstadoDoRearme {
  return { bloqueado: null, foraDesdeMs: null, herdarAteMs: null };
}

/** Depois de um clique em `alvo`. `repetivel`: tecla que pode disparar de novo sem sair. */
export function aoClicar(alvo: unknown, repetivel: boolean): EstadoDoRearme {
  return repetivel ? criarRearme() : { bloqueado: alvo, foraDesdeMs: null, herdarAteMs: null };
}

/** A tela mudou. */
export function aoNavegar(agoraMs: number): EstadoDoRearme {
  return { bloqueado: null, foraDesdeMs: null, herdarAteMs: agoraMs + JANELA_DE_HERANCA_MS };
}

/**
 * A cada amostra, com o `alvo` sob o olhar (ou `null`): o novo estado e se
 * esse alvo está bloqueado agora.
 */
export function filtrarAlvo(
  estado: EstadoDoRearme,
  alvo: unknown | null,
  agoraMs: number,
): { estado: EstadoDoRearme; bloqueado: boolean } {
  let e = estado;
  if (e.herdarAteMs !== null) {
    if (agoraMs <= e.herdarAteMs) {
      // Na janela da herança o que estiver sob o olhar vira o bloqueado (a
      // tela nova ainda pode estar entrando, deslizando).
      if (alvo !== null) e = { ...e, bloqueado: alvo, foraDesdeMs: null };
      return { estado: e, bloqueado: alvo !== null };
    }
    e = { ...e, herdarAteMs: null };
  }
  if (e.bloqueado === null) return { estado: e, bloqueado: false };
  if (alvo === e.bloqueado) return { estado: { ...e, foraDesdeMs: null }, bloqueado: true };
  const fora = e.foraDesdeMs ?? agoraMs;
  if (agoraMs - fora >= SAIDA_PARA_REARMAR_MS) return { estado: criarRearme(), bloqueado: false };
  return { estado: { ...e, foraDesdeMs: fora }, bloqueado: false };
}
