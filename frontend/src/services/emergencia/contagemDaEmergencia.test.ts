import { describe, it, expect } from 'vitest';
import {
  CONTAGEM_PADRAO_S, CONTAGEM_MIN_S, CONTAGEM_MAX_S, limitarContagemDaEmergencia,
} from './contagemDaEmergencia';

// Decisão 5 da rodada 3 (21/10/2026): a contagem da Emergência é ajustável de
// 3 a 10 s, padrão 5. O que a faixa protege:
//  - um valor ruim NUNCA pode zerar a contagem — com 0 o pedido de socorro
//    sairia no mesmo instante, sem CANCELAR, e um engano viraria alarme;
//  - um valor ruim nunca pode estender a contagem sem fim — o socorro de
//    verdade ficaria esperando.

describe('faixa da contagem da Emergência', () => {
  it('o padrão é o de sempre (5 s) e os limites são 3 e 10', () => {
    expect(CONTAGEM_PADRAO_S).toBe(5);
    expect(CONTAGEM_MIN_S).toBe(3);
    expect(CONTAGEM_MAX_S).toBe(10);
  });

  it.each([3, 4, 5, 7, 10])('%i s fica como está', (s) => {
    expect(limitarContagemDaEmergencia(s)).toBe(s);
  });

  it('abaixo do mínimo sobe para 3 s — inclusive 0 e negativos, que mandariam o socorro na hora', () => {
    expect(limitarContagemDaEmergencia(2)).toBe(CONTAGEM_MIN_S);
    expect(limitarContagemDaEmergencia(1)).toBe(CONTAGEM_MIN_S);
    expect(limitarContagemDaEmergencia(0)).toBe(CONTAGEM_MIN_S);
    expect(limitarContagemDaEmergencia(-5)).toBe(CONTAGEM_MIN_S);
  });

  it('acima do máximo desce para 10 s', () => {
    expect(limitarContagemDaEmergencia(11)).toBe(CONTAGEM_MAX_S);
    expect(limitarContagemDaEmergencia(99)).toBe(CONTAGEM_MAX_S);
  });

  it('o que não é um número válido volta ao padrão, não a um limite', () => {
    for (const ruim of [NaN, Infinity, -Infinity, undefined, null, '7', '', {}, [], true]) {
      expect(limitarContagemDaEmergencia(ruim as unknown as number), String(ruim)).toBe(CONTAGEM_PADRAO_S);
    }
  });

  it('fração arredonda para o segundo inteiro (a contagem anda de 1 em 1 s)', () => {
    expect(limitarContagemDaEmergencia(4.4)).toBe(4);
    expect(limitarContagemDaEmergencia(4.6)).toBe(5);
    expect(limitarContagemDaEmergencia(2.6)).toBe(3);
    expect(limitarContagemDaEmergencia(10.4)).toBe(10);
  });
});
