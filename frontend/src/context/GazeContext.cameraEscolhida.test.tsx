import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 3): a câmera
// escolhida no Preparo nunca chegava ao rastreador. O engine abria com
// `facingMode: 'user'` (no Chromium, a integrada do notebook), e o Preparo
// mostrava uma câmera enquanto media outra. Aqui, o lado do provider.
// -----------------------------------------------------------------------------

class FakeTrack extends EventTarget {
  kind = 'video';
  readyState: 'live' | 'ended' = 'live';
  muted = false;
  stopped = false;
  constructor(public deviceId: string) { super(); }
  get label() { return `câmera ${this.deviceId}`; }
  stop() { this.stopped = true; this.readyState = 'ended'; }
  getCapabilities() { return {}; }
  getSettings() { return { deviceId: this.deviceId }; }
  applyConstraints() { return Promise.resolve(); }
}

class FakeStream {
  tracks: FakeTrack[];
  constructor(deviceId: string) { this.tracks = [new FakeTrack(deviceId)]; }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks; }
}

/** As câmeras ligadas; `exact` de uma que não está aqui falha como no Chromium. */
let ligadas: string[] = [];
let padrao = 'integrada';
const pedidos: MediaStreamConstraints[] = [];
const streams: FakeStream[] = [];
/** Quando definido, o próximo `getUserMedia` só responde quando o teste mandar. */
let segurar: { liberar: () => void } | null = null;
const devices = new EventTarget();

function abrir(c: MediaStreamConstraints): FakeStream {
  const v = c.video === true ? {} : (c.video as MediaTrackConstraints);
  const id = v.deviceId as { exact?: string; ideal?: string } | undefined;
  let escolhido = padrao;
  if (id?.exact) {
    if (!ligadas.includes(id.exact)) throw Object.assign(new Error('Overconstrained'), { name: 'OverconstrainedError' });
    escolhido = id.exact;
  } else if (id?.ideal && ligadas.includes(id.ideal)) {
    escolhido = id.ideal;
  }
  const s = new FakeStream(escolhido);
  streams.push(s);
  return s;
}

let estadoDoEngine = 'idle';
let ouvinteDeEstado: ((s: string) => void) | null = null;
const amostras: Array<(s: unknown) => void> = [];
const engineStart = vi.fn(async () => { estadoDoEngine = 'tracking'; ouvinteDeEstado?.('tracking'); });

vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return {
    ...real,
    createGazeEngine: () => ({
      start: engineStart,
      stop: vi.fn(),
      dispose: vi.fn(),
      subscribe: (cb: (s: unknown) => void) => { amostras.push(cb); return () => {}; },
      onStateChange: (cb: (s: string) => void) => { ouvinteDeEstado = cb; cb(estadoDoEngine); return () => { ouvinteDeEstado = null; }; },
      onL2CSStatusChange: () => () => {},
      getState: () => estadoDoEngine,
      getSessionUptimeMs: () => 0,
      getDiagnostics: () => ({ fpsRender: 30, framing: { hasFace: false, iodPx: 0 }, video: { width: 0 }, quality: {} }),
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

const ajustes = vi.hoisted(() => ({
  settings: {
    dwellMs: 1500, eyeDominance: 'both', cameraHorizontalFovDeg: 62.5, screenDiagonalIn: 23.6,
    viewingDistanceCm: 60, fovPorCamera: {}, ultimaCameraChave: null as string | null,
    cameraDeviceId: 'usb-1' as string | null,
  },
  updateSettings: vi.fn(),
}));
vi.mock('./SettingsContext', () => ({ useSettings: () => ajustes }));

import { GazeProvider, useGaze } from './GazeContext';
import { MENSAGEM_DE_CAMERA_DE_RESERVA } from '../services/camera/abertura';

let gaze: ReturnType<typeof useGaze> | null = null;
const Sonda: React.FC = () => { gaze = useGaze(); return null; };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  ligadas = ['usb-1', 'usb-2', 'integrada'];
  padrao = 'integrada';
  pedidos.length = 0;
  streams.length = 0;
  amostras.length = 0;
  segurar = null;
  estadoDoEngine = 'idle';
  ouvinteDeEstado = null;
  engineStart.mockClear();
  ajustes.updateSettings.mockClear();
  ajustes.settings.cameraDeviceId = 'usb-1';
  gaze = null;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async (c: MediaStreamConstraints) => {
        pedidos.push(c);
        if (segurar) {
          const s = segurar;
          segurar = null;
          await new Promise<void>((r) => { s.liberar = r; });
        }
        return abrir(c);
      }),
      enumerateDevices: vi.fn(async () => ligadas.map((deviceId) => ({ kind: 'videoinput', deviceId, label: deviceId }))),
      addEventListener: devices.addEventListener.bind(devices),
      removeEventListener: devices.removeEventListener.bind(devices),
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(async () => {}) });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as unknown as { irisflowSystem?: unknown }).irisflowSystem;
});

async function passar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function montar() {
  const r = render(<GazeProvider><Sonda /></GazeProvider>);
  await passar(0);
  return r;
}

const deviceIdPedido = (c: MediaStreamConstraints) =>
  c.video === true ? undefined : ((c.video as MediaTrackConstraints).deviceId as Record<string, string> | undefined);

