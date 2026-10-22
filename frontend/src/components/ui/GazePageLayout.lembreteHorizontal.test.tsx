import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { GazeSample } from '@tracker/tracker/engine';

/**
 * Revisão de 21/10/2026 (Important 3): o lembrete de rotina cobre a tela
 * inteira com um "Confirmar" centrado, e não some sozinho. Sobre uma tela
 * lateral, no modo só horizontal, o paciente ficava sem nada que o olhar
 * acionasse até alguém clicar. Agora o "Confirmar" é a metade esquerda de uma
 * escolha lateral. Despachante de verdade (GazeProvider).
 */

let emitir: (s: GazeSample) => void = () => {};
const engineMock = {
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  dispose: vi.fn(),
  subscribe: (cb: (s: GazeSample) => void) => {
    emitir = cb;
    return () => {};
  },
  onStateChange: () => () => {},
  onL2CSStatusChange: () => () => {},
  getState: () => 'tracking',
  getSessionUptimeMs: () => 1000,
  getDiagnostics: () => null,
  setFilterPreset: vi.fn(),
  calibration: {
    isCalibrated: () => true,
    onInvalidated: () => () => {},
    setCameraFovDeg: vi.fn(),
    setEyeDominance: vi.fn(),
    abort: vi.fn(),
    clear: vi.fn(),
  },
  recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
};
vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return { ...real, createGazeEngine: () => engineMock };
});
const ajustes = { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both', modoHorizontal: true };
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }) }));
const dismissActiveReminder = vi.fn();
const lembrete: { activeReminder: { id: string; title: string; time: string } | null; dismissActiveReminder: typeof dismissActiveReminder } = {
  activeReminder: { id: 'r1', title: 'Tomar o remédio', time: '14:00' },
  dismissActiveReminder,
};
vi.mock('../../context/ReminderContext', () => ({ useReminders: () => lembrete }));

import { GazeProvider } from '../../context/GazeContext';
import { GazePageLayout } from './GazePageLayout';
import { EscolhaLateral } from './EscolhaLateral';
import { _limparZonasLaterais } from './zonasLaterais';

type Caixa = { left: number; top: number; right: number; bottom: number };
const caixas = new Map<Element, Caixa>();
let camadas: Element[] = [];
function comCaixa(el: Element, c: Caixa) {
  caixas.set(el, c);
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ ...c, x: c.left, y: c.top, width: c.right - c.left, height: c.bottom - c.top, toJSON: () => c }) as DOMRect;
}
function hitTest(x: number, y: number): Element | null {
  for (let i = camadas.length - 1; i >= 0; i--) {
    const c = caixas.get(camadas[i]);
    if (c && camadas[i].isConnected && x >= c.left && x < c.right && y >= c.top && y < c.bottom) return camadas[i];
  }
  return null;
}

let t = 0;
function olhar(ms: number, x: number, y: number) {
  const passo = 1000 / 30;
  act(() => {
    for (const fim = t + ms; t <= fim; t += passo) {
      emitir({ x, y, timestamp: t, hasFace: true, degraded: false, uncalibrated: false, eyeState: 'open' } as GazeSample);
    }
  });
}

const nao = vi.fn();
const sim = vi.fn();
const arvore = () => (
  <GazeProvider>
    <MemoryRouter>
      <GazePageLayout titulo="Sim · Não">
        <EscolhaLateral
          esquerda={{ nome: 'Não', rotulo: 'NÃO', aoEscolher: nao }}
          direita={{ nome: 'Sim', rotulo: 'SIM', aoEscolher: sim }}
        />
      </GazePageLayout>
    </MemoryRouter>
  </GazeProvider>
);
/** Uma tela lateral (o Sim · Não) com o lembrete por cima. */
function montar() {
  const { rerender } = render(arvore());
  const botaoNao = screen.getByRole('button', { name: 'Não' });
  const botaoSim = screen.getByRole('button', { name: 'Sim' });
  comCaixa(botaoNao, { left: 0, top: 120, right: 360, bottom: 740 });
  comCaixa(botaoSim, { left: 660, top: 120, right: 1000, bottom: 740 });
  // O véu do lembrete: o primeiro ancestral fixo do título.
  let veu = screen.getByText('Tomar o remédio') as HTMLElement;
  while (veu.parentElement && veu.style.position !== 'fixed') veu = veu.parentElement;
  comCaixa(veu, { left: 0, top: 0, right: 1024, bottom: 768 });
  const confirmar = screen.getByRole('button', { name: /Confirmar/ });
  comCaixa(confirmar, { left: 0, top: 0, right: 300, bottom: 768 });
  camadas = [botaoNao, botaoSim, veu, confirmar];
  return { confirmar, rerender };
}

