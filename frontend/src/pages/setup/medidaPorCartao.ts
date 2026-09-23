/**
 * Tamanho do monitor medido com um cartão na tela.
 *
 * Quando o EDID não responde (monitor antigo, adaptador HDMI barato, TV), a
 * alternativa era o cuidador achar uma fita métrica e medir a diagonal "de
 * canto a canto, sem a moldura". Um cartão de crédito ou de identidade está
 * em qualquer carteira e tem tamanho NORMATIZADO (ISO/IEC 7810 ID-1:
 * 85,60 × 53,98 mm). O cuidador encosta o cartão na tela e ajusta o contorno
 * desenhado até coincidir com ele — daí sai quantos pixels a tela tem por
 * milímetro, e com a resolução, o tamanho físico dela.
 *
 * ## Unidades
 *
 * O contorno é desenhado em px CSS; a resolução vem em px do DISPOSITIVO
 * (`getDisplayInfo().physicalWidthPx` no Electron, ou `screen.width × dpr`).
 * A ponte entre os dois é o `devicePixelRatio` da própria janela, que já
 * embute a escala do Windows (125 %, 150 %…) e qualquer zoom — o mesmo fator
 * que o navegador usa para desenhar o contorno. Usar o fator do SO sozinho
 * erraria se houvesse zoom; usar px CSS dos dois lados erraria se `screen`
 * reportasse a tela em outra escala. Convertendo tudo para px físicos, a
 * escala se cancela e só sobra geometria.
 */

export const CARTAO_ID1_LARGURA_MM = 85.6;
export const CARTAO_ID1_ALTURA_MM = 53.98;
export const PROPORCAO_DO_CARTAO = CARTAO_ID1_ALTURA_MM / CARTAO_ID1_LARGURA_MM;
export const MM_POR_POLEGADA = 25.4;

/** Faixa plausível de monitor de mesa — a mesma do campo manual. */
export const DIAGONAL_MIN_POL = 10;
export const DIAGONAL_MAX_POL = 60;

export interface ResolucaoFisica {
  /** Largura da tela em px do dispositivo. */
  larguraPx: number;
  /** Altura da tela em px do dispositivo. */
  alturaPx: number;
}

export interface MedidaDoMonitor {
  pxPorMm: number;
  larguraMm: number;
  alturaMm: number;
  diagonalMm: number;
  diagonalPol: number;
  /** Dentro da faixa plausível de monitor (10–60"). */
  plausivel: boolean;
}

/**
 * A conta, pura.
 *
 * @param larguraDoCartaoCssPx largura do contorno, em px CSS, quando coincide
 *        com o cartão real (lado de 85,60 mm na horizontal)
 * @param dpr `window.devicePixelRatio` da janela em que o contorno foi desenhado
 * @param tela resolução em px do dispositivo
 */
export function medirMonitorPorCartao(
  larguraDoCartaoCssPx: number,
  dpr: number,
  tela: ResolucaoFisica
): MedidaDoMonitor | null {
  if (!(larguraDoCartaoCssPx > 0) || !(dpr > 0)) return null;
  if (!(tela.larguraPx > 0) || !(tela.alturaPx > 0)) return null;
  const pxPorMm = (larguraDoCartaoCssPx * dpr) / CARTAO_ID1_LARGURA_MM;
  const larguraMm = tela.larguraPx / pxPorMm;
  const alturaMm = tela.alturaPx / pxPorMm;
  const diagonalMm = Math.hypot(larguraMm, alturaMm);
  const diagonalPol = diagonalMm / MM_POR_POLEGADA;
  return {
    pxPorMm,
    larguraMm,
    alturaMm,
    diagonalMm,
    diagonalPol,
    plausivel: diagonalPol >= DIAGONAL_MIN_POL && diagonalPol <= DIAGONAL_MAX_POL,
  };
}

/** Diagonal com uma casa decimal — o mesmo formato que o campo aceita. */
export const arredondarPolegadas = (pol: number) => Math.round(pol * 10) / 10;

/** Informação de tela do Electron (`irisflowSystem.getDisplayInfo()`). */
export interface InfoDaTela {
  widthPx: number;
  heightPx: number;
  scaleFactor: number;
  physicalWidthPx: number;
  physicalHeightPx: number;
}

/**
 * Resolução física da tela.
 *
 * Preferência: o que o SO informa (px físicos do monitor primário). Sem a
 * ponte (navegador), `screen.width × devicePixelRatio` — que é a mesma coisa
 * quando não há zoom, o caso do app em tela cheia.
 */
export function resolucaoFisica(
  info: InfoDaTela | null,
  tela: { width: number; height: number },
  dpr: number
): ResolucaoFisica {
  if (info && info.physicalWidthPx > 0 && info.physicalHeightPx > 0) {
    return { larguraPx: info.physicalWidthPx, alturaPx: info.physicalHeightPx };
  }
  if (info && info.widthPx > 0 && info.heightPx > 0 && info.scaleFactor > 0) {
    return {
      larguraPx: Math.round(info.widthPx * info.scaleFactor),
      alturaPx: Math.round(info.heightPx * info.scaleFactor),
    };
  }
  return { larguraPx: Math.round(tela.width * dpr), alturaPx: Math.round(tela.height * dpr) };
}

/**
 * Largura inicial do contorno: o cartão no "milímetro CSS" (96 dpi → 3,78 px/mm).
 * Quase nunca é o tamanho real, e é esse o ponto — é só um começo plausível.
 */
export const LARGURA_INICIAL_CSS_PX = Math.round((CARTAO_ID1_LARGURA_MM / MM_POR_POLEGADA) * 96);
export const LARGURA_MIN_CSS_PX = 120;
export const LARGURA_MAX_CSS_PX = 900;

export function limitarLarguraDoCartao(px: number): number {
  if (!Number.isFinite(px)) return LARGURA_INICIAL_CSS_PX;
  return Math.min(LARGURA_MAX_CSS_PX, Math.max(LARGURA_MIN_CSS_PX, Math.round(px)));
}
