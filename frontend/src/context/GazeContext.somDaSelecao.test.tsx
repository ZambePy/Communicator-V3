import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React, { useEffect } from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

// -----------------------------------------------------------------------------
// "Som ao selecionar" (Configurações): o ajuste existia e não tocava nada
// (achado de 19/10/2026). Agora o clique pelo olhar toca um toque curto quando
// o ajuste está ligado, e fica em silêncio quando está desligado.
// -----------------------------------------------------------------------------

let emitir: (s: GazeSample) => void = () => {};
let relogio = 0;

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

const ajustes = { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both', soundEnabled: true };
vi.mock('./SettingsContext', () => ({
  useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }),
}));

const tocarSomDaSelecao = vi.fn();
vi.mock('../utils/emergencyAudio', async (orig) => {
  const real = await orig<typeof import('../utils/emergencyAudio')>();
  return { ...real, tocarSomDaSelecao: () => tocarSomDaSelecao() };
});

/** Liga, por teste, o aprendizado forçado e a falha dele. */
const aprendizado = { forcar: false, lancar: false };
vi.mock('@tracker/interaction/correcaoPorDwell', async (orig) => {
  const real = await orig<typeof import('@tracker/interaction/correcaoPorDwell')>();
  return {
    ...real,
    deveAprender: vi.fn((...a: Parameters<typeof real.deveAprender>) =>
      aprendizado.forcar ? true : real.deveAprender(...a)
    ),
    aprenderComSelecao: vi.fn((...a: Parameters<typeof real.aprenderComSelecao>) => {
      if (aprendizado.lancar) throw new Error('correção por dwell quebrada');
      return real.aprenderComSelecao(...a);
    }),
  };
});

import { GazeProvider, useGaze } from './GazeContext';

const DWELL_MS = 1500;

function amostra(over: Partial<GazeSample> = {}): GazeSample {
  return {
    x: 50,
    y: 50,
    timestamp: 0,
    hasFace: true,
    degraded: false,
    uncalibrated: false,
    eyeState: 'open',
    ...over,
  } as GazeSample;
}

/** Emite quadros a 30 fps por `ms`, com o carimbo de tempo avançando. */
function olhar(ms: number, inicio: number, over: Partial<GazeSample> = {}): number {
  const passo = 1000 / 30;
  act(() => {
    for (let t = inicio; t <= inicio + ms; t += passo) {
      relogio = t;
      emitir(amostra({ timestamp: t, ...over }));
    }
  });
  return inicio + ms + passo;
}

const recebidas: GazeSample[] = [];
/** Um assinante comum do olhar (o teclado, o HUD…). */
const Assinante: React.FC = () => {
  const { subscribe } = useGaze();
  useEffect(() => subscribe((s) => recebidas.push(s)), [subscribe]);
  return null;
};

function montar(botao: React.ReactElement<{ onClick?: () => void }>) {
  const onClick = vi.fn();
  render(
    <GazeProvider>
      <Assinante />
      {React.cloneElement(botao, { onClick })}
    </GazeProvider>
  );
  const el = screen.getByTestId('alvo');
  document.elementFromPoint = vi.fn(() => el);
  return { onClick, el };
}


beforeEach(() => {
  window.location.hash = '#/menu';
  emitir = () => {};
  recebidas.length = 0;
  aprendizado.forcar = false;
  aprendizado.lancar = false;
  ajustes.soundEnabled = true;
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        throw new Error('sem câmera no teste');
      }),
    },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  relogio = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
});
afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('som ao selecionar', () => {
  it('ligado: o clique pelo olhar toca o som uma vez', () => {
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    olhar(DWELL_MS + 400, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(tocarSomDaSelecao).toHaveBeenCalledTimes(1);
  });

  it('desligado: o clique acontece em silêncio', () => {
    ajustes.soundEnabled = false;
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    olhar(DWELL_MS + 400, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(tocarSomDaSelecao).not.toHaveBeenCalled();
  });
});