describe('lembrete de rotina sobre uma tela lateral, no modo só horizontal', () => {
  beforeEach(() => {
    window.location.hash = '#/sim-nao';
    ajustes.modoHorizontal = true;
    emitir = () => {};
    t = 0;
    caixas.clear();
    camadas = [];
    _limparZonasLaterais();
    nao.mockClear();
    sim.mockClear();
    dismissActiveReminder.mockClear();
    lembrete.activeReminder = { id: 'r1', title: 'Tomar o remédio', time: '14:00' };
    document.elementFromPoint = vi.fn((x: number, y: number) => hitTest(x, y));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera no teste'); }) },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    _limparZonasLaterais();
    vi.restoreAllMocks();
  });

  it('pode ser fechado pelo olhar: o "Confirmar" é a coluna da esquerda (com o y fora da tela)', () => {
    const { confirmar } = montar();
    olhar(600, 512, -40);
    olhar(2200, 120, -40);
    expect(dismissActiveReminder).toHaveBeenCalledTimes(1);
    // A tela de baixo, coberta, não foi acionada.
    expect(nao).not.toHaveBeenCalled();
    expect(sim).not.toHaveBeenCalled();
    expect(confirmar.getAttribute('data-dwell-eixo')).toBe('x');
    expect(confirmar.dataset.lado).toBe('esquerda');
  });

  it('o olhar parado à esquerda quando o lembrete aparece não o fecha sozinho', () => {
    montar();
    olhar(3000, 120, -40);
    expect(dismissActiveReminder).not.toHaveBeenCalled();
    expect(nao).not.toHaveBeenCalled();
  });

  it('fechado pelo mouse do cuidador com o olhar parado à esquerda: a tela de baixo não aciona sozinha', () => {
    const { confirmar, rerender } = montar();
    olhar(600, 512, -40);
    // O paciente começa a olhar o Confirmar…
    olhar(700, 120, -40);
    expect(dismissActiveReminder).not.toHaveBeenCalled();
    // …e o cuidador fecha o lembrete pelo mouse. O NÃO de baixo volta sob o olhar parado.
    lembrete.activeReminder = null;
    rerender(arvore());
    expect(confirmar.isConnected).toBe(false);
    camadas = camadas.filter((el) => el.isConnected);
    olhar(3000, 120, -40);
    expect(nao).not.toHaveBeenCalled();
  });

  it('é um diálogo, com o título e a hora no meio', () => {
    montar();
    expect(screen.getByRole('dialog', { name: 'Tomar o remédio' })).toBeInTheDocument();
    expect(screen.getByText(/Horário agendado: 14:00/)).toBeInTheDocument();
  });

  it('fora do modo só horizontal, o "Confirmar" de sempre, centrado', () => {
    ajustes.modoHorizontal = false;
    render(
      <GazeProvider>
        <MemoryRouter>
          <GazePageLayout titulo="Menu">
            <p>tela</p>
          </GazePageLayout>
        </MemoryRouter>
      </GazeProvider>
    );
    const confirmar = screen.getByRole('button', { name: /Confirmar/ });
    expect(confirmar.dataset.lado).toBeUndefined();
    expect(confirmar.getAttribute('data-dwell-eixo')).toBeNull();
  });
});
