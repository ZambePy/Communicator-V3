import { describe, expect, it } from 'vitest';
import { eulerDaMatriz, matrizDaPose } from './poseDaCabeca';

const deg = (d: number) => (d * Math.PI) / 180;

/** Matriz 4×4 em coluna-maior, como o MediaPipe entrega, a partir de R (linha-maior) e escala. */
function comoMediaPipe(r: number[], escala = 1): number[] {
  const m = new Array(16).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[4 * j + i] = r[3 * i + j] * escala;
  m[12] = 0.4;
  m[13] = 0.9;
  m[14] = -45.8;
  m[15] = 1;
  return m;
}

describe('poseDaCabeca', () => {
  it('ida e volta: ângulos → matriz → ângulos', () => {
    for (const p of [
      { yaw: deg(12), pitch: deg(-8), roll: deg(4) },
      { yaw: deg(-25), pitch: deg(15), roll: deg(-10) },
      { yaw: 0, pitch: 0, roll: 0 },
    ]) {
      const e = eulerDaMatriz(comoMediaPipe(matrizDaPose(p)));
      expect(e).not.toBeNull();
      expect(e!.yaw).toBeCloseTo(p.yaw, 9);
      expect(e!.pitch).toBeCloseTo(p.pitch, 9);
      expect(e!.roll).toBeCloseTo(p.roll, 9);
    }
  });

  it('a escala do Procrustes não muda os ângulos', () => {
    const p = { yaw: deg(10), pitch: deg(20), roll: deg(-5) };
    const e = eulerDaMatriz(comoMediaPipe(matrizDaPose(p), 1.08));
    expect(e!.pitch).toBeCloseTo(p.pitch, 9);
    expect(e!.yaw).toBeCloseTo(p.yaw, 9);
  });

  it('a matriz reconstruída é uma rotação pura (ortonormal, det = 1)', () => {
    const r = matrizDaPose({ yaw: deg(33), pitch: deg(-12), roll: deg(7) });
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let dot = 0;
        for (let k = 0; k < 3; k++) dot += r[3 * k + i] * r[3 * k + j];
        expect(dot).toBeCloseTo(i === j ? 1 : 0, 12);
      }
    }
    const det =
      r[0] * (r[4] * r[8] - r[5] * r[7]) - r[1] * (r[3] * r[8] - r[5] * r[6]) + r[2] * (r[3] * r[7] - r[4] * r[6]);
    expect(det).toBeCloseTo(1, 12);
  });

  it('matriz ausente, curta ou com NaN devolve null', () => {
    expect(eulerDaMatriz(null)).toBeNull();
    expect(eulerDaMatriz([1, 0, 0])).toBeNull();
    const m = comoMediaPipe(matrizDaPose({ yaw: 0, pitch: 0, roll: 0 }));
    m[9] = NaN;
    expect(eulerDaMatriz(m)).toBeNull();
  });
});
