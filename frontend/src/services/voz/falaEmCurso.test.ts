import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pacienteFalando, marcarFalaDoPaciente, comAFalaDoPacienteMarcada, TETO_DA_MARCA_MS, _reiniciarFalaEmCurso,
} from './falaEmCurso';

// -----------------------------------------------------------------------------
// "O paciente está falando agora" (rodada 3, 21/10/2026). A varredura falada do
// Plano B anuncia cada botão com a voz do computador, e a voz do computador
// começa SEMPRE com `speechSynthesis.cancel()`: sem este sinal, o anúncio de um
// botão cortaria a frase do paciente no meio. A marca vale do instante em que
// `falar()` é chamada (inclusive na espera da voz clonada, que pode ser de
// vários segundos) até a fala acabar.
// -----------------------------------------------------------------------------

describe('marca de "o paciente está falando"', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _reiniciarFalaEmCurso();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    _reiniciarFalaEmCurso();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('por padrão ninguém está falando', () => {
    expect(pacienteFalando()).toBe(false);
  });

  it('vale desde a chamada (sem esperar nada) até a fala terminar', async () => {
    let terminar!: () => void;
    const fala = comAFalaDoPacienteMarcada(() => new Promise<string>((r) => { terminar = () => r('ok'); }));
    // Síncrono: o anúncio do botão pode vir no mesmo instante em que o paciente
    // escolheu a frase.
    expect(pacienteFalando()).toBe(true);
    terminar();
    await expect(fala).resolves.toBe('ok');
    expect(pacienteFalando()).toBe(false);
  });

  it('cai também quando a fala lança — e o erro segue para quem chamou', async () => {
    const fala = comAFalaDoPacienteMarcada(async () => { throw new Error('a voz caiu'); });
    expect(pacienteFalando()).toBe(true);
    await expect(fala).rejects.toThrow('a voz caiu');
    expect(pacienteFalando()).toBe(false);
  });

  it('duas falas ao mesmo tempo (a nova substitui a velha): só cai quando as duas terminaram', async () => {
    let terminarA!: () => void;
    let terminarB!: () => void;
    const a = comAFalaDoPacienteMarcada(() => new Promise<void>((r) => { terminarA = r; }));
    const b = comAFalaDoPacienteMarcada(() => new Promise<void>((r) => { terminarB = r; }));
    terminarA();
    await a;
    expect(pacienteFalando()).toBe(true);
    terminarB();
    await b;
    expect(pacienteFalando()).toBe(false);
  });

  it('soltar a mesma marca duas vezes não desconta a de outra fala', () => {
    const soltarA = marcarFalaDoPaciente();
    const soltarB = marcarFalaDoPaciente();
    soltarA();
    soltarA();
    expect(pacienteFalando()).toBe(true);
    soltarB();
    expect(pacienteFalando()).toBe(false);
  });

  describe('o teto: uma fala que nunca avisa o fim não cala a varredura para sempre', () => {
    it('uma fala longa, dentro do teto, continua valendo', () => {
      marcarFalaDoPaciente();
      vi.advanceTimersByTime(TETO_DA_MARCA_MS - 1);
      expect(pacienteFalando()).toBe(true);
    });

    it('no teto a marca cai, com um aviso no console', () => {
      marcarFalaDoPaciente();
      vi.advanceTimersByTime(TETO_DA_MARCA_MS);
      expect(pacienteFalando()).toBe(false);
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('o aviso do console sai uma vez por minuto, não a cada marca solta pelo teto', () => {
      marcarFalaDoPaciente();
      marcarFalaDoPaciente();
      vi.advanceTimersByTime(TETO_DA_MARCA_MS);
      expect(pacienteFalando()).toBe(false);
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('soltar a marca que o teto já derrubou não mexe nas outras', () => {
      const soltarVelha = marcarFalaDoPaciente();
      vi.advanceTimersByTime(TETO_DA_MARCA_MS);
      const soltarNova = marcarFalaDoPaciente();
      soltarVelha();
      expect(pacienteFalando()).toBe(true);
      soltarNova();
      expect(pacienteFalando()).toBe(false);
    });

    it('soltar na hora cancela o relógio do teto: nada sobra pendente', () => {
      const soltar = marcarFalaDoPaciente();
      soltar();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
