import { describe, expect, it } from 'vitest';
import { mediana, passoSuave } from './estatistica';

describe('mediana', () => {
  it('ímpar, par e vazia', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBeNaN();
  });

  it('não reordena a lista de quem chamou', () => {
    const v = [3, 1, 2];
    mediana(v);
    expect(v).toEqual([3, 1, 2]);
  });
});

describe('passoSuave', () => {
  it('0 antes do começo, 1 depois do fim, ½ no meio, e sem degrau', () => {
    expect(passoSuave(-1)).toBe(0);
    expect(passoSuave(2)).toBe(1);
    expect(passoSuave(0.5)).toBe(0.5);
    // Derivada nula nas pontas: 1 % dentro da rampa, o passo ainda é mínimo.
    expect(passoSuave(0.01)).toBeLessThan(0.001);
    expect(1 - passoSuave(0.99)).toBeLessThan(0.001);
  });
});
