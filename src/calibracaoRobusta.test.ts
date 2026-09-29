import { describe, expect, it } from 'vitest';
import {
  CORTE_FIM,
  CORTE_INICIO,
  FATOR_MAD,
  K_HUBER,
  escalaRobusta,
  pesoDeHuber,
  pesosRobustosPorQuadro,
} from './calibracaoRobusta';

describe('pesoDeHuber', () => {
  it('1 até k, k/|u| depois, 0 para não finito', () => {
    expect(pesoDeHuber(0)).toBe(1);
    expect(pesoDeHuber(-K_HUBER)).toBe(1);
    expect(pesoDeHuber(2 * K_HUBER)).toBeCloseTo(0.5, 12);
    expect(pesoDeHuber(-4 * K_HUBER)).toBeCloseTo(0.25, 12);
    expect(pesoDeHuber(Number.NaN)).toBe(0);
  });

  it('contínuo em |u| = k', () => {
    expect(pesoDeHuber(K_HUBER + 1e-9)).toBeCloseTo(1, 6);
  });
});

describe('escalaRobusta', () => {
  it('1,4826·MAD em torno de zero, com piso', () => {
    expect(escalaRobusta([1, -1, 2, -2, 3], 0)).toBeCloseTo(FATOR_MAD * 2, 12);
    expect(escalaRobusta([0.001, -0.001], 0.5)).toBe(0.5);
    expect(escalaRobusta([], 0.3)).toBe(0.3);
  });

  it('um resíduo enorme não mexe na escala', () => {
    const base = [1, -1, 2, -2, 1.5, -1.5, 0.5];
    expect(escalaRobusta([...base, 1000], 0)).toBeLessThan(escalaRobusta(base, 0) * 1.3);
  });
});

describe('pesosRobustosPorQuadro', () => {
  /** Alvo com 20 quadros em torno de (x, y), espalhados de forma determinística. */
  function alvo(grupo: string, cx: number, cy: number) {
    const f: number[][] = [];
    for (let i = 0; i < 20; i++) f.push([cx + ((i % 5) - 2) * 0.01, cy + ((i % 4) - 1.5) * 0.01, 7]);
    return { f, g: f.map(() => grupo) };
  }

  it('quadro normal pesa 1; piscada (desvio enorme numa feature) pesa 0', () => {
    const a = alvo('a', 0, 0);
    a.f[7] = [0, 0.9, 7];
    const w = pesosRobustosPorQuadro(a.f, a.g);
    expect(w[7]).toBe(0);
    expect(w.filter((v, i) => i !== 7).every((v) => v === 1)).toBe(true);
  });

  it('entre 3 e 4 MAD a rampa é contínua', () => {
    const a = alvo('a', 0, 0);
    // Escala robusta da coluna 0 dentro do alvo.
    const col = a.f.map((q) => q[0]);
    const med = [...col].sort((p, q) => p - q)[10];
    const mad = [...col.map((v) => Math.abs(v - med))].sort((p, q) => p - q);
    const escala = FATOR_MAD * (mad[9] + mad[10]) / 2;
    const meio = (CORTE_INICIO + CORTE_FIM) / 2;
    a.f[3] = [med + meio * escala, a.f[3][1], 7];
    const w = pesosRobustosPorQuadro(a.f, a.g);
    expect(w[3]).toBeGreaterThan(0.2);
    expect(w[3]).toBeLessThan(0.8);
  });

  it('feature constante no alvo não vira divisão por zero (piso de 10 % da sessão)', () => {
    const a = alvo('a', 0, 0);
    const b = alvo('b', 1, 1);
    // Coluna 2 constante em cada alvo, mas diferente entre alvos: MAD zero dentro.
    b.f.forEach((q) => { q[2] = 9; });
    const w = pesosRobustosPorQuadro([...a.f, ...b.f], [...a.g, ...b.g]);
    expect(w.every((v) => v === 1)).toBe(true);
  });

  it('alvo com menos de 5 quadros fica como está', () => {
    const f = [[0, 0], [0, 0], [5, 5], [0, 0]];
    expect(pesosRobustosPorQuadro(f, ['a', 'a', 'a', 'a'])).toEqual([1, 1, 1, 1]);
    expect(pesosRobustosPorQuadro([], [])).toEqual([]);
  });

  it('feature não finita pesa 0', () => {
    const a = alvo('a', 0, 0);
    a.f[2] = [Number.NaN, 0, 7];
    expect(pesosRobustosPorQuadro(a.f, a.g)[2]).toBe(0);
  });
});
