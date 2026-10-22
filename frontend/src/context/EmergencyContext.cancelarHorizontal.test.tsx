import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { GazeSample } from '@tracker/tracker/engine';

/**
 * Revisão de 21/10/2026 (Important 2): no modo só horizontal, com a contagem
 * da Emergência aberta, o paciente olha o meio da tela para ler "Enviando
 * alerta de socorro em N segundos" — e o CANCELAR do meio, logo abaixo, vencia
 * pelo ponto: um y que caísse nele cancelava o próprio socorro em 1 s. Agora o
 * cancelar do olhar é a faixa da esquerda; o do meio fica para o mouse e o
 * teclado. Despachante e EmergencyProvider de verdade.
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
const ajustes = {
  dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both', viewingDistanceCm: 60, screenDiagonalIn: 23.6,
  modoHorizontal: true, alarmeComVolumeMaximo: true,
};
vi.mock('./SettingsContext', () => ({ useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'p1' }, isCaregiver: false }) }));
vi.mock('../utils/emergencyAudio', () => ({ playTickSound: vi.fn(), playCancelSound: vi.fn(), tocarSomDaSelecao: vi.fn(), playTone: vi.fn() }));

import { GazeProvider } from './GazeContext';
import { EmergencyProvider } from './EmergencyContext';
import { _limparZonasLaterais } from '../components/ui/zonasLaterais';
import { _reiniciarSocorroParaTestes } from '../services/emergencia/pedidoDeSocorro';

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
    if (c && x >= c.left && x < c.right && y >= c.top && y < c.bottom) return camadas[i];
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

function abrirContagem() {
  render(
    <GazeProvider>
      <MemoryRouter initialEntries={['/sim-nao']}>
        <EmergencyProvider>
          <div />
        </EmergencyProvider>
      </MemoryRouter>
    </GazeProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Disparar Emergência Médica' }));
  const dialogo = screen.getByRole('alertdialog');
  const cancelarDoMeio = screen.getByRole('button', { name: 'CANCELAR' });
  const cancelarLateral = screen.getByRole('button', { name: /Cancelar a emergência/ });
  comCaixa(dialogo, { left: 0, top: 0, right: 1024, bottom: 768 });
  comCaixa(cancelarDoMeio, { left: 352, top: 520, right: 672, bottom: 718 });
  comCaixa(cancelarLateral, { left: 0, top: 0, right: 198, bottom: 768 });
  camadas = [dialogo, cancelarDoMeio, cancelarLateral];
  return { cancelarDoMeio, cancelarLateral };
}

describe('contagem da Emergência no modo só horizontal: o CANCELAR do olhar é o da esquerda', () => {
  beforeEach(() => {
    window.location.hash = '#/sim-nao';
    ajustes.modoHorizontal = true;
    emitir = () => {};
    t = 0;
    caixas.clear();
    camadas = [];
    _limparZonasLaterais();
    _reiniciarSocorroParaTestes();
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
    _reiniciarSocorroParaTestes();
    vi.restoreAllMocks();
  });

  it('o x no meio (lendo a contagem) e o y sobre o CANCELAR por 1,5 s NÃO cancelam o socorro', () => {
    const { cancelarDoMeio } = abrirContagem();
    olhar(1500, 512, 600);
    expect(screen.queryByRole('alertdialog')).toBeInTheDocument();
    expect(cancelarDoMeio.dataset.noDwell).toBe('true');
  });

  // Revisão final, rodada 1 (I1): o título "EMERGÊNCIA ACIONADA" começava a menos
  // de 1° da faixa (a 1280 e 1366 px) ou dentro dela (a 1024 px). Fixar o começo
  // dele por 1 s — o olhar lento da ELA — cancelava o próprio socorro. O texto agora
  // fica na coluna do meio, com a folga de intrusão (1°) e mais 1,5° de cada faixa.
  it('fixar o começo do título (±1°) por 1,5 s NÃO cancela: o texto fica além da faixa e da folga de intrusão', () => {
    abrirContagem();
    const dialogo = screen.getByRole('alertdialog');
    const inicioDoTexto = parseFloat(dialogo.style.paddingLeft);
    const faixa = 198;
    const umGrau = 39.6;
    expect(inicioDoTexto).toBeGreaterThanOrEqual(faixa + 2.5 * umGrau - 1);
    for (const x of [inicioDoTexto - umGrau, inicioDoTexto, inicioDoTexto + umGrau]) {
      olhar(1500, x, 300);
      expect(screen.queryByRole('alertdialog'), `x=${Math.round(x)}`).toBeInTheDocument();
    }
  });

  it('o x na faixa da esquerda (com o y fora da tela) cancela pelo olhar', () => {
    abrirContagem();
    olhar(1200, 80, -50);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('o CANCELAR do meio continua valendo pelo mouse, sem parecer desabilitado', () => {
    const { cancelarDoMeio } = abrirContagem();
    expect(cancelarDoMeio.style.pointerEvents).toBe('auto');
    expect(cancelarDoMeio.style.opacity).toBe('1');
    fireEvent.click(cancelarDoMeio);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('fora do modo só horizontal, o CANCELAR do meio continua com o olhar, como sempre', () => {
    ajustes.modoHorizontal = false;
    render(
      <GazeProvider>
        <MemoryRouter initialEntries={['/sim-nao']}>
          <EmergencyProvider>
            <div />
          </EmergencyProvider>
        </MemoryRouter>
      </GazeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Disparar Emergência Médica' }));
    const dialogo = screen.getByRole('alertdialog');
    const cancelarDoMeio = screen.getByRole('button', { name: 'CANCELAR' });
    comCaixa(dialogo, { left: 0, top: 0, right: 1024, bottom: 768 });
    comCaixa(cancelarDoMeio, { left: 352, top: 520, right: 672, bottom: 718 });
    camadas = [dialogo, cancelarDoMeio];
    expect(cancelarDoMeio.dataset.noDwell).toBeUndefined();
    olhar(1300, 512, 600);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
