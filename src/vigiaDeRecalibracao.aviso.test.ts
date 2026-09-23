import { describe, it, expect } from 'vitest';
import {
  consultar, dispensar, resolvido, estadoInicialDoAviso, CONSULTAS_SEGUIDAS, SONECA_MS, detalheDoMotivo,
} from './vigiaDeRecalibracao.aviso';

const SIM = { precisa: true, motivo: 'bcea' as const };
const NAO = { precisa: false, motivo: null };

describe('aviso de recalibração — política de exibição', () => {
  it('uma única consulta positiva não mostra nada; a segunda seguida mostra', () => {
    let e = estadoInicialDoAviso();
    e = consultar(e, SIM, 0);
    expect(e.motivoExibido).toBeNull();
    e = consultar(e, SIM, 15_000);
    expect(e.motivoExibido).toBe('bcea');
    expect(CONSULTAS_SEGUIDAS).toBe(2);
  });

  it('uma negativa no meio zera a contagem (oscilação em torno do limiar não acusa)', () => {
    let e = estadoInicialDoAviso();
    e = consultar(e, SIM, 0);
    e = consultar(e, NAO, 15_000);
    e = consultar(e, SIM, 30_000);
    expect(e.motivoExibido).toBeNull();
  });

  it('"agora não" esconde e dorme 10 min; depois da soneca volta a acusar', () => {
    let e = estadoInicialDoAviso();
    e = consultar(e, SIM, 0);
    e = consultar(e, SIM, 15_000);
    e = dispensar(e, 15_000);
    expect(e.motivoExibido).toBeNull();
    // Durante a soneca, positivas seguidas não mostram.
    e = consultar(e, SIM, 30_000);
    e = consultar(e, SIM, 45_000);
    expect(e.motivoExibido).toBeNull();
    // Soneca acabou.
    e = consultar(e, SIM, 15_000 + SONECA_MS + 1);
    expect(e.motivoExibido).toBe('bcea');
  });

  it('recalibrar zera tudo, inclusive a soneca', () => {
    let e = estadoInicialDoAviso();
    e = dispensar(consultar(consultar(e, SIM, 0), SIM, 1), 1);
    e = resolvido();
    expect(e).toEqual(estadoInicialDoAviso());
  });

  it('voltar ao normal some com o aviso na hora, sem esperar', () => {
    let e = estadoInicialDoAviso();
    e = consultar(consultar(e, SIM, 0), SIM, 1);
    expect(e.motivoExibido).toBe('bcea');
    e = consultar(e, NAO, 2);
    expect(e.motivoExibido).toBeNull();
  });

  it('cada motivo tem texto para o paciente; motivo nulo, nenhum', () => {
    expect(detalheDoMotivo('bcea')).toMatch(/tremendo/);
    expect(detalheDoMotivo('vies')).toMatch(/mesmo lado/);
    expect(detalheDoMotivo(null)).toBe('');
  });
});
