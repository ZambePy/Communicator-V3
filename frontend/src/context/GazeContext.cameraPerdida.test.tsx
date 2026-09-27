import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// -----------------------------------------------------------------------------
// Câmera perdida no meio da sessão (CORE-1), lado do provider.
//
// Antes: nenhuma escuta de `ended`/`mute` na track nem de `devicechange`; o
// `cameraError` só existia para falha no boot, a mensagem mandava "recarregar"
// (o F5 é bloqueado no app empacotado) e nada tentava abrir a câmera de novo.
// Uma webcam que caía ou era conectada depois só voltava fechando o app.
// -----------------------------------------------------------------------------

class FakeTrack extends EventTarget {
  kind = 'video';
  readyState: 'live' | 'ended' = 'live';
  muted = false;
  stopped = false;
  constructor(public label: string) { super(); }
  stop() { this.stopped = true; this.readyState = 'ended'; }
  getCapabilities() { return {}; }
  getSettings() { return {}; }
  applyConstraints() { return Promise.resolve(); }
  /** A câmera caiu: o navegador encerra a track e dispara `ended`. */
  cair() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')); }
}

class FakeStream {
  tracks: FakeTrack[];
  constructor(label: string) { this.tracks = [new FakeTrack(label)]; }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks; }
}

/** O que o próximo `getUserMedia` faz: abrir uma stream ou falhar com este erro. */
let proximoGum: Array<'ok' | string> = [];
const streams: FakeStream[] = [];
const devices = new EventTarget();

let estadoDoEngine = 'idle';
let ouvinteDeEstado: ((s: string) => void) | null = null;
const engineStart = vi.fn(async () => { estadoDoEngine = 'tracking'; ouvinteDeEstado?.('tracking'); });

vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return {
    ...real,
    createGazeEngine: () => ({
      start: engineStart,
      stop: vi.fn(),
      dispose: vi.fn(),
      subscribe: () => () => {},
      onStateChange: (cb: (s: string) => void) => { ouvinteDeEstado = cb; cb(estadoDoEngine); return () => { ouvinteDeEstado = null; }; },
      onL2CSStatusChange: () => () => {},
      getState: () => estadoDoEngine,
      getSessionUptimeMs: () => 0,
      getDiagnostics: () => ({ fpsRender: estadoDoEngine === 'sem_camera' ? 0 : 30, framing: { hasFace: false, iodPx: 0 }, video: { width: 0 }, quality: {} }),
      setFilterPreset: vi.fn(),
      setScreenGeometry: vi.fn(),
      calibration: {
        isCalibrated: () => false,
        onInvalidated: () => () => {},
        setCameraFovDeg: vi.fn(),
        setEyeDominance: vi.fn(),
        abort: vi.fn(),
        clear: vi.fn(),
        getDistanceRange: () => null,
        getCalibrationDistancesCm: () => ({ cameraCm: null, screenCm: null }),
      },
      recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
    }),
  };
});

vi.mock('./SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both',
      cameraHorizontalFovDeg: 62.5, screenDiagonalIn: 23.6, viewingDistanceCm: 60,
    },
    updateSettings: vi.fn(),
  }),
}));

import { GazeProvider, useGaze } from './GazeContext';

let gaze: ReturnType<typeof useGaze> | null = null;
const Sonda: React.FC = () => { gaze = useGaze(); return null; };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  proximoGum = [];
  streams.length = 0;
  estadoDoEngine = 'idle';
  ouvinteDeEstado = null;
  engineStart.mockClear();
  gaze = null;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        const passo = proximoGum.shift() ?? 'ok';
        if (passo !== 'ok') throw Object.assign(new Error(passo), { name: passo });
        const s = new FakeStream(`camera-${streams.length}`);
        streams.push(s);
        return s;
      }),
      enumerateDevices: vi.fn(async () => []),
      addEventListener: devices.addEventListener.bind(devices),
      removeEventListener: devices.removeEventListener.bind(devices),
    },
  });
  // jsdom não decodifica vídeo: o primeiro quadro "já chegou".
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(async () => {}) });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function passar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function montar() {
  const r = render(<GazeProvider><Sonda /></GazeProvider>);
  await passar(0);
  return r;
}

