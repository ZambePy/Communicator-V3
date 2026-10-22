import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 15): o aviso
// calmo e visível de "não foi possível salvar" — inclusive a calibração, que
// mora no núcleo e avisa por evento.
// -----------------------------------------------------------------------------

const gaze = vi.hoisted(() => ({ state: 'tracking' }));
vi.mock('../context/GazeContext', () => ({ useGaze: () => ({ state: gaze.state }) }));
vi.mock('../context/EmergencyContext', () => ({ useEmergency: () => ({ isConfirming: false }) }));

import { AvisoDeGravacao } from './AvisoDeGravacao';
import { EVENTO_DE_GRAVACAO_DA_CALIBRACAO } from '@tracker/calibration';
import { _redefinirFalhasDeGravacao, registrarFalhaDeGravacao } from '../services/local/falhasDeGravacao';

const montar = (rota = '/menu') =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <AvisoDeGravacao />
    </MemoryRouter>,
  );

/** Deixa o aviso (que chega por microtarefa) renderizar. */
const assentar = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  _redefinirFalhasDeGravacao();
  gaze.state = 'tracking';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('aviso de "não foi possível salvar"', () => {
  it('nada a avisar: nada na tela', () => {
    montar();
    expect(screen.queryByTestId('aviso-de-gravacao')).toBeNull();
  });

  it('a calibração que o disco recusou aparece, com o que isso muda', async () => {
    montar();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(EVENTO_DE_GRAVACAO_DA_CALIBRACAO, { detail: { salvo: false } }));
    });
    await assentar();
    expect(screen.getByText(/Não foi possível salvar a calibração/)).toBeInTheDocument();
    expect(screen.getByText(/será preciso calibrar de novo/)).toBeInTheDocument();
    // E uma gravação da calibração que dá certo depois tira o aviso.
    await act(async () => {
      window.dispatchEvent(new CustomEvent(EVENTO_DE_GRAVACAO_DA_CALIBRACAO, { detail: { salvo: true } }));
    });
    await assentar();
    expect(screen.queryByTestId('aviso-de-gravacao')).toBeNull();
  });

  it('junta os itens numa frase só', async () => {
    montar();
    await act(async () => {
      registrarFalhaDeGravacao('ajustes');
      registrarFalhaDeGravacao('historico');
    });
    await assentar();
    expect(screen.getByText(/Não foi possível salvar os ajustes e o histórico/)).toBeInTheDocument();
  });

  it('"Entendi" é alvo de olhar e tira o aviso', async () => {
    montar();
    await act(async () => { registrarFalhaDeGravacao('ajustes'); });
    await assentar();
    const entendi = screen.getByRole('button', { name: /Entendi/ });
    expect(entendi.className).toContain('gaze-button');
    await act(async () => { fireEvent.click(entendi); });
    await assentar();
    expect(screen.queryByTestId('aviso-de-gravacao')).toBeNull();
  });

  it('espera fora do teclado, da calibração e da emergência', async () => {
    for (const rota of ['/keyboard', '/calibration-check', '/emergency']) {
      const { unmount } = montar(rota);
      await act(async () => { registrarFalhaDeGravacao('ajustes'); });
      await assentar();
      expect(screen.queryByTestId('aviso-de-gravacao'), rota).toBeNull();
      unmount();
    }
  });
});
