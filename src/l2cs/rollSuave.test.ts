import { describe, it, expect } from 'vitest';
import { suavizarRoll, TAU_MS } from './rollSuave';

describe('suavizarRoll', () => {
  it('primeiro quadro adota o bruto', () => {
    expect(suavizarRoll(null, 0.2, 1000)).toEqual({ valor: 0.2, tMs: 1000 });
  });
  it('tremor de ±0,5° a 30 Hz sai com amplitude bem menor', () => {
    let e = suavizarRoll(null, 0, 0);
    const grau = Math.PI / 180;
    let max = 0;
    for (let i = 1; i <= 60; i++) {
      e = suavizarRoll(e, (i % 2 ? 0.5 : -0.5) * grau, i * 33);
      if (i > 10) max = Math.max(max, Math.abs(e.valor));
    }
    expect(max).toBeLessThan(0.15 * grau);
  });
  it('inclinação real de 15° em 1 s entra quase inteira (> 95 %) ao fim do segundo', () => {
    const grau = Math.PI / 180;
    let e = suavizarRoll(null, 0, 0);
    for (let i = 1; i <= 30; i++) e = suavizarRoll(e, 15 * grau, i * 33);
    expect(e.valor / (15 * grau)).toBeGreaterThan(0.95);
  });
  it('dt zero não altera; NaN é ignorado', () => {
    const e = suavizarRoll(null, 0.1, 5);
    expect(suavizarRoll(e, 0.9, 5)).toBe(e);
    expect(suavizarRoll(e, NaN, 50)).toBe(e);
  });
  it('a constante de tempo é curta (abaixo de 200 ms): não é filtro de pose, é anti-tremor', () => {
    expect(TAU_MS).toBeLessThanOrEqual(200);
  });
});
