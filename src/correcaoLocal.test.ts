import { describe, expect, it } from 'vitest';
import {
  ajustarCorrecaoLocal,
  aplicarCorrecaoLocal,
  correcaoLocalValida,
  ELL_DA_CORRECAO_LOCAL,
  RESIDUO_MAXIMO_DA_CORRECAO,
  RUIDO_DA_CORRECAO_LOCAL,
  type AlvoDaCorrecao,
} from './correcaoLocal';

// Grade interna de referência (1920×1080, 23,6" a 60 cm) e os quatro cantos da
// tela, com a predição média do modelo global desviada nos cantos.
const GRADE: AlvoDaCorrecao[] = [
  [0.17, 0.05], [0.5, 0.05], [0.83, 0.05],
  [0.17, 0.5], [0.5, 0.5], [0.83, 0.5],
  [0.17, 0.8375], [0.5, 0.8375], [0.83, 0.8375],
].map(([x, y]) => ({ alvo: { x, y }, predicaoMedia: { x, y }, foraDaGrade: false }));

const CANTOS: AlvoDaCorrecao[] = [
  { alvo: { x: 0.05, y: 0.05 }, predicaoMedia: { x: 0.06, y: 0.07 }, foraDaGrade: true },
  { alvo: { x: 0.95, y: 0.05 }, predicaoMedia: { x: 0.93, y: 0.04 }, foraDaGrade: true },
  { alvo: { x: 0.05, y: 0.95 }, predicaoMedia: { x: 0.05, y: 0.90 }, foraDaGrade: true },
  { alvo: { x: 0.95, y: 0.95 }, predicaoMedia: { x: 0.96, y: 0.93 }, foraDaGrade: true },
];

