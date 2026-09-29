import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';
import { EXPERIMENT } from '@tracker/config/experiment';

// Adaptações para ELA no dispatcher (Fase 4): a perda curta de rosto pausa o
// dwell em vez de zerar (M21) e, com o dwell começado, o olhar que escorrega
// para o espaço vazio a menos de 1° do alvo continua valendo para ele (M19).

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

/** Um aviso que pode cobrir o botão (o reajuste, um banner, um modal). */
let cobertoPorAviso = false;

/** Um botão em (0,0)–(100,100); fora dele, espaço vazio. */
function montar() {
  const onClick = vi.fn();
  render(
    <GazeProvider>
      <button data-testid="alvo" onClick={onClick}>Ok</button>
      <div data-testid="aviso">aviso</div>
    </GazeProvider>,
  );
  const el = screen.getByTestId('alvo');
  const aviso = screen.getByTestId('aviso');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
  document.elementFromPoint = vi.fn((x: number, y: number) => {
    const dentro = x >= 0 && x <= 100 && y >= 0 && y <= 100;
    if (dentro && cobertoPorAviso) return aviso;
    return dentro ? el : document.body;
  });
  return { onClick };
}

const flags = { pausa: EXPERIMENT.pausaNaPerdaCurta, tolerancia: EXPERIMENT.toleranciaIntrusoes };

beforeEach(() => {
  cobertoPorAviso = false;
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
  EXPERIMENT.pausaNaPerdaCurta = flags.pausa;
  EXPERIMENT.toleranciaIntrusoes = flags.tolerancia;
  vi.restoreAllMocks();
});

describe('perda curta de rosto (M21)', () => {
  it('ligada: 100 ms sem rosto no meio do dwell pausam, e o dwell completa com o que falta', () => {
    EXPERIMENT.pausaNaPerdaCurta = true;
    const { onClick } = montar();
    let t = olhar(1000, 0);
    t = olhar(100, t, { hasFace: false });
    olhar(700, t);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ligada: acima de 500 ms sem rosto o dwell zera de vez, mesmo voltando logo ao alvo', () => {
    EXPERIMENT.pausaNaPerdaCurta = true;
    const { onClick } = montar();
    let t = olhar(1000, 0);
    t = olhar(600, t, { hasFace: false });
    // 700 ms de volta: com o progresso guardado (1000 ms), completaria.
    olhar(700, t);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('desligada: a perda zera o dwell (o comportamento de antes)', () => {
    EXPERIMENT.pausaNaPerdaCurta = false;
    const { onClick } = montar();
    let t = olhar(1000, 0);
    t = olhar(100, t, { hasFace: false });
    olhar(700, t);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('tolerância a intrusões (M19)', () => {
  it('ligada: o olhar a 20 px da borda, no vazio, continua contando para o alvo', () => {
    EXPERIMENT.toleranciaIntrusoes = true;
    const { onClick } = montar();
    let t = olhar(800, 0);
    // Intrusão de 300 ms para fora do botão, a 20 px da borda (menos de 1°).
    t = olhar(300, t, { x: 120, y: 50 });
    olhar(500, t);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('desligada: a mesma intrusão sai do alvo e o dwell recomeça', () => {
    EXPERIMENT.toleranciaIntrusoes = false;
    const { onClick } = montar();
    let t = olhar(800, 0);
    t = olhar(300, t, { x: 120, y: 50 });
    olhar(500, t);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('longe demais (bem mais de 1°), a folga não vale', () => {
    EXPERIMENT.toleranciaIntrusoes = true;
    const { onClick } = montar();
    let t = olhar(800, 0);
    t = olhar(600, t, { x: 400, y: 50 });
    olhar(500, t);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('M19 com o alvo coberto', () => {
  it('um aviso que cobre o botão no meio do dwell para o dwell, com a folga ligada', () => {
    EXPERIMENT.toleranciaIntrusoes = true;
    const { onClick } = montar();
    const t = olhar(800, 0);
    cobertoPorAviso = true;
    olhar(900, t);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a folga em volta do botão também não vale enquanto ele está coberto', () => {
    EXPERIMENT.toleranciaIntrusoes = true;
    const { onClick } = montar();
    let t = olhar(800, 0);
    cobertoPorAviso = true;
    olhar(900, t, { x: 120, y: 50 });
    expect(onClick).not.toHaveBeenCalled();
  });
});