describe('a câmera do rastreador é a escolhida no Preparo', () => {
  it('abre com deviceId exato e sem facingMode', async () => {
    const { unmount } = await montar();
    expect(deviceIdPedido(pedidos[0])).toEqual({ exact: 'usb-1' });
    for (const p of pedidos) expect(JSON.stringify(p)).not.toMatch(/facingMode/);
    expect(gaze!.getCameraAtual().deviceId).toBe('usb-1');
    expect(gaze!.avisoDeCamera).toBeNull();
    unmount();
  });

  it('a escolhida não está ligada: abre outra e AVISA na tela', async () => {
    ligadas = ['integrada'];
    const { unmount } = await montar();
    expect(engineStart).toHaveBeenCalledTimes(1);
    expect(gaze!.getCameraAtual().deviceId).toBe('integrada');
    expect(gaze!.avisoDeCamera).toBe(MENSAGEM_DE_CAMERA_DE_RESERVA);
    unmount();
  });

  it('a escolhida volta a ser ligada (devicechange): o rastreador troca de volta para ela', async () => {
    ligadas = ['integrada'];
    const { unmount } = await montar();
    expect(gaze!.getCameraAtual().deviceId).toBe('integrada');
    ligadas = ['integrada', 'usb-1'];
    await act(async () => { devices.dispatchEvent(new Event('devicechange')); });
    await passar(0);
    expect(gaze!.getCameraAtual().deviceId).toBe('usb-1');
    expect(streams[0].tracks[0].stopped).toBe(true);
    expect(engineStart).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('um aparelho qualquer conectado com a escolhida em uso não reabre nada', async () => {
    const { unmount } = await montar();
    const antes = pedidos.length;
    await act(async () => { devices.dispatchEvent(new Event('devicechange')); });
    await passar(0);
    expect(pedidos.length).toBe(antes);
    unmount();
  });
});

describe('trocarCamera (o Preparo)', () => {
  it('grava a escolha, reabre a câmera do RASTREADOR com ela e sobe a versão da câmera', async () => {
    const { unmount } = await montar();
    const versao = gaze!.versaoDaCamera;
    let r: Awaited<ReturnType<NonNullable<typeof gaze>['trocarCamera']>> | null = null;
    await act(async () => { r = await gaze!.trocarCamera('usb-2'); });
    expect(ajustes.updateSettings).toHaveBeenCalledWith({ cameraDeviceId: 'usb-2' });
    expect(deviceIdPedido(pedidos[pedidos.length - 1])).toEqual({ exact: 'usb-2' });
    expect(r).toEqual({ ok: true, deviceId: 'usb-2', caiuParaOutra: false });
    // A câmera anterior foi solta antes, e o engine NÃO foi reiniciado.
    expect(streams[0].tracks[0].stopped).toBe(true);
    expect(engineStart).toHaveBeenCalledTimes(1);
    // Quem mostra o preview reaponta para a mesma stream do rastreador.
    expect(gaze!.versaoDaCamera).toBeGreaterThan(versao);
    expect(gaze!.getCameraStream()).toBe(streams[streams.length - 1] as unknown as MediaStream);
    unmount();
  });

  it('escolhida que não abre: resolve dizendo que caiu para outra', async () => {
    const { unmount } = await montar();
    ligadas = ['integrada', 'usb-1'];
    let r: { caiuParaOutra: boolean; deviceId: string | null } | null = null;
    await act(async () => { r = await gaze!.trocarCamera('usb-9'); });
    expect(r).toMatchObject({ caiuParaOutra: true, deviceId: 'integrada' });
    expect(gaze!.avisoDeCamera).toBe(MENSAGEM_DE_CAMERA_DE_RESERVA);
    unmount();
  });

  it('pedida enquanto o boot ainda abre a câmera: espera e abre a escolhida mais recente', async () => {
    segurar = { liberar: () => {} };
    const portao = segurar;
    const { unmount } = render(<GazeProvider><Sonda /></GazeProvider>);
    await passar(0);
    let resolvida = false;
    let resultado: { deviceId: string | null } | null = null;
    void gaze!.trocarCamera('usb-2').then((r) => { resolvida = true; resultado = r; });
    await passar(0);
    expect(resolvida).toBe(false);
    await act(async () => { portao.liberar(); });
    await passar(0);
    expect(resolvida).toBe(true);
    expect(resultado).toMatchObject({ deviceId: 'usb-2' });
    expect(deviceIdPedido(pedidos[pedidos.length - 1])).toEqual({ exact: 'usb-2' });
    unmount();
  });
});

describe('batida para o vigia de página travada (item 4)', () => {
  it('as amostras do engine batem pelo preload; desmontar desarma o vigia', async () => {
    const vivo = vi.fn();
    (window as unknown as { irisflowSystem: unknown }).irisflowSystem = { vivo };
    const { unmount } = await montar();
    // A batida é a primeira assinatura das amostras (logo depois de criar o engine).
    act(() => { amostras[0]({ x: 0, y: 0, timestamp: 0, hasFace: false }); });
    expect(vivo).toHaveBeenLastCalledWith({ rastreando: true });
    unmount();
    expect(vivo).toHaveBeenLastCalledWith({ rastreando: false });
  });
});
