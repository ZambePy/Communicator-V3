import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EmergencyProvider, useEmergency } from './EmergencyContext';
import { _reiniciarSocorroParaTestes, pedidoAtual } from '../services/emergencia/pedidoDeSocorro';

// A contagem de emergência aberta por outra tela (o mapa da dor, nível ≥ 8 —
// 19/10/2026): a MESMA confirmação de 5 s, cancelável, e o pedido diz qual dor.

vi.mock('./GazeContext', () => ({ useGaze: () => ({ isDegraded: false }) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'p1' }, isCaregiver: false }) }));

const MOTIVO = { tipo: 'pain', rotulo: 'DOR MUITO FORTE — cabeça, 9 de 10' };

const Gatilho: React.FC = () => {
  const { iniciarContagemDeEmergencia } = useEmergency();
  return <button type="button" onClick={() => iniciarContagemDeEmergencia(MOTIVO)}>chamar pela dor</button>;
};

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/dor']}>
      <EmergencyProvider>
        <Routes>
          <Route path="/dor" element={<Gatilho />} />
          <Route path="/emergency" element={<p>tela de emergência</p>} />
        </Routes>
      </EmergencyProvider>
    </MemoryRouter>,
  );

describe('contagem de emergência com motivo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _reiniciarSocorroParaTestes();
  });
  afterEach(() => {
    _reiniciarSocorroParaTestes();
    vi.useRealTimers();
  });

  it('abre a confirmação de sempre e NADA sai antes de a contagem acabar', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'chamar pela dor' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Enviando alerta de socorro em/)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(pedidoAtual()).toBeNull();
  });

  it('no fim da contagem o pedido sai com o tipo e o rótulo da dor', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'chamar pela dor' }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('tela de emergência')).toBeInTheDocument();
    const p = pedidoAtual();
    expect(p?.tipo).toBe('pain');
    expect(p?.rotulo).toBe(MOTIVO.rotulo);
  });

  it('CANCELAR não envia; e a próxima contagem pelo botão volta ao pedido genérico', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'chamar pela dor' }));
    fireEvent.click(screen.getByRole('button', { name: /CANCELAR/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => { vi.advanceTimersByTime(6000); });
    expect(pedidoAtual()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Emergência/ }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(pedidoAtual()?.tipo).toBe('other');
  });
});
