import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { ResultadoDaFala } from '../services/voz';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 5): quando nada
// saía em voz alta, a frase do paciente sumia — só um aviso no console. Agora
// ela fica na tela em letra grande, para quem estiver perto ler, com "Tentar
// falar de novo" e "Fechar" acionáveis pelo olhar, mouse e teclado.
// -----------------------------------------------------------------------------

const voz = vi.hoisted(() => ({ falar: vi.fn() }));
vi.mock('../services/voz', () => ({ falar: voz.falar }));
const emergencia = vi.hoisted(() => ({ isConfirming: false }));
vi.mock('../context/GazeContext', () => ({ useGaze: () => ({ state: 'tracking' }) }));
vi.mock('../context/EmergencyContext', () => ({ useEmergency: () => emergencia }));

import { AvisoDeFalaQueNaoSaiu, DURACAO_DO_AVISO_DE_FALA_MS, TAMANHO_DA_FRASE } from './AvisoDeFalaQueNaoSaiu';
import { falarDoPaciente } from '../services/voz/falaDoPaciente';

const responder = (r: ResultadoDaFala | undefined) => voz.falar.mockResolvedValueOnce(r);
const montar = (rota = '/keyboard') =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <AvisoDeFalaQueNaoSaiu />
    </MemoryRouter>,
  );

beforeEach(() => {
  voz.falar.mockReset();
  emergencia.isConfirming = false;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a frase que não saiu em voz alta', () => {
  it('aparece em letra grande, com o porquê, e "Fechar" tira o aviso', async () => {
    montar();
    responder({ origem: 'nenhuma', motivo: 'sem_voz' });
    await act(async () => { await falarDoPaciente('Preciso de ajuda', { rate: 0.9 }); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    const frase = screen.getByTestId('frase-que-nao-saiu');
    expect(frase.textContent).toBe('Preciso de ajuda');
    // Letra grande: é para ser lida de longe (o jsdom não guarda `clamp()` no
    // CSSOM; confere-se o valor que o componente usa).
    expect(Number(/clamp\(([\d.]+)rem/.exec(TAMANHO_DA_FRASE)?.[1])).toBeGreaterThanOrEqual(2);
    expect(frase.style.fontWeight).toBe('800');
    expect(screen.getByText(/sem voz para falar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Fechar/ }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('os dois botões são alvos de olhar (GazeButton), não só de mouse', async () => {
    montar();
    responder({ origem: 'nenhuma', motivo: 'erro' });
    await act(async () => { await falarDoPaciente('Oi'); });
    for (const nome of [/Tentar falar de novo/, /Fechar/]) {
      const botao = screen.getByRole('button', { name: nome });
      expect(botao.className).toContain('gaze-button');
      expect(botao).not.toHaveAttribute('data-no-dwell');
    }
  });

  it('"Tentar falar de novo" que dá certo tira o aviso; com as mesmas opções da fala', async () => {
    montar();
    responder({ origem: 'nenhuma', motivo: 'nao_comecou' });
    await act(async () => { await falarDoPaciente('Quero água', { rate: 0.9 }); });
    responder({ origem: 'sistema' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tentar falar de novo/ })); });
    expect(voz.falar).toHaveBeenLastCalledWith('Quero água', { rate: 0.9 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('"Tentar falar de novo" que falha de novo mantém a frase na tela', async () => {
    montar();
    responder({ origem: 'nenhuma', motivo: 'erro' });
    await act(async () => { await falarDoPaciente('Quero água'); });
    responder({ origem: 'nenhuma', motivo: 'erro' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tentar falar de novo/ })); });
    expect(screen.getByTestId('frase-que-nao-saiu').textContent).toBe('Quero água');
  });

  it('substituída, interrompida ou falada: nenhum aviso', async () => {
    montar();
    for (const r of [
      { origem: 'nenhuma', motivo: 'substituida' },
      { origem: 'nenhuma', motivo: 'interrompida' },
      { origem: 'clonada' },
      undefined, // um `falar` falso que não responde nada
    ] as const) {
      responder(r as ResultadoDaFala | undefined);
      await act(async () => { await falarDoPaciente('Oi'); });
      expect(screen.queryByRole('alert')).toBeNull();
    }
  });

  it('`falar` que lança (fora do contrato) também vira aviso, não sumiço', async () => {
    montar();
    voz.falar.mockRejectedValueOnce(new Error('inesperado'));
    let r: ResultadoDaFala | null = null;
    await act(async () => { r = await falarDoPaciente('Estou com dor'); });
    expect(r).toEqual({ origem: 'nenhuma', motivo: 'erro' });
    expect(screen.getByTestId('frase-que-nao-saiu').textContent).toBe('Estou com dor');
  });

  it('some sozinho depois de um tempo longo de leitura (não tapa a tela para sempre)', async () => {
    vi.useFakeTimers();
    montar();
    responder({ origem: 'nenhuma', motivo: 'erro' });
    await act(async () => { await falarDoPaciente('Oi'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DURACAO_DO_AVISO_DE_FALA_MS - 1000); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('espera durante a emergência (tela e confirmação) e a calibração; volta depois, se ainda no prazo', async () => {
    responder({ origem: 'nenhuma', motivo: 'erro' });
    const { unmount } = montar('/emergency');
    await act(async () => { await falarDoPaciente('Estou com dor'); });
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();

    emergencia.isConfirming = true;
    responder({ origem: 'nenhuma', motivo: 'erro' });
    const segundo = montar('/keyboard');
    await act(async () => { await falarDoPaciente('Estou com dor'); });
    expect(screen.queryByRole('alert')).toBeNull();
    emergencia.isConfirming = false;
    segundo.rerender(
      <MemoryRouter initialEntries={['/keyboard']}>
        <AvisoDeFalaQueNaoSaiu />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('frase-que-nao-saiu').textContent).toBe('Estou com dor');
  });
});
