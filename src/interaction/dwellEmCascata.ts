/**
 * Dwell em cascata no teclado (M17), adaptado de Mott, Williams, Wobbrock &
 * Morris (CHI 2017).
 *
 * ## O que o estudo fez
 *
 * Cada tecla tem o seu tempo de permanência. As que não continuam nenhuma
 * palavra provável (probabilidade abaixo de 1 % na lista n-best do preditor)
 * ficam no dwell máximo; as prováveis podem ser mais rápidas, até um PISO que
 * cai 10 % a cada caractere digitado dentro da palavra e volta ao início
 * depois do espaço. A barra de espaço fica em 2/3 da base quando a palavra
 * digitada está no dicionário. Faixa de 100 a 1000 ms. Com cinco usuários com
 * ELA (só cascata, sem comparação estática nesse grupo): 9,51 palavras por
 * minuto; nos 17 sem deficiência, +16,7 % de velocidade e −35 % de erro
 * corrigido contra o dwell estático.
 *
 * ## O que muda aqui
 *
 * O teclado do IrisFlow tem dois níveis (grupo, depois letra) e o preditor
 * pontua palavras, sem probabilidade. A "lista n-best" é a das sugestões que
 * o teclado já mostra: uma letra é provável se é a próxima letra de alguma
 * delas; um grupo é provável se contém uma letra provável. Probabilidade
 * contínua fica para quando o preditor der uma. O resto é o do estudo: piso
 * −10 % por caractere, volta no espaço, espaço a 2/3 com palavra conhecida,
 * e nada abaixo de 10 % da base (a razão 100/1000 ms da faixa do estudo) nem
 * do mínimo que o app aceita para o dwell (`minimoMs`: abaixo dele o clique
 * dispara antes de a fixação estabilizar — os 100 ms do estudo eram de gente
 * sem deficiência motora ocular). Falar, Apagar e Limpar nunca aceleram.
 */

/** Queda do piso por caractere digitado na palavra. */
export const QUEDA_POR_CARACTERE = 0.1;
/** Piso absoluto em fração da base (100/1000 ms no estudo). */
export const FRACAO_MINIMA = 0.1;
/** Espaço depois de uma palavra conhecida. */
export const FRACAO_DO_ESPACO = 2 / 3;

export interface EntradaDaCascata {
  /** Texto em composição. */
  texto: string;
  /** Palavras sugeridas agora (a lista n-best do teclado). */
  candidatas: readonly string[];
  /** A palavra em composição é conhecida (dicionário ou vocabulário). */
  palavraConhecida: boolean;
  /** Dwell base do paciente, em ms. */
  baseMs: number;
  /** Menor dwell que a cascata pode dar, em ms (o mínimo do app). */
  minimoMs?: number;
}

export interface Cascata {
  /** Piso corrente, em ms. */
  pisoMs: number;
  /** Letras (maiúsculas, sem acento) que continuam alguma candidata. */
  letrasProvaveis: ReadonlySet<string>;
  /** Dwell de uma letra. */
  dwellDaLetra(letra: string): number;
  /** Dwell de um grupo pelas letras que ele contém. */
  dwellDoGrupo(letras: readonly string[]): number;
  /** Dwell do espaço. */
  espacoMs: number;
}

/** Maiúscula e sem acento: "ã" → "A". */
function base(letra: string): string {
  return letra.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
}

/** A palavra em composição: o que vem depois do último espaço. */
export function palavraEmComposicao(texto: string): string {
  const m = /(\S*)$/u.exec(texto);
  return m ? m[1] : '';
}

export function calcularCascata(e: EntradaDaCascata): Cascata {
  const prefixo = palavraEmComposicao(e.texto);
  const n = [...prefixo].length;
  // O mínimo do app nunca passa da base: a cascata só acelera, não atrasa.
  const minimoMs = Math.min(e.baseMs, Math.max(0, e.minimoMs ?? 0));
  const pisoMs = Math.max(minimoMs, e.baseMs * Math.max(FRACAO_MINIMA, 1 - QUEDA_POR_CARACTERE * n));
  const prefixoBase = base(prefixo);
  const provaveis = new Set<string>();
  for (const c of e.candidatas) {
    const cb = base(c.trim());
    if (cb.length > prefixoBase.length && cb.startsWith(prefixoBase)) {
      provaveis.add(cb[prefixoBase.length]);
    }
  }
  const dwellDaLetra = (letra: string) => (provaveis.has(base(letra)) ? pisoMs : e.baseMs);
  return {
    pisoMs,
    letrasProvaveis: provaveis,
    dwellDaLetra,
    dwellDoGrupo: (letras) => (letras.some((l) => provaveis.has(base(l))) ? pisoMs : e.baseMs),
    espacoMs: e.palavraConhecida && n > 0 ? Math.max(minimoMs, e.baseMs * FRACAO_DO_ESPACO) : e.baseMs,
  };
}
