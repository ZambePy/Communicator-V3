import { describe, expect, it } from 'vitest';
import { olharNoReferencialDaCabeca } from './referencialDaCabeca';
import { matrizDaPose } from './poseDaCabeca';

const deg = (d: number) => (d * Math.PI) / 180;
const W = 1920;
const H = 1080;
const FOV = 70.4; // C920 na horizontal (Logitech)

function naCabeca(
  olhar: { yaw: number; pitch: number },
  pose: { yaw: number; pitch: number; roll: number },
  olhoPx = { x: W / 2, y: H / 2 },
) {
  const r = olharNoReferencialDaCabeca({
    olhar,
    olhoPx,
    larguraVideo: W,
    alturaVideo: H,
    fovHorizontalDeg: FOV,
    rotacao: matrizDaPose(pose),
  });
  if (!r) throw new Error('entrada recusada');
  return { yaw: (r.yaw * 180) / Math.PI, pitch: (r.pitch * 180) / Math.PI };
}

const FRONTAL = { yaw: 0, pitch: 0, roll: 0 };

/**
 * Tabela de sinais (docs/PESQUISA.md §1.2 e M4). Convenções:
 *  - L2CS: yaw > 0 = olhar para a direita da pessoa; pitch > 0 = para cima.
 *  - pose (MediaPipe): yaw > 0 = cabeça para a esquerda da pessoa; pitch > 0 = para baixo.
 *  - saída: yaw_h > 0 = olhar para a esquerda da pessoa; pitch_h > 0 = para cima,
 *    o mesmo sentido do offset da íris no referencial da cabeça.
 */
describe('olharNoReferencialDaCabeca', () => {
  it('cabeça de frente, rosto no centro: só troca o sinal do yaw', () => {
    const a = naCabeca({ yaw: deg(10), pitch: 0 }, FRONTAL);
    expect(a.yaw).toBeCloseTo(-10, 6);
    expect(a.pitch).toBeCloseTo(0, 6);
    const b = naCabeca({ yaw: 0, pitch: deg(10) }, FRONTAL);
    expect(b.yaw).toBeCloseTo(0, 6);
    expect(b.pitch).toBeCloseTo(10, 6);
  });

  it('cabeça gira Δ em yaw com o olhar parado: o olhar na cabeça anda −Δ, como a íris', () => {
    // O L2CS mede no referencial do raio: com o olho no mesmo lugar e o alvo
    // fixo, a saída da rede não muda. Só a cabeça girou.
    for (const olhar of [{ yaw: 0, pitch: 0 }, { yaw: deg(12), pitch: 0 }, { yaw: deg(-7), pitch: 0 }]) {
      const antes = naCabeca(olhar, FRONTAL);
      const depois = naCabeca(olhar, { yaw: deg(5), pitch: 0, roll: 0 });
      expect(depois.yaw - antes.yaw).toBeCloseTo(-5, 6);
    }
  });

  it('cabeça abaixa Δ com o olhar parado: o olho sobe na órbita, pitch_h anda +Δ', () => {
    const antes = naCabeca({ yaw: 0, pitch: 0 }, FRONTAL);
    const depois = naCabeca({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: deg(5), roll: 0 });
    expect(depois.pitch - antes.pitch).toBeCloseTo(5, 6);
    expect(depois.yaw).toBeCloseTo(0, 6);
  });

  it('roll puro com o olhar na câmera não mexe no olhar', () => {
    const r = naCabeca({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0, roll: deg(10) });
    expect(r.yaw).toBeCloseTo(0, 6);
    expect(r.pitch).toBeCloseTo(0, 6);
  });

  it('roll de 10° com o olhar a 20° na horizontal: o olhar gira junto no plano da cabeça', () => {
    const r = naCabeca({ yaw: deg(20), pitch: 0 }, { yaw: 0, pitch: 0, roll: deg(10) });
    // −20° girado de −10° no plano (x, y) da cabeça.
    expect(r.yaw).toBeCloseTo(-19.72, 1);
    expect(r.pitch).toBeCloseTo(3.4, 1);
  });

  it('rosto 10 cm abaixo do eixo a 60 cm: olhar para a câmera é olhar para cima na cabeça', () => {
    const f = W / 2 / Math.tan(deg(FOV / 2));
    const r = naCabeca({ yaw: 0, pitch: 0 }, FRONTAL, { x: W / 2, y: H / 2 + f * (10 / 60) });
    expect(r.yaw).toBeCloseTo(0, 6);
    expect(r.pitch).toBeCloseTo((Math.atan(10 / 60) * 180) / Math.PI, 4);
  });

  it('recusa entradas sem sentido em vez de devolver NaN', () => {
    const base = {
      olhar: { yaw: 0, pitch: 0 },
      olhoPx: { x: W / 2, y: H / 2 },
      larguraVideo: W,
      alturaVideo: H,
      fovHorizontalDeg: FOV,
      rotacao: matrizDaPose(FRONTAL),
    };
    expect(olharNoReferencialDaCabeca({ ...base, olhar: { yaw: NaN, pitch: 0 } })).toBeNull();
    expect(olharNoReferencialDaCabeca({ ...base, larguraVideo: 0 })).toBeNull();
    expect(olharNoReferencialDaCabeca({ ...base, fovHorizontalDeg: 0 })).toBeNull();
    expect(olharNoReferencialDaCabeca({ ...base, rotacao: [1, 0, 0] })).toBeNull();
  });
});