describe('correção local dos cantos — o ajuste', () => {
  it('sem alvo fora da grade não há correção (modo rápido, grade só interna)', () => {
    expect(ajustarCorrecaoLocal(GRADE).correcao).toBeNull();
  });

  it('bate com a fórmula do processo gaussiano: Δ(p) = k(p)ᵀ (K + σ²I)⁻¹ r', () => {
    // Valores de referência calculados com numpy (np.linalg.solve) sobre os
    // mesmos 13 pontos, ℓ = 0,1 e σ² = 0,1.
    const { correcao } = ajustarCorrecaoLocal([...GRADE, ...CANTOS]);
    expect(correcao).not.toBeNull();
    expect(correcao!.ell).toBe(ELL_DA_CORRECAO_LOCAL);
    const noCanto = aplicarCorrecaoLocal(correcao, { x: 0.06, y: 0.07 });
    expect(noCanto.x - 0.06).toBeCloseTo(-0.00880888, 7);
    expect(noCanto.y - 0.07).toBeCloseTo(-0.01761774, 7);
    const embaixo = aplicarCorrecaoLocal(correcao, { x: 0.05, y: 0.9 });
    expect(embaixo.x - 0.05).toBeCloseTo(0, 7);
    expect(embaixo.y - 0.9).toBeCloseTo(0.04476032, 7);
    expect(correcao!.alfa[9].x).toBeCloseTo(-0.01191119, 7);
    expect(correcao!.alfa[12].y).toBeCloseTo(0.01944202, 7);
  });

  it('puxa o canto para o alvo (sem passar dele) e deixa o miolo intacto', () => {
    const { correcao } = ajustarCorrecaoLocal([...GRADE, ...CANTOS]);
    for (const c of CANTOS) {
      const p = aplicarCorrecaoLocal(correcao, c.predicaoMedia);
      const antes = Math.hypot(c.alvo.x - c.predicaoMedia.x, c.alvo.y - c.predicaoMedia.y);
      const depois = Math.hypot(c.alvo.x - p.x, c.alvo.y - p.y);
      expect(depois).toBeLessThan(antes * 0.3);
    }
    // No centro da tela a correção é nula na prática (< 0,01 px).
    const centro = aplicarCorrecaoLocal(correcao, { x: 0.5, y: 0.5 });
    expect(Math.abs(centro.x - 0.5) * 1920).toBeLessThan(0.01);
    expect(Math.abs(centro.y - 0.5) * 1080).toBeLessThan(0.01);
    // Na âncora vizinha do canto sobra pouco (a âncora segura o modelo global).
    const ancora = aplicarCorrecaoLocal(correcao, { x: 0.17, y: 0.05 });
    expect(Math.abs(ancora.x - 0.17) * 1920).toBeLessThan(2);
    expect(Math.abs(ancora.y - 0.05) * 1080).toBeLessThan(2);
  });

  it('um canto isolado é corrigido pela fração 1/(1+σ²) do resíduo', () => {
    const { correcao } = ajustarCorrecaoLocal([
      { alvo: { x: 0.05, y: 0.05 }, predicaoMedia: { x: 0.08, y: 0.09 }, foraDaGrade: true },
      { alvo: { x: 0.5, y: 0.5 }, predicaoMedia: { x: 0.5, y: 0.5 }, foraDaGrade: false },
    ]);
    const p = aplicarCorrecaoLocal(correcao, { x: 0.08, y: 0.09 });
    const f = 1 / (1 + RUIDO_DA_CORRECAO_LOCAL);
    expect(p.x - 0.08).toBeCloseTo(-0.03 * f, 4);
    expect(p.y - 0.09).toBeCloseTo(-0.04 * f, 4);
  });

  it('resíduo implausível não vira correção: o canto é descartado e vira âncora', () => {
    const r = RESIDUO_MAXIMO_DA_CORRECAO + 0.05;
    const { correcao, descartados } = ajustarCorrecaoLocal([
      ...GRADE,
      { alvo: { x: 0.05, y: 0.05 }, predicaoMedia: { x: 0.05 + r, y: 0.05 }, foraDaGrade: true },
    ]);
    expect(correcao).toBeNull();
    expect(descartados).toEqual([{ x: 0.05, y: 0.05 }]);
  });

  it('valores não finitos ficam de fora sem contaminar o resto', () => {
    const { correcao } = ajustarCorrecaoLocal([
      ...GRADE,
      ...CANTOS,
      { alvo: { x: 0.5, y: 0.95 }, predicaoMedia: { x: Number.NaN, y: 0.9 }, foraDaGrade: true },
    ]);
    expect(correcao).not.toBeNull();
    expect(correcao!.centros).toHaveLength(13);
  });
});

describe('correção local dos cantos — aplicação e disco', () => {
  it('sem correção, o ponto passa intacto', () => {
    expect(aplicarCorrecaoLocal(null, { x: 0.3, y: 0.7 })).toEqual({ x: 0.3, y: 0.7 });
  });

  it('a correção validada volta igual; lixo do disco vira null', () => {
    const { correcao } = ajustarCorrecaoLocal([...GRADE, ...CANTOS]);
    const copia = correcaoLocalValida(JSON.parse(JSON.stringify(correcao)));
    expect(copia).toEqual(correcao);
    expect(correcaoLocalValida(null)).toBeNull();
    expect(correcaoLocalValida({})).toBeNull();
    expect(correcaoLocalValida({ centros: [{ x: 0, y: 0 }], alfa: [], ell: 0.1 })).toBeNull();
    expect(correcaoLocalValida({ centros: [{ x: 0, y: 0 }], alfa: [{ x: 'a', y: 0 }], ell: 0.1 })).toBeNull();
    expect(correcaoLocalValida({ centros: [{ x: 0, y: 0 }], alfa: [{ x: 0, y: 0 }], ell: 0 })).toBeNull();
    expect(correcaoLocalValida({ centros: [{ x: 0, y: 0 }], alfa: [{ x: 0, y: 0 }], ell: Infinity })).toBeNull();
  });
});
