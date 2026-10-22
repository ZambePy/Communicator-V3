import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  definirEmergenciaAtiva, emergenciaAtiva, emergenciaPorFonte, ouvirEstadoDaEmergencia, _reiniciarParaTeste,
} from './estadoDeEmergencia';

// Revisão de UX de 20/10/2026, achados 1 e 7: a varredura do acionador e a
// calibração leem as FONTES da emergência uma a uma (a contagem aberta, o
// pedido em andamento), e a calibração precisa saber quando elas mudam.

afterEach(() => {
  _reiniciarParaTeste();
  vi.restoreAllMocks();
});

describe('estado da emergência por fonte', () => {
  it('cada fonte liga e desliga sozinha; a emergência está ativa com qualquer uma', () => {
    definirEmergenciaAtiva(true, 'tela');
    expect(emergenciaAtiva()).toBe(true);
    // A tela de emergência aberta para escolher o tipo NÃO é socorro em curso.
    expect(emergenciaPorFonte('confirmacao')).toBe(false);
    expect(emergenciaPorFonte('pedido')).toBe(false);
    definirEmergenciaAtiva(true, 'pedido');
    expect(emergenciaPorFonte('pedido')).toBe(true);
    definirEmergenciaAtiva(false, 'tela');
    expect(emergenciaAtiva()).toBe(true);
    definirEmergenciaAtiva(false, 'pedido');
    expect(emergenciaAtiva()).toBe(false);
  });

  it('os ouvintes sabem quando uma fonte muda — e só quando muda', () => {
    const ouvinte = vi.fn();
    const soltar = ouvirEstadoDaEmergencia(ouvinte);
    definirEmergenciaAtiva(true, 'confirmacao');
    definirEmergenciaAtiva(true, 'confirmacao'); // repetido: nada mudou
    expect(ouvinte).toHaveBeenCalledTimes(1);
    definirEmergenciaAtiva(false, 'confirmacao');
    expect(ouvinte).toHaveBeenCalledTimes(2);
    soltar();
    definirEmergenciaAtiva(true, 'confirmacao');
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });

  it('um ouvinte com defeito não impede os outros', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bom = vi.fn();
    ouvirEstadoDaEmergencia(() => { throw new Error('defeito'); });
    ouvirEstadoDaEmergencia(bom);
    definirEmergenciaAtiva(true, 'pedido');
    expect(bom).toHaveBeenCalledTimes(1);
  });
});
