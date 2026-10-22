import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

// -----------------------------------------------------------------------------
// Pouca luz no provider (pedido de 18/10/2026: a emergência precisa funcionar
// à noite). O medidor do quadro inteiro é trocado por um falso: o jsdom não tem
// canvas, e o que se testa aqui é o que o provider FAZ com a medida.
// -----------------------------------------------------------------------------

const luz = { brilho: 0.42 as number | null };
vi.mock('@tracker/poucaLuz', async (orig) => {
  const real = await orig<typeof import('@tracker/poucaLuz')>();
  class MedidorFalso {
    medir() {
      return luz.brilho;
    }
  }
  return { ...real, MedidorDeBrilhoDoQuadro: MedidorFalso };
});

const engineMock = {
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  dispose: vi.fn(),
  subscribe: (_cb: (s: GazeSample) => void) => () => {},
  onStateChange: () => () => {},
  onL2CSStatusChange: () => () => {},
  getState: () => 'tracking',
  getSessionUptimeMs: () => 1000,
  getDiagnostics: () => null,
  precisaDeRecalibracao: () => ({ precisa: false, motivo: null }),
  setFilterPreset: vi.fn(),
  calibration: {
    isCalibrated: () => true,
    onInvalidated: () => () => {},
    setCameraFovDeg: vi.fn(),
    setEyeDominance: vi.fn(),
    abort: vi.fn(),
    clear: vi.fn(),
    getDistanceRange: () => null,
    getCalibrationDistancesCm: () => ({ cameraCm: null, screenCm: null }),
  },
  recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
};
vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return { ...real, createGazeEngine: () => engineMock };
});

const ajustes = { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both', brightnessLevel: 1, amberFilter: false };
const updateSettings = vi.fn();
vi.mock('./SettingsContext', () => ({ useSettings: () => ({ settings: ajustes, updateSettings }) }));

import { GazeProvider } from './GazeContext';
import { _reiniciarParaTeste as reiniciarProblemas } from '../services/problemaDoRastreamento';

const TITULO = 'Está escuro para a câmera';
let relogio = 0;
const passar = (ms: number) => {
  for (let t = 0; t < ms; t += 500) {
    act(() => {
      relogio += 500;
      vi.advanceTimersByTime(500);
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  relogio = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
  luz.brilho = 0.42;
  ajustes.brightnessLevel = 1;
  ajustes.amberFilter = false;
  updateSettings.mockClear();
  reiniciarProblemas();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera no teste'); }) },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pouca luz durante o uso', () => {
  it('luz normal: nenhum aviso (a saída fica igual à de antes)', () => {
    render(<GazeProvider><p>app</p></GazeProvider>);
    passar(30_000);
    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();
  });

  it('escuro por mais de 10 s mostra o aviso; a luz de volta por 3 s o tira', () => {
    render(<GazeProvider><p>app</p></GazeProvider>);
    luz.brilho = 0.05;
    passar(8000);
    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();
    passar(3500);
    expect(screen.getByText(TITULO)).toBeInTheDocument();
    luz.brilho = 0.4;
    passar(4000);
    expect(screen.queryByText(TITULO)).not.toBeInTheDocument();
  });

  it('com a tela escurecida, o aviso oferece "Clarear a tela" (brilho cheio, sem filtro âmbar)', () => {
    ajustes.brightnessLevel = 0.5;
    render(<GazeProvider><p>app</p></GazeProvider>);
    luz.brilho = 0.05;
    passar(11_000);
    expect(screen.getByText(/A tela está escurecida/)).toBeInTheDocument();
    act(() => { screen.getByTestId('clarear-tela').click(); });
    expect(updateSettings).toHaveBeenCalledWith({ brightnessLevel: 1, amberFilter: false });
  });
});
