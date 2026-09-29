import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

// Quarentena de desfazer da correção por dwell (M15): cada clique por dwell
// avisa a correção se foi um "desfazer" (botão com `data-desfazer`) — é o que
// descarta o rótulo da seleção anterior, em vez de consolidá-lo.

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

const { registrar } = vi.hoisted(() => ({ registrar: vi.fn() }));
vi.mock('@tracker/interaction/correcaoPorDwell', async (orig) => {
  const real = await orig<typeof import('@tracker/interaction/correcaoPorDwell')>();
  return { ...real, registrarAcaoDoUsuario: registrar };
});

vi.mock('./SettingsContext', () => ({
  useSettings: () => ({
    settings: { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both' },
    updateSettings: vi.fn(),
  }),
}));

import { GazeProvider } from './GazeContext';

const PASSO = 1000 / 30;

function amostra(over: Partial<GazeSample> = {}): GazeSample {
  return {
    x: 50, y: 50, timestamp: 0, hasFace: true, degraded: false, uncalibrated: false, eyeState: 'open',
    ...over,
  } as GazeSample;
}

function olhar(ms: number, inicio: number, over: Partial<GazeSample> = {}) {
  act(() => {
    for (let t = inicio; t <= inicio + ms; t += PASSO) emitir(amostra({ timestamp: t, ...over }));
  });
  return inicio + ms + PASSO;
}

function montar(desfazer: boolean) {
  const onClick = vi.fn();
  render(
    <GazeProvider>
      <button data-testid="alvo" data-desfazer={desfazer ? 'true' : undefined} onClick={onClick}>Voltar</button>
    </GazeProvider>,
  );
  const el = screen.getByTestId('alvo');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
  document.elementFromPoint = vi.fn((x: number, y: number) => (x >= 0 && x <= 100 && y >= 0 && y <= 100 ? el : document.body));
  return { onClick };
}

beforeEach(() => {
  window.location.hash = '#/menu';
  emitir = () => {};
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera no teste'); }) },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('clique por dwell e a quarentena de desfazer (M15)', () => {
  it('um botão de desfazer avisa a correção com desfazer: true', () => {
    const { onClick } = montar(true);
    olhar(1700, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ desfazer: true }));
  });

  it('um botão comum avisa com desfazer: false (consolida o rótulo pendente)', () => {
    const { onClick } = montar(false);
    olhar(1700, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ desfazer: false }));
  });
});
