import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Câmera que para no meio da sessão (CORE-1).
 *
 * Quando a track termina (cabo solto, hub USB que reinicia, notebook que dormiu,
 * driver travado) o `currentTime` do <video> congela. O engine só processava
 * quadros NOVOS: sem eles, ficava em `tracking` para sempre, não emitia nada —
 * nem a amostra de rosto perdido que faz o dwell zerar — e o heartbeat dizia ao
 * cuidador "câmera ok, rastreador ok".
 */

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

// Calibração pronta: o que se observa é o estado `tracking` e o que vem depois.
vi.mock('../calibration', async (original) => ({
  ...(await original<typeof import('../calibration')>()),
  isCalibrated: () => true,
  mapGaze: () => ({ x: 640, y: 360 }),
  init: () => {},
}));

import { createGazeEngine, CAMERA_PARADA_MS, type GazeEngine, type GazeSample } from './engine';

let fila: FrameRequestCallback[] = [];
let agora = 0;
let engine: GazeEngine | null = null;

beforeEach(() => {
  fila = [];
  agora = 1000;
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

function quadroDeTela(msPorQuadro = 16): void {
  agora += msPorQuadro;
  const q = fila;
  fila = [];
  for (const cb of q) cb(agora);
}

describe('engine — câmera que para no meio da sessão (CORE-1)', () => {
  it('sem quadro novo por mais de 1,5 s: estado sem_camera e amostras hasFace:false; volta sozinho', async () => {
    const video = { currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false } as unknown as HTMLVideoElement;
    engine = createGazeEngine('http://teste/mediapipe');
    const estados: string[] = [];
    engine.onStateChange((s) => estados.push(s));
    const amostras: Array<{ t: number; s: GazeSample }> = [];
    engine.subscribe((s) => amostras.push({ t: agora, s }));
    await engine.start(video);

    // 3 s de câmera saudável.
    for (let i = 0; i < 180; i++) {
      (video as unknown as { currentTime: number }).currentTime += 1 / 60;
      quadroDeTela();
    }
    expect(engine.getState()).toBe('tracking');

    // A câmera PARA: o currentTime congela.
    const congelou = agora;
    for (let i = 0; i < 60 * 10; i++) quadroDeTela(); // 10 s de rAF
    expect(engine.getState()).toBe('sem_camera');
    const quandoMudou = amostras.find((a) => a.t > congelou && !a.s.hasFace)?.t;
    expect(quandoMudou).toBeDefined();
    expect(quandoMudou! - congelou).toBeLessThanOrEqual(CAMERA_PARADA_MS + 50);
    const semRosto = amostras.filter((a) => a.t > congelou && !a.s.hasFace);
    // ~30 Hz durante ~8,5 s, e nenhuma amostra fingindo rosto.
    expect(semRosto.length).toBeGreaterThan(150);
    expect(amostras.filter((a) => a.t > congelou + CAMERA_PARADA_MS + 50 && a.s.hasFace)).toHaveLength(0);
    expect(engine.getDiagnostics().fpsRender).toBe(0);

    // A câmera volta (reaberta pelo provider, ou o driver destravou).
    const voltou = agora;
    for (let i = 0; i < 30; i++) {
      (video as unknown as { currentTime: number }).currentTime += 1 / 60;
      quadroDeTela();
    }
    expect(engine.getState()).toBe('tracking');
    expect(amostras.some((a) => a.t > voltou && a.s.hasFace)).toBe(true);
    expect(estados).toEqual(['idle', 'loading', 'tracking', 'sem_camera', 'tracking']);
  });

  it('um engasgo curto do decoder (< 1,5 s) não vira sem_camera', async () => {
    const video = { currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false } as unknown as HTMLVideoElement;
    engine = createGazeEngine('http://teste/mediapipe');
    await engine.start(video);
    for (let i = 0; i < 60; i++) {
      (video as unknown as { currentTime: number }).currentTime += 1 / 60;
      quadroDeTela();
    }
    for (let i = 0; i < 60; i++) quadroDeTela(); // ~1 s sem quadro
    expect(engine.getState()).toBe('tracking');
  });
});
