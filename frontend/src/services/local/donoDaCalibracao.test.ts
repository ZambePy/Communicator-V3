import { beforeEach, describe, expect, it } from 'vitest';
import { PROFILES_STORAGE_KEY } from '@tracker/calibration';
import { migrarDonoLegadoDaCalibracao } from './donoDaCalibracao';

describe('migração do dono da calibração (calibração por paciente)', () => {
  beforeEach(() => localStorage.clear());

  const gravar = (lista: unknown[]) => localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(lista));
  const donos = () =>
    (JSON.parse(localStorage.getItem(PROFILES_STORAGE_KEY) ?? '[]') as { meta: { paciente?: string } }[]).map(
      (p) => p.meta.paciente ?? null,
    );

  it('as calibrações antigas passam a ser do dono anotado, e a anotação sai', () => {
    gravar([{ meta: { id: 'x', createdAt: '2026-09-01T00:00:00Z' } }, { meta: { id: 'y', createdAt: '2026-09-02T00:00:00Z', paciente: 'bruno' } }]);
    localStorage.setItem('irisflow.calibracao.dono', 'ana');
    migrarDonoLegadoDaCalibracao();
    expect(donos()).toEqual(['ana', 'bruno']);
    expect(localStorage.getItem('irisflow.calibracao.dono')).toBeNull();
  });

  it('sem anotação, nada muda (a antiga fica para o primeiro paciente que a carregar)', () => {
    gravar([{ meta: { id: 'x', createdAt: '2026-09-01T00:00:00Z' } }]);
    migrarDonoLegadoDaCalibracao();
    expect(donos()).toEqual([null]);
  });
});
