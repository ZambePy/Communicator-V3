import { describe, expect, it } from 'vitest';
import {
  montarGeometria,
  olhoNaCamera,
  pontoDaTela,
  posicaoDaCameraValida,
  raioNaTela,
  reprojetar,
  type Vetor3,
} from './geometria6dof';
import { matrizDaPose } from './poseDaCabeca';

// Posto de referência: 23,6" a 1920×1080.
const PX_POR_CM = Math.hypot(1920, 1080) / (23.6 * 2.54);
const G = montarGeometria('topo', 1920, 1080, PX_POR_CM)!;
const OLHO: Vetor3 = [0, 12, 60];
const FRENTE = matrizDaPose({ yaw: 0, pitch: 0, roll: 0 });
const ALVOS = [
  { x: 480, y: 270 }, { x: 960, y: 540 }, { x: 1440, y: 810 }, { x: 96, y: 1026 }, { x: 1824, y: 54 },
];
const GRAU = Math.PI / 180;

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('geometria da tela', () => {
  it('ponto da tela e raio são inversos um do outro, nas três posições', () => {
    for (const posicao of ['topo', 'base', 'notebook'] as const) {
      const g = montarGeometria(posicao, 1920, 1080, PX_POR_CM)!;
      for (const a of ALVOS) {
        const t = pontoDaTela(g, a.x, a.y);
        const d: Vetor3 = [t[0] - OLHO[0], t[1] - OLHO[1], t[2] - OLHO[2]];
        const p = raioNaTela(g, OLHO, d)!;
        expect(dist(p, a)).toBeLessThan(1e-9);
      }
    }
  });

  it('direita da pessoa é a esquerda da imagem; base fica acima da câmera', () => {
    expect(pontoDaTela(G, 1920, 0)[0]).toBeLessThan(0);
    const base = montarGeometria('base', 1920, 1080, PX_POR_CM)!;
    expect(pontoDaTela(base, 960, 0)[1]).toBeLessThan(0);
    expect(pontoDaTela(base, 960, 1080)[1]).toBeCloseTo(0, 12);
  });

  it('sem interseção à frente e geometria inválida: null', () => {
    expect(raioNaTela(G, OLHO, [0, 0, 1])).toBeNull();
    expect(montarGeometria('topo', 0, 1080, PX_POR_CM)).toBeNull();
    expect(posicaoDaCameraValida('topo')).toBe('topo');
    expect(posicaoDaCameraValida('lateral')).toBeNull();
  });
});

describe('olhoNaCamera', () => {
  it('distância pelo tamanho cantal, e de lado a projeção encolhida é corrigida', () => {
    // f = 640/tan(35°) ≈ 914 px; 9 cm a 60 cm ≈ 137 px.
    const f = 640 / Math.tan(35 * GRAU);
    const px = (f * 9) / 60;
    const frente = olhoNaCamera({ x: 640, y: 360 }, { largura: 1280, altura: 720 }, 70, { px, cm: 9, yawRad: 0 })!;
    expect(frente[2]).toBeCloseTo(60, 9);
    expect(frente[0]).toBeCloseTo(0, 9);
    const deLado = olhoNaCamera(
      { x: 640, y: 360 }, { largura: 1280, altura: 720 }, 70,
      { px: px * Math.cos(30 * GRAU), cm: 9, yawRad: 30 * GRAU },
    )!;
    expect(deLado[2]).toBeCloseTo(60, 9);
    expect(olhoNaCamera({ x: 1, y: 1 }, { largura: 0, altura: 720 }, 70, { px, cm: 9, yawRad: 0 })).toBeNull();
  });
});

