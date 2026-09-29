import { describe, expect, it } from 'vitest';
import { RidgeRegressor, alavancaDosGrupos, type RidgeModel } from './ridge';

/**
 * Peças do Ridge que a calibração robusta (M6) usa: a alavanca de cada alvo,
 * que estudentiza o resíduo do Huber, e o peso do alvo no critério da
 * validação cruzada.
 */

describe('alavancaDosGrupos', () => {
  it('bate com a forma fechada nos mínimos quadrados: h_g = n_g·φ̄ᵀ(ΦᵀΦ)⁻¹φ̄', () => {
    // Uma feature, três alvos em −1, 0, +1 com n quadros idênticos cada:
    // ΦᵀΦ = [[3n, 0], [0, 2n]] ⇒ h = 1/3 + x²/2.
    const n = 10;
    const features: number[][] = [];
    const grupos: string[] = [];
    for (const [g, x] of [['a', -1], ['b', 0], ['c', 1]] as const) {
      for (let i = 0; i < n; i++) { features.push([x]); grupos.push(g); }
    }
    const h = alavancaDosGrupos(features, grupos, null, { x: 1e-12, y: 1e-12 }, null);
    expect(h.get('a')!.x).toBeCloseTo(1 / 3 + 1 / 2, 6);
    expect(h.get('b')!.x).toBeCloseTo(1 / 3, 6);
    expect(h.get('c')!.y).toBeCloseTo(1 / 3 + 1 / 2, 6);
    // Somam o número de parâmetros (intercepto + 1).
    const soma = [...h.values()].reduce((s, v) => s + v.x, 0);
    expect(soma).toBeCloseTo(2, 6);
  });

  it('a penalidade reduz a alavanca dos alvos da ponta', () => {
    const features: number[][] = [];
    const grupos: string[] = [];
    for (const [g, x] of [['a', -1], ['b', 0], ['c', 1]] as const) {
      for (let i = 0; i < 5; i++) { features.push([x]); grupos.push(g); }
    }
    const sem = alavancaDosGrupos(features, grupos, null, { x: 1e-12, y: 1e-12 }, null).get('a')!.x;
    const com = alavancaDosGrupos(features, grupos, null, { x: 1, y: 1 }, null).get('a')!.x;
    expect(com).toBeLessThan(sem);
  });

  it('sem amostras: mapa vazio', () => {
    expect(alavancaDosGrupos([], [], null, { x: 1, y: 1 }, null).size).toBe(0);
  });
});

describe('pesoDoAlvoNoCV', () => {
  function conjunto() {
    const features: number[][] = [];
    const tx: number[] = [];
    const ty: number[] = [];
    const grupos: string[] = [];
    const alvos = [[0.1, 0.1], [0.5, 0.1], [0.9, 0.1], [0.1, 0.5], [0.5, 0.5], [0.9, 0.5], [0.1, 0.9], [0.5, 0.9], [0.9, 0.9]];
    alvos.forEach(([a, b], k) => {
      for (let i = 0; i < 8; i++) {
        features.push([a + Math.sin(k * 3 + i) * 0.01, b + Math.cos(k * 7 + i) * 0.01]);
        // O alvo 4 foi "mal olhado": rótulo deslocado.
        tx.push(100 + 800 * a + (k === 4 ? 150 : 0));
        ty.push(50 + 600 * b);
        grupos.push(`${k}`);
      }
    });
    return { features, tx, ty, grupos };
  }
  const lambdaDe = (r: RidgeRegressor) => {
    const m = r.getModel() as RidgeModel;
    return { x: m.lambdaX, y: m.lambdaY };
  };

  it('todos os alvos com peso 1 escolhem o mesmo λ de sem o mapa', () => {
    const d = conjunto();
    const a = new RidgeRegressor();
    a.train(d.features, d.tx, d.ty, d.grupos);
    const b = new RidgeRegressor();
    b.train(d.features, d.tx, d.ty, d.grupos, undefined, undefined, new Map(d.grupos.map((g) => [g, 1])));
    expect(lambdaDe(b)).toEqual(lambdaDe(a));
  });

  it('o critério é normalizado: pesos todos multiplicados pela mesma constante não mudam λ', () => {
    const d = conjunto();
    const a = new RidgeRegressor();
    a.train(d.features, d.tx, d.ty, d.grupos, undefined, undefined, new Map([['4', 0.3]]));
    const b = new RidgeRegressor();
    b.train(d.features, d.tx, d.ty, d.grupos, undefined, undefined,
      new Map(d.grupos.map((g) => [g, g === '4' ? 0.15 : 0.5])));
    expect(lambdaDe(b)).toEqual(lambdaDe(a));
  });

  it('nenhum alvo com peso: recua para o λ mais regularizado, sem NaN', () => {
    const d = conjunto();
    const r = new RidgeRegressor();
    r.train(d.features, d.tx, d.ty, d.grupos, undefined, undefined, new Map(d.grupos.map((g) => [g, 0])));
    const l = lambdaDe(r);
    expect(Number.isFinite(l.x)).toBe(true);
    expect(l.x).toBe(l.y);
  });
});
