import { describe, it, expect } from 'vitest';
import { emGraus, emMinutos, emSegundosCurtos, numeroBr, periodoDaSemana } from './formatar';

describe('formatar', () => {
  describe('numeroBr', () => {
    it('vírgula decimal e casas fixas', () => {
      expect(numeroBr(1.5)).toBe('1,5');
      expect(numeroBr(2, 0)).toBe('2');
      expect(numeroBr(2, 2)).toBe('2,00');
      expect(numeroBr(1234.5678, 1)).toBe('1234,6');
    });

    it('o que não é número finito vira travessão, não "NaN"', () => {
      expect(numeroBr(Number.NaN)).toBe('–');
      expect(numeroBr(Number.POSITIVE_INFINITY)).toBe('–');
      expect(numeroBr(null)).toBe('–');
      expect(numeroBr(undefined)).toBe('–');
    });

    it('não mostra "-0,0" para uma variação que arredonda a zero', () => {
      expect(numeroBr(-0.04, 1)).toBe('0,0');
      expect(numeroBr(-0.4, 1)).toBe('-0,4');
    });
  });

  it('graus, minutos e segundos', () => {
    expect(emGraus(1.44)).toBe('1,4°');
    expect(emGraus(null)).toBe('–');
    expect(emMinutos(95)).toBe('95 min');
    expect(emMinutos(0)).toBe('0 min');
    expect(emSegundosCurtos(1500)).toBe('1,5 s');
    expect(emSegundosCurtos(null)).toBe('–');
  });

  it('o período da semana é "DD/MM a DD/MM"', () => {
    expect(periodoDaSemana({ inicio: '2026-10-12', fim: '2026-10-18' })).toBe('12/10 a 18/10');
  });
});