describe('câmera perdida no meio da sessão (CORE-1)', () => {
  it('track terminada: avisa na hora, reabre a câmera e o aviso some quando ela volta', async () => {
    const { unmount } = await montar();
    expect(engineStart).toHaveBeenCalledTimes(1);
    expect(streams).toHaveLength(1);
    expect(gaze!.cameraAtiva()).toBe(true);

    await act(async () => { streams[0].tracks[0].cair(); });
    // O engine NÃO é reiniciado: a stream nova entra no mesmo <video>.
    await passar(0);
    expect(streams).toHaveLength(2);
    expect(engineStart).toHaveBeenCalledTimes(1);
    expect(gaze!.cameraError).toBeNull();
    expect(gaze!.cameraAtiva()).toBe(true);
    unmount();
  });

  it('a reabertura falha: mensagem sem "recarregue" e nova tentativa sozinha, com espera', async () => {
    const { unmount } = await montar();
    proximoGum = ['NotFoundError', 'NotFoundError', 'NotFoundError'];
    await act(async () => { streams[0].tracks[0].cair(); });
    await passar(0);
    expect(gaze!.cameraError).toMatch(/Nenhuma câmera encontrada/);
    expect(gaze!.cameraError).toMatch(/tenta de novo/);
    expect(gaze!.cameraError).not.toMatch(/recarregue/i);
    expect(gaze!.cameraAtiva()).toBe(false);

    // Depois da espera, tenta de novo — e desta vez a câmera está lá.
    proximoGum = [];
    await passar(1000);
    expect(streams).toHaveLength(2);
    expect(gaze!.cameraError).toBeNull();
    unmount();
  });

  it('câmera ausente no boot: o engine sobe quando ela é conectada (devicechange), sem esperar', async () => {
    proximoGum = ['NotFoundError', 'NotFoundError', 'NotFoundError'];
    const { unmount } = await montar();
    expect(engineStart).not.toHaveBeenCalled();
    expect(gaze!.cameraError).toMatch(/Nenhuma câmera encontrada/);

    await act(async () => { devices.dispatchEvent(new Event('devicechange')); });
    await passar(0);
    expect(streams).toHaveLength(1);
    expect(engineStart).toHaveBeenCalledTimes(1);
    expect(gaze!.cameraError).toBeNull();
    unmount();
  });

  it('engine sem quadros (driver travado, track "viva"): a câmera é reaberta depois de alguns segundos', async () => {
    const { unmount } = await montar();
    await act(async () => { estadoDoEngine = 'sem_camera'; ouvinteDeEstado?.('sem_camera'); });
    expect(gaze!.cameraAtiva()).toBe(false);
    await passar(2000);
    expect(streams).toHaveLength(1);        // ainda esperando
    await passar(1500);
    expect(streams).toHaveLength(2);        // reaberta
    expect(streams[0].tracks[0].stopped).toBe(true);
    unmount();
  });

  it('um engasgo que se resolve sozinho não reabre nada', async () => {
    const { unmount } = await montar();
    await act(async () => { estadoDoEngine = 'sem_camera'; ouvinteDeEstado?.('sem_camera'); });
    await passar(1000);
    await act(async () => { estadoDoEngine = 'tracking'; ouvinteDeEstado?.('tracking'); });
    await passar(10_000);
    expect(streams).toHaveLength(1);
    unmount();
  });

  it('desmontar cancela as tentativas agendadas', async () => {
    proximoGum = ['NotFoundError', 'NotFoundError', 'NotFoundError'];
    const { unmount } = await montar();
    const pedidos = (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length;
    unmount();
    await passar(60_000);
    expect((navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length).toBe(pedidos);
  });
});
