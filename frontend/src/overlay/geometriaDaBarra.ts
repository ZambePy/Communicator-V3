/**
 * Geometria da barra lateral do Modo Computador.
 *
 * Antes a barra ficava colada na borda direita (8 px) e os botões iam de 52 a
 * 72 px, com ícone de 26 px. Dois problemas, os dois de rastreamento:
 *
 *  - **A borda é onde o olhar erra mais.** Os alvos mais externos da
 *    calibração ficam a ~5 % da borda; um botão com o centro a 48 px dela está
 *    fora da área calibrada, onde o modelo extrapola. Afastar a barra 48 px da
 *    borda põe o centro dos botões (a ~88 px dela, num monitor Full HD) em
 *    cima da coluna de alvos da calibração.
 *  - **Ícone maior é leitura e alvo mais fáceis.** O ícone passa a ocupar
 *    45 % do botão (26 → 36 px num Full HD) e o botão cresce o que a altura
 *    permite.
 *
 * Os CANTOS ficam livres sempre que isso não encolhe os botões: a sobreposição
 * cobre o monitor inteiro, e uma coluna de ponta a ponta taparia os botões de
 * minimizar/maximizar das janelas maximizadas (no alto, a 0–138 px da borda) e
 * o relógio da barra de tarefas (embaixo) — o olhar cairia na barra, não
 * neles. Num monitor baixo, onde os cantos livres deixariam os botões menores
 * que antes, a coluna volta às margens de 12 px de sempre.
 *
 * O piso continua 52 px: é o `ALVO_MINIMO_OVERLAY_PX` da correção por dwell
 * (um dwell concluído num botão menor não vira rótulo).
 */

/** Margens de antes, em cima e embaixo (monitor baixo). */
export const MARGEM_VERTICAL_PX = 12;
/** Margem de cima com os cantos livres: passa dos botões da barra de título (~31 px). */
export const MARGEM_SUPERIOR_LIVRE_PX = 44;
/** Margem de baixo com os cantos livres: passa da barra de tarefas (48 px). */
export const MARGEM_INFERIOR_LIVRE_PX = 60;
/** Espaço entre dois botões, em px. */
export const ESPACO_ENTRE_BOTOES_PX = 8;
/** Distância entre a borda direita da tela e a coluna de botões, em px. */
export const AFASTAMENTO_DA_BORDA_PX = 48;
/** Menor lado de botão (monitores baixos): o `ALVO_MINIMO_OVERLAY_PX`. */
export const LADO_MINIMO_PX = 52;
/** Maior lado de botão (monitores altos). */
export const LADO_MAXIMO_PX = 96;
/** Teto do lado antes desta revisão: com os cantos livres, nunca abaixo dele se antes cabia. */
const LADO_MAXIMO_ANTIGO_PX = 72;
/** Menor ícone: o tamanho de antes. */
const ICONE_MINIMO_PX = 26;

export interface GeometriaDaBarra {
  /** Lado de cada botão, em px. */
  ladoPx: number;
  /** Tamanho do ícone dentro do botão, em px. */
  iconePx: number;
  /** Corpo do rótulo, em px. */
  fontePx: number;
  /** Raio da borda do botão, em px. */
  raioPx: number;
  /** Distância da borda direita da tela até a coluna, em px. */
  direitaPx: number;
  /** Margens da coluna, em cima e embaixo, em px. */
  topoPx: number;
  basePx: number;
  /**
   * Faixa da tela ocupada pela barra, medida da borda direita (afastamento +
   * botão + folga). A lupa e o teclado ficam fora dela.
   */
  larguraOcupadaPx: number;
}

const prender = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Lado que cabe com `n` botões entre as margens dadas. */
function ladoQueCabe(alturaPx: number, n: number, topo: number, base: number): number {
  return Math.floor((alturaPx - topo - base - (n - 1) * ESPACO_ENTRE_BOTOES_PX) / n);
}

/** Geometria da barra para um monitor de `alturaPx` (em DIP) e `nBotoes` botões. */
export function geometriaDaBarra(alturaPx: number, nBotoes: number): GeometriaDaBarra {
  const n = Math.max(1, nBotoes);
  const comCantosLivres = ladoQueCabe(alturaPx, n, MARGEM_SUPERIOR_LIVRE_PX, MARGEM_INFERIOR_LIVRE_PX);
  const compacto = ladoQueCabe(alturaPx, n, MARGEM_VERTICAL_PX, MARGEM_VERTICAL_PX);
  // Cantos livres quando os botões ficam pelo menos do tamanho de antes.
  const cantosLivres = comCantosLivres >= Math.min(compacto, LADO_MAXIMO_ANTIGO_PX);
  const ladoPx = prender(cantosLivres ? comCantosLivres : compacto, LADO_MINIMO_PX, LADO_MAXIMO_PX);
  return {
    ladoPx,
    // 45 % do lado: 36 px num botão de 81 (era 26 num de 72).
    iconePx: prender(Math.round(ladoPx * 0.45), ICONE_MINIMO_PX, 40),
    fontePx: prender(Math.round(ladoPx * 0.15), 11, 14),
    raioPx: Math.round(ladoPx * 0.2),
    direitaPx: AFASTAMENTO_DA_BORDA_PX,
    topoPx: cantosLivres ? MARGEM_SUPERIOR_LIVRE_PX : MARGEM_VERTICAL_PX,
    basePx: cantosLivres ? MARGEM_INFERIOR_LIVRE_PX : MARGEM_VERTICAL_PX,
    larguraOcupadaPx: AFASTAMENTO_DA_BORDA_PX + ladoPx + ESPACO_ENTRE_BOTOES_PX,
  };
}
