import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ResultadoDaFala } from '../services/voz';

// Revisão de 21/10/2026 (Important 3): o aviso da fala que não saiu cobre o
// meio da tela por até 120 s, com "Tentar falar de novo" e "Fechar" centrados.
// No modo só horizontal, sobre o teclado lateral — cujo "Falar" o dispara
// quando a voz não sai —, o paciente não alcançava nenhum dos dois. Agora são
// as duas metades de uma escolha lateral.

const voz = vi.hoisted(() => ({ falar: vi.fn() }));
vi.mock('../services/voz', () => ({ falar: voz.falar }));
const emergencia = vi.hoisted(() => ({ isConfirming: false }));
const avisarConteudoNovoSobOOlhar = vi.hoisted(() => vi.fn());
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ state: 'tracking' }),
  avisarConteudoNovoSobOOlhar: () => avisarConteudoNovoSobOOlhar(),
}));
vi.mock('../context/EmergencyContext', () => ({ useEmergency: () => emergencia }));
const ajustes = vi.hoisted(() => ({ modoHorizontal: true }));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: ajustes }) }));

import { AvisoDeFalaQueNaoSaiu, DURACAO_DO_AVISO_DE_FALA_MS } from './AvisoDeFalaQueNaoSaiu';
import { falarDoPaciente } from '../services/voz/falaDoPaciente';
import { _limparZonasLaterais, haZonasLaterais } from './ui/zonasLaterais';

const responder = (r: ResultadoDaFala | undefined) => voz.falar.mockResolvedValueOnce(r);
const montar = (rota = '/teclado-lateral') =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <AvisoDeFalaQueNaoSaiu />
    </MemoryRouter>,
  );

beforeEach(() => {
  voz.falar.mockReset();
  emergencia.isConfirming = false;
  ajustes.modoHorizontal = true;
  avisarConteudoNovoSobOOlhar.mockClear();
  _limparZonasLaterais();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  _limparZonasLaterais();
  vi.restoreAllMocks();
});

describe('a frase que não saiu, no modo só horizontal', () => {
  it('"Fechar" à esquerda e "Tentar falar de novo" à direita, pela coluna do olhar', async () => {
    montar();
    responder({ origem: 'nenhuma', motivo: 'sem_voz' });
    await act(async () => { await falarDoPaciente('Preciso de ajuda', { rate: 0.9 }); });
    expect(screen.getByTestId('frase-que-nao-saiu').textContent).toBe('Preciso de ajuda');
    const fechar = screen.getByRole('button', { name: /Fechar/ });
    const tentar = screen.getByRole('button', { name: /Tentar falar de novo/ });
    expect(fechar.dataset.lado).toBe('esquerda');
    expect(tentar.dataset.lado).toBe('direita');
    expect(fechar.getAttribute('data-dwell-eixo')).toBe('x');
    expect(tentar.getAttribute('data-dwell-eixo')).toBe('x');
    expect(haZonasLaterais()).toBe(true);
    fireEvent.click(fechar);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(haZonasLaterais()).toBe(false);
  });

  it('ao aparecer, avisa o olhar: o lado sob o olhar parado (o do "Falar") não aciona sozinho', async () => {
    montar();
    responder({ origem: 'nenhuma', motivo: 'erro' });
    await act(async () => { await falarDoPaciente('Oi'); });
    expect(avisarConteudoNovoSobOOlhar).toHaveBeenCalledTimes(1);
  });

  it('ao sair (até pelo prazo, sem clique), avisa de novo: a tela de baixo volta sob o olhar parado', async () => {
    vi.useFakeTimers();
    montar();
    responder({ origem: 'nenhuma', motivo: 'erro' });
    await act(async () => { await falarDoPaciente('Oi'); });
    expect(avisarConteudoNovoSobOOlhar).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(DURACAO_DO_AVISO_DE_FALA_MS + 10); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(avisarConteudoNovoSobOOlhar).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('"Tentar falar de novo" fica apagado enquanto tenta, e o aviso sai se a voz sair', async () => {
    montar();
    responder({ origem: 'nenhuma', motivo: 'erro' });
    await act(async () => { await falarDoPaciente('Oi'); });
    let terminar: (r: ResultadoDaFala) => void = () => {};
    voz.falar.mockImplementationOnce(() => new Promise<ResultadoDaFala>((r) => { terminar = r; }));
    fireEvent.click(screen.getByRole('button', { name: /Tentar falar de novo/ }));
    expect(screen.getByRole('button', { name: /Tentando/ }).dataset.noDwell).toBe('true');
    await act(async () => { terminar({ origem: 'sistema' }); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
