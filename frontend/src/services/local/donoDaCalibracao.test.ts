import { beforeEach, describe, expect, it } from 'vitest';
import { calibracaoEhDoPerfil, registrarDonoDaCalibracao } from './donoDaCalibracao';

describe('dono da calibração (FE-11)', () => {
  beforeEach(() => localStorage.clear());

  it('calibração antiga, sem dono: vale para quem estiver (e passa a ter dono ao ser usada)', () => {
    expect(calibracaoEhDoPerfil('ana')).toBe(true);
    registrarDonoDaCalibracao('ana');
    expect(calibracaoEhDoPerfil('ana')).toBe(true);
    expect(calibracaoEhDoPerfil('bruno')).toBe(false);
  });

  it('nova calibração de outro paciente troca o dono', () => {
    registrarDonoDaCalibracao('ana');
    registrarDonoDaCalibracao('bruno');
    expect(calibracaoEhDoPerfil('ana')).toBe(false);
    expect(calibracaoEhDoPerfil('bruno')).toBe(true);
  });
});
