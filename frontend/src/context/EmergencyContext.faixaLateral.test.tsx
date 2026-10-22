import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { _reiniciarSocorroParaTestes } from '../services/emergencia/pedidoDeSocorro';

// Emergência no modo só horizontal (pedido de 21/10/2026): uma faixa vertical
// na borda direita (x ≥ 92%), acionada pela coluna do olhar, com o mesmo tempo
// da Emergência de sempre.

let degradado = false;
vi.mock('./GazeContext', () => ({ useGaze: () => ({ isDegraded: degradado }) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'p1' }, isCaregiver: false }) }));
const ajustes = { modoHorizontal: true, alarmeComVolumeMaximo: true };
vi.mock('./SettingsContext', () => ({ useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }) }));
const dispararPedidoDeSocorro = vi.fn();
vi.mock('../services/emergencia/pedidoDeSocorro', async (orig) => {
  const real = await orig<typeof import('../services/emergencia/pedidoDeSocorro')>();
  return { ...real, dispararPedidoDeSocorro: (...a: unknown[]) => dispararPedidoDeSocorro(...a) };
});

const { EmergencyProvider } = await import('./EmergencyContext');
const { zonaLateralNoX, _limparZonasLaterais } = await import('../components/ui/zonasLaterais');

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/sim-nao']}>
      <EmergencyProvider>
        <div>Tela</div>
      </EmergencyProvider>
    </MemoryRouter>
  );

function comCaixa(el: HTMLElement, c: { left: number; top: number; right: number; bottom: number }) {
  el.getBoundingClientRect = () =>
    ({ ...c, x: c.left, y: c.top, width: c.right - c.left, height: c.bottom - c.top, toJSON: () => c }) as DOMRect;
}