describe('reprojetar', () => {
  it('idêntica na postura de referência (Δ = 0)', () => {
    for (const a of ALVOS) {
      expect(dist(reprojetar(G, a, OLHO, FRENTE, OLHO, FRENTE)!, a)).toBeLessThan(1e-9);
    }
  });

  it('translação paralela à tela move o ponto exatamente o mesmo tanto', () => {
    const lado: Vetor3 = [10, 12, 60];
    for (const a of ALVOS) {
      const p = reprojetar(G, a, OLHO, FRENTE, lado, FRENTE)!;
      // +10 cm em x da câmera = 10 cm para a esquerda da pessoa.
      expect(p.x - a.x).toBeCloseTo(-10 * PX_POR_CM, 6);
      expect(p.y - a.y).toBeCloseTo(0, 6);
    }
  });

  it('rotação: d·[tan(θ₀ + Δ) − tan θ₀], não d·tan Δ, e no sentido da convenção', () => {
    // Alvo 20 cm à direita da pessoa, na altura do olho. Cabeça virada 10°
    // para a esquerda da pessoa (yaw > 0), olho parado na cabeça.
    const alvo = { x: 960 + 20 * PX_POR_CM, y: 12 * PX_POR_CM };
    const p = reprojetar(G, alvo, OLHO, FRENTE, OLHO, matrizDaPose({ yaw: 10 * GRAU, pitch: 0, roll: 0 }))!;
    const th0 = Math.atan(20 / 60);
    const exato = 60 * (Math.tan(th0 - 10 * GRAU) - Math.tan(th0)) * PX_POR_CM;
    expect(p.x - alvo.x).toBeCloseTo(exato, 6);
    // A aproximação de primeira ordem (d·tan Δ) erra ~19 px aqui.
    expect(Math.abs(exato - -60 * Math.tan(10 * GRAU) * PX_POR_CM)).toBeGreaterThan(15);
    // Pitch > 0 é a cabeça para baixo: o ponto desce.
    const q = reprojetar(G, { x: 960, y: 700 }, OLHO, FRENTE, OLHO, matrizDaPose({ yaw: 0, pitch: 10 * GRAU, roll: 0 }))!;
    expect(q.y).toBeGreaterThan(700);
  });

  it('erro de geometria entra em segunda ordem (contas de docs/PESQUISA.md §5, M12)', () => {
    // Reclinar: olho 10 cm para trás e 5 cm para baixo, cabeça 5,7° para baixo.
    const olho: Vetor3 = [0, 17, 70];
    const rot = matrizDaPose({ yaw: 0, pitch: 0.1, roll: 0 });
    const rotX = (t: number, v: Vetor3): Vetor3 =>
      [v[0], Math.cos(t) * v[1] - Math.sin(t) * v[2], Math.sin(t) * v[1] + Math.cos(t) * v[2]];
    const rotM = (t: number, r: number[]) => {
      const c = Math.cos(t);
      const s = Math.sin(t);
      const a = [1, 0, 0, 0, c, -s, 0, s, c];
      return [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[3 * i] * r[j] + a[3 * i + 1] * r[3 + j] + a[3 * i + 2] * r[6 + j]));
    };
    let correcaoMin = Infinity;
    let erroBorda = 0;
    let erroInclinacao = 0;
    for (const a of ALVOS) {
      const p = reprojetar(G, a, OLHO, FRENTE, olho, rot)!;
      correcaoMin = Math.min(correcaoMin, dist(p, a));
      // Lente 3 cm fora do lugar suposto: tudo desloca 3 cm em relação à tela.
      const mais3 = (v: Vetor3): Vetor3 => [v[0], v[1] + 3, v[2]];
      erroBorda = Math.max(erroBorda, dist(reprojetar(G, a, mais3(OLHO), FRENTE, mais3(olho), rot)!, p));
      // Câmera 5° inclinada sem que o modelo saiba.
      const t = 5 * GRAU;
      erroInclinacao = Math.max(erroInclinacao, dist(reprojetar(G, a, rotX(t, OLHO), rotM(t, FRENTE), rotX(t, olho), rotM(t, rot))!, p));
    }
    // A correção passa de 400 px; o erro de geometria fica em ~7 % dela.
    expect(correcaoMin).toBeGreaterThan(400);
    expect(erroBorda).toBeLessThan(30);
    expect(erroInclinacao).toBeLessThan(30);
  });
});
