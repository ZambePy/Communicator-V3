import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * CORE-3 no engine: com a calibração SUSPENSA (janela fora do tamanho em que
 * ela foi feita), as amostras com rosto saem `degraded` — o dwell só aceita a
 * Emergência e os alvos de recuperação — e o estado é `degraded`. Quando a
 * suspensão acaba, tudo volta a `tracking` sem recalibrar.
 */

const controle = vi.hoisted(() => ({ suspensa: false }));

vi.mock('@mediapipe/tasks-vision', () => {
  const rosto = () => {
    const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    const set = (i: number, x: number, y: number) => { pts[i] = { x, y, z: 0 }; };
    set(33, 0.60, 0.45); set(133, 0.54, 0.45); set(159, 0.57, 0.435); set(145, 0.57, 0.465);
    set(263, 0.40, 0.45); set(362, 0.46, 0.45); set(386, 0.43, 0.435); set(374, 0.43, 0.465);
    set(468, 0.57, 0.45); set(469, 0.58, 0.45); set(470, 0.57, 0.44); set(471, 0.56, 0.45); set(472, 0.57, 0.46);
    set(473, 0.43, 0.45); set(474, 0.44, 0.45); set(475, 0.43, 0.44); set(476, 0.42, 0.45); set(477, 0.43, 0.46);
    set(1, 0.5, 0.55); set(10, 0.5, 0.30);
    return pts;
  };
  return {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceLandmarker: {
      createFromOptions: async () => ({
        detectForVideo: () => ({ faceLandmarks: [rosto()], facialTransformationMatrixes: [] }),
        close: () => {},
      }),
    },
  };
});

vi.mock('../calibration', async (original) => ({
  ...(await original<typeof import('../calibration')>()),
  isCalibrated: () => true,
  mapGaze: () => ({ x: 640, y: 360 }),
  init: () => {},
  getSuspensaoDaCalibracao: () => (controle.suspensa
    ? { calibracao: { w: 1920, h: 1080, dpr: 1 }, atual: { w: 1280, h: 800, dpr: 1 }, desde: 0 }
    : null),
}));

import { createGazeEngine, type GazeEngine, type GazeSample } from './engine';

let fila: FrameRequestCallback[] = [];
let agora = 0;
let engine: GazeEngine | null = null;

beforeEach(() => {
  fila = [];
  agora = 1000;
  controle.suspensa = false;
  vi.spyOn(performance, 'now').mockImplementation(() => agora);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { fila.push(cb); return fila.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  engine?.dispose();
  engine = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function quadros(video: HTMLVideoElement, n: number): void {
  for (let i = 0; i < n; i++) {
    agora += 16;
    (video as unknown as { currentTime: number }).currentTime += 1 / 60;
    const q = fila;
    fila = [];
    for (const cb of q) cb(agora);
  }
}

describe('engine — calibração suspensa pela janela (CORE-3)', () => {
  it('amostras degradadas e estado degraded enquanto suspensa; volta a tracking sozinho', async () => {
    const video = { currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false } as unknown as HTMLVideoElement;
    engine = createGazeEngine('http://teste/mediapipe');
    const amostras: GazeSample[] = [];
    engine.subscribe((s) => amostras.push(s));
    await engine.start(video);

    quadros(video, 60);
    expect(engine.getState()).toBe('tracking');
    expect(amostras.filter((s) => s.hasFace).every((s) => !s.degraded)).toBe(true);

    controle.suspensa = true;
    const antes = amostras.length;
    quadros(video, 60);
    const suspensas = amostras.slice(antes).filter((s) => s.hasFace);
    expect(suspensas.length).toBeGreaterThan(0);
    expect(suspensas.every((s) => s.degraded === true && !s.uncalibrated)).toBe(true);
    expect(engine.getState()).toBe('degraded');

    controle.suspensa = false;
    const depois = amostras.length;
    quadros(video, 60);
    expect(amostras.slice(depois).filter((s) => s.hasFace).every((s) => !s.degraded)).toBe(true);
    expect(engine.getState()).toBe('tracking');
  });
});
