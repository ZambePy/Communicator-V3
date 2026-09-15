// Recorte normalizado do olho para o ramo ocular (EyeNet).
//
// O ramo facial (L2CS) lê o rosto inteiro a 448²; este lê cada olho a 96×64.
// A rede que consome isto é treinada em renders do UnityEyes 2, e o que faz
// o treino valer no produto é UMA convenção de recorte usada nos dois lados —
// por isso a geometria mora aqui, pura, e um arquivo de fixtures a exporta
// para o Python (`fixtures/recorte-olho.json`).
//
// Convenção:
//   1. centro = ponto médio entre canto interno e canto externo;
//   2. largura do recorte na imagem = |externo − interno| × FATOR; altura na
//      proporção 64/96;
//   3. gira para nivelar a linha dos cantos (o ângulo é o da linha, dobrado
//      para (−90°, 90°], porque "interno→externo" aponta para lados opostos
//      nos dois olhos e girar por ele poria um olho de cabeça para baixo);
//   4. espelha horizontalmente para que TODO olho pareça um olho DIREITO da
//      pessoa numa imagem não espelhada — uma rede só para os dois lados;
//   5. escala para 96×64 e centraliza.
//
// Mesma forma de matriz que `matrizDoRecorte` (l2cs/crop.ts), e o mesmo
// argumento sobre o sinal: a rotação acontece antes do espelho.

import { IMAGENET_MEAN, IMAGENET_STD, type CropContext, type CropSource, type MatrizDoRecorte, type Point2D } from '../l2cs/crop';

export const LARGURA_DO_OLHO = 96;
export const ALTURA_DO_OLHO = 64;
/** Largura do recorte em múltiplos da distância entre cantos. 1,8 deixa
 *  pálpebras e um pouco de pele — o que a rede usa para achar o globo. */
export const FATOR_DO_OLHO = 1.8;

export type LadoDoOlho = 'esquerdo' | 'direito';

/** Ângulo da linha dos cantos, dobrado para (−90°, 90°]. */
export function anguloDaLinhaDosCantos(interno: Point2D, externo: Point2D): number {
  let a = Math.atan2(externo.y - interno.y, externo.x - interno.x);
  if (a > Math.PI / 2) a -= Math.PI;
  else if (a <= -Math.PI / 2) a += Math.PI;
  return a;
}

/**
 * O recorte deve ser espelhado para ficar canônico?
 *
 * Canônico = olho direito da pessoa numa imagem não espelhada (canto externo
 * à esquerda no quadro). Num vídeo espelhado o olho direito aparece como um
 * esquerdo, e vice-versa — daí o ou-exclusivo.
 */
export function precisaEspelhar(olho: LadoDoOlho, isMirrored: boolean): boolean {
  return isMirrored !== (olho === 'esquerdo');
}

export interface OpcoesDoRecorteDoOlho {
  /** Cantos em PIXELS da imagem de origem. */
  cantoInterno: Point2D;
  cantoExterno: Point2D;
  olho: LadoDoOlho;
  isMirrored: boolean;
  largura?: number;
  altura?: number;
  fator?: number;
}

export interface RecorteDoOlho {
  matriz: MatrizDoRecorte;
  flip: boolean;
  /** Largura do recorte em px da imagem de origem (antes da escala). */
  larguraNaImagem: number;
}

export function matrizDoRecorteDoOlho(o: OpcoesDoRecorteDoOlho): RecorteDoOlho {
  const W = o.largura ?? LARGURA_DO_OLHO;
  const H = o.altura ?? ALTURA_DO_OLHO;
  const fator = o.fator ?? FATOR_DO_OLHO;

  const cx = (o.cantoInterno.x + o.cantoExterno.x) / 2;
  const cy = (o.cantoInterno.y + o.cantoExterno.y) / 2;
  const dist = Math.hypot(o.cantoExterno.x - o.cantoInterno.x, o.cantoExterno.y - o.cantoInterno.y);
  const larguraNaImagem = dist * fator;
  if (!(larguraNaImagem > 0)) {
    throw new Error('[olho] cantos coincidentes — não há olho para recortar.');
  }
  const k = W / larguraNaImagem;
  const theta = -anguloDaLinhaDosCantos(o.cantoInterno, o.cantoExterno);
  const flip = precisaEspelhar(o.olho, o.isMirrored);
  const sx = flip ? -1 : 1;

  const cos = Math.cos(theta);
  const sen = Math.sin(theta);
  // M = T(W/2, H/2) · S(sx, 1) · R(theta) · S(k) · T(−c)
  const a = sx * k * cos;
  const b = k * sen;
  const c = sx * k * -sen;
  const d = k * cos;
  return {
    matriz: { a, b, c, d, e: W / 2 - (a * cx + c * cy), f: H / 2 - (b * cx + d * cy) },
    flip,
    larguraNaImagem,
  };
}

/** RGBA HWC (W×H) → RGB CHW normalizado ImageNet. */
export function preprocessarOlho(
  rgba: Uint8Array | Uint8ClampedArray,
  largura: number = LARGURA_DO_OLHO,
  altura: number = ALTURA_DO_OLHO,
): Float32Array {
  const px = largura * altura;
  if (rgba.length !== px * 4) {
    throw new Error(`[olho] esperava ${px * 4} bytes RGBA, recebeu ${rgba.length}`);
  }
  const out = new Float32Array(3 * px);
  for (let i = 0; i < px; i++) {
    const j = i * 4;
    out[i] = (rgba[j] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    out[px + i] = (rgba[j + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    out[2 * px + i] = (rgba[j + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }
  return out;
}

export function criarContextoDoOlho(
  largura: number = LARGURA_DO_OLHO,
  altura: number = ALTURA_DO_OLHO,
): CropContext {
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(largura, altura)
      : Object.assign(document.createElement('canvas'), { width: largura, height: altura });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('[olho] 2D context indisponível');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** Recorta um olho da fonte para o tensor 3×64×96. `contexto` é reusado a 30 Hz. */
export function recortarOlhoParaTensor(
  source: CropSource,
  larguraFonte: number,
  alturaFonte: number,
  o: OpcoesDoRecorteDoOlho,
  contexto: CropContext,
): Float32Array {
  const g = contexto.ctx;
  const W = contexto.canvas.width;
  const H = contexto.canvas.height;
  const { matriz: m } = matrizDoRecorteDoOlho({ ...o, largura: W, altura: H });

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.save();
  g.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  (g as CanvasRenderingContext2D).drawImage(source, 0, 0, larguraFonte, alturaFonte);
  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);

  const img = (g as CanvasRenderingContext2D).getImageData(0, 0, W, H);
  return preprocessarOlho(img.data, W, H);
}