describe('Emergência no modo só horizontal', () => {
  beforeEach(() => {
    degradado = false;
    ajustes.modoHorizontal = true;
    _reiniciarSocorroParaTestes();
    _limparZonasLaterais();
    dispararPedidoDeSocorro.mockClear();
    document.getElementById('accuracy-dot')?.remove();
  });
  afterEach(() => {
    vi.useRealTimers();
    _limparZonasLaterais();
  });

  it('o botão é a faixa da borda direita, uma zona lateral, com o tempo da Emergência de sempre', () => {
    montar();
    const faixa = screen.getByRole('button', { name: 'Disparar Emergência Médica' });
    expect(faixa.dataset.emergency).toBe('true');
    expect(faixa.getAttribute('data-dwell-eixo')).toBe('x');
    expect(faixa.dataset.dwellMs).toBe('2000');
    expect(faixa.dataset.dwellMult).toBe('1.3');
    expect(document.documentElement.getAttribute('data-emergencia')).toBe('faixa');
    // A coluna dela, com o y em qualquer lugar.
    comCaixa(faixa, { left: 942, top: 0, right: 1024, bottom: 768 });
    document.elementFromPoint = () => faixa;
    expect(zonaLateralNoX(1000)).toBe(faixa);
    expect(zonaLateralNoX(900)).toBeNull();
  });

  it('com o rastreamento degradado, o mesmo dwell mais longo da Emergência de sempre', () => {
    degradado = true;
    montar();
    expect(screen.getByRole('button', { name: 'Disparar Emergência Médica' }).dataset.dwellMs).toBe('3600');
  });

  it('acionar abre a mesma contagem; o CANCELAR também fica numa faixa, na borda ESQUERDA', () => {
    vi.useFakeTimers();
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Disparar Emergência Médica' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    // A faixa da direita sai durante a contagem; à esquerda, o cancelar pela coluna.
    expect(screen.queryByRole('button', { name: 'Disparar Emergência Médica' })).toBeNull();
    const cancelarLateral = screen.getByRole('button', { name: /Cancelar a emergência/ });
    expect(cancelarLateral.dataset.cancelarEmergencia).toBe('true');
    expect(cancelarLateral.getAttribute('data-dwell-eixo')).toBe('x');
    expect(cancelarLateral.dataset.dwellMs).toBe('1000');
    fireEvent.click(cancelarLateral);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => { vi.advanceTimersByTime(8000); });
    expect(dispararPedidoDeSocorro).not.toHaveBeenCalled();
  });

  it('sem cancelar, a contagem termina e o pedido sai, como sempre', () => {
    vi.useFakeTimers();
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Disparar Emergência Médica' }));
    act(() => { vi.advanceTimersByTime(6000); });
    expect(dispararPedidoDeSocorro).toHaveBeenCalledTimes(1);
  });

  it('durante a medição (o ponto do teste na tela), volta o botão do canto, sem dwell', () => {
    vi.useFakeTimers();
    const ponto = document.createElement('div');
    ponto.id = 'accuracy-dot';
    document.body.appendChild(ponto);
    montar();
    act(() => { vi.advanceTimersByTime(350); });
    const botao = screen.getByRole('button', { name: /Disparar Emergência Médica \(durante a medição/ });
    expect(botao.getAttribute('data-dwell-eixo')).toBeNull();
    expect(botao.dataset.noDwell).toBe('true');
    ponto.remove();
  });

  // Decisão de 21/10/2026 (revisão, Minor 1): o alvo mínimo de 5° vale mais que
  // os 8 % do pedido. Numa janela de 1024 px, 8 % são 82 px — menos da metade
  // dos 5° de um posto comum.
  it('a faixa e o CANCELAR da esquerda têm a largura max(8 % da janela, alvo mínimo de 5°)', () => {
    vi.useFakeTimers();
    const largura = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    document.documentElement.style.setProperty('--gaze-target-min', '198px');
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
      const { unmount } = montar();
      const faixa = screen.getByRole('button', { name: 'Disparar Emergência Médica' });
      expect((faixa.parentElement as HTMLElement).style.width).toBe('198px');
      // As telas reservam a mesma largura (a zona começa em largura da janela − ela).
      expect(document.documentElement.style.getPropertyValue('--faixa-da-emergencia-largura')).toBe('198px');
      fireEvent.click(faixa);
      expect(screen.getByRole('button', { name: /Cancelar a emergência/ }).style.width).toBe('198px');
      unmount();

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 3000 });
      montar();
      expect((screen.getByRole('button', { name: 'Disparar Emergência Médica' }).parentElement as HTMLElement).style.width).toBe('240px');
    } finally {
      if (largura) Object.defineProperty(window, 'innerWidth', largura);
      document.documentElement.style.removeProperty('--gaze-target-min');
    }
  });

  it('o CSS reserva a faixa (o padrão já é max(8vw, alvo mínimo)) e faz as telas pararem antes dela', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf8');
    expect(css).toMatch(/--faixa-da-emergencia-largura:\s*max\(8vw, var\(--gaze-target-min/);
    expect(css).toMatch(/html\[data-emergencia='faixa'\] \.gaze-pagina \{\s*padding-right: calc\(var\(--faixa-da-emergencia-largura\)/);
    expect(css).toMatch(/html\[data-emergencia='faixa'\] \.reserva-emergencia \{/);
    const layout = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../components/ui/GazePageLayout.tsx'), 'utf8');
    expect(layout).toContain('className="gaze-pagina"');
  });

  it('fora do modo só horizontal, o botão de sempre no topo', () => {
    ajustes.modoHorizontal = false;
    montar();
    const botao = screen.getByRole('button', { name: 'Disparar Emergência Médica' });
    expect(botao.getAttribute('data-dwell-eixo')).toBeNull();
    expect(document.documentElement.getAttribute('data-emergencia')).toBe('topo');
    fireEvent.click(botao);
    expect(screen.queryByRole('button', { name: /Cancelar a emergência/ })).toBeNull();
  });
});
