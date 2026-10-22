import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { preprocessFromRGBA } from './l2cs/crop';
import { preprocessarOlho } from './olho/recorte';
import { EyeQualityAnalyzer } from './qualityAnalyzer';
import type { Point3D } from './extractor';

// Falha #13 da auditoria de 18/10/2026: buffers grandes alocados a cada quadro
// e a cada inferência na thread do cursor (GC → "cursor travando"). Os buffers
// passam a ser reaproveitados. O que importa provar aqui: a SAÍDA é idêntica,
// bit a bit, com e sem o reaproveitamento — inclusive quando o buffer
// reaproveitado chega sujo de um quadro anterior.

function rgbaAleatorio(n: number, semente: number): Uint8ClampedArray {
  const p = new Uint8ClampedArray(n * 4);
  let s = semente;
  for (let i = 0; i < p.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    p[i] = s & 0xff;
  }
  return p;
}

describe('pré-processamento com buffer reaproveitado', () => {
  it('rosto (224²): mesmo resultado, no MESMO buffer, mesmo vindo sujo', () => {
    const lado = 224;
    const rgba = rgbaAleatorio(lado * lado, 7);
    const novo = preprocessFromRGBA(rgba, lado);
    const sujo = new Float32Array(3 * lado * lado).fill(123.456);
    const reaproveitado = preprocessFromRGBA(rgba, lado, sujo);
    expect(reaproveitado).toBe(sujo);
    expect(Array.from(reaproveitado)).toEqual(Array.from(novo));
  });

  it('buffer do tamanho errado é ignorado (aloca um novo, como antes)', () => {
    const rgba = rgbaAleatorio(224 * 224, 3);
    const errado = new Float32Array(10);
    const r = preprocessFromRGBA(rgba, 224, errado);
    expect(r).not.toBe(errado);
    expect(r.length).toBe(3 * 224 * 224);
  });

  it('olho (3×64×96): mesmo resultado no buffer reaproveitado', () => {
    const rgba = rgbaAleatorio(96 * 64, 11);
    const novo = preprocessarOlho(rgba, 96, 64);
    const sujo = new Float32Array(3 * 96 * 64).fill(-9);
    const r = preprocessarOlho(rgba, 96, 64, sujo);
    expect(r).toBe(sujo);
    expect(Array.from(r)).toEqual(Array.from(novo));
  });
});

describe('qualidade do recorte com o buffer de luminância reaproveitado', () => {
  // Canvas falso: o analisador desenha o recorte e lê os pixels; aqui os pixels
  // vêm prontos, um conjunto por quadro.
  let quadros: Uint8ClampedArray[] = [];
  let original: typeof HTMLCanvasElement.prototype.getContext;
  beforeEach(() => {
    original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
      return {
        drawImage: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const fonte = quadros.shift() ?? new Uint8ClampedArray(w * h * 4);
          const data = new Uint8ClampedArray(w * h * 4);
          data.set(fonte.subarray(0, data.length));
          return { data, width: w, height: h };
        },
      };
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = original;
  });

  const landmarks = (): Point3D[] => {
    const p: Point3D[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const set = (i: number, x: number, y: number) => { p[i] = { x, y, z: 0 }; };
    set(33, 0.35, 0.45); set(133, 0.45, 0.45); set(159, 0.40, 0.42); set(145, 0.40, 0.48);
    set(362, 0.55, 0.45); set(263, 0.65, 0.45); set(386, 0.60, 0.42); set(374, 0.60, 0.48);
    return p;
  };
  const video = { videoWidth: 1280, videoHeight: 720 } as unknown as HTMLVideoElement;

  it('o segundo quadro (recorte MENOR que o buffer, que veio sujo) mede o mesmo que um analisador novo mediria', () => {
    const grande = rgbaAleatorio(600 * 300, 1);
    const outro = rgbaAleatorio(400 * 200, 2);
    // Analisador que reaproveita: um quadro de 1080p (recorte maior) e depois
    // um de 720p — o buffer de luminância fica maior que o necessário.
    const a = new EyeQualityAnalyzer();
    quadros = [grande, outro];
    a.analyze({ videoWidth: 1920, videoHeight: 1080 } as unknown as HTMLVideoElement, landmarks());
    const segundo = a.analyze(video, landmarks());
    // Analisador novo, só com o segundo quadro.
    const b = new EyeQualityAnalyzer();
    quadros = [outro];
    const referencia = b.analyze(video, landmarks());
    expect(segundo.brightnessEstimate).toBe(referencia.brightnessEstimate);
    expect(segundo.contrastEstimate).toBe(referencia.contrastEstimate);
    expect(segundo.blurEstimate).toBe(referencia.blurEstimate);
    expect(segundo.specularRatio).toBe(referencia.specularRatio);
  });

  // Revisão final de 22/10/2026 (R1): a máscara do quadro ANTERIOR era
  // realocada sempre que o tamanho do recorte mudava — e a bbox dos olhos varia
  // alguns pixels quase todo quadro: ~16 KB novos por quadro. Agora ela só
  // cresce, e a estabilidade sai a mesma.
  /** Pixels com manchas brancas (luminância > 0,95) que mudam de lugar com `fase`. */
  const comManchas = (fase: number): Uint8ClampedArray => {
    const p = rgbaAleatorio(600 * 300, 5 + fase).map((v) => v >> 1);
    for (let i = 0; i < 600 * 300; i++) {
      if ((i + fase * 7) % 29 < 4) { p[i * 4] = 255; p[i * 4 + 1] = 255; p[i * 4 + 2] = 255; }
    }
    return p;
  };
  const v1080 = { videoWidth: 1920, videoHeight: 1080 } as unknown as HTMLVideoElement;
  const sequencia = [v1080, video, video, v1080, v1080, video];

  it('a estabilidade da mancha é a mesma com a máscara anterior reaproveitada, com o recorte mudando de tamanho', () => {
    const a = new EyeQualityAnalyzer();
    quadros = sequencia.map((_, k) => comManchas(k));
    const longa = sequencia.map((v) => a.analyze(v, landmarks()).specularStability);
    // Referência: a estabilidade do quadro k só depende do quadro k−1.
    for (let k = 1; k < sequencia.length; k++) {
      const b = new EyeQualityAnalyzer();
      quadros = [comManchas(k - 1), comManchas(k)];
      b.analyze(sequencia[k - 1], landmarks());
      expect(longa[k]).toBe(b.analyze(sequencia[k], landmarks()).specularStability);
    }
    // A sequência mede alguma coisa: tamanhos iguais seguidos comparam máscaras.
    expect(longa.some((e) => typeof e === 'number' && e < 1)).toBe(true);
  });

  it('a máscara anterior não é realocada quando o recorte encolhe', () => {
    const a = new EyeQualityAnalyzer();
    quadros = [comManchas(0), comManchas(1), comManchas(2)];
    a.analyze(v1080, landmarks());
    const buffer = (a as unknown as { specularMaskAnterior: Uint8Array | null }).specularMaskAnterior;
    expect(buffer).not.toBeNull();
    a.analyze(video, landmarks());
    a.analyze(v1080, landmarks());
    expect((a as unknown as { specularMaskAnterior: Uint8Array | null }).specularMaskAnterior).toBe(buffer);
  });
});
