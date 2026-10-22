import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Contraluz forte durante o uso (relato de 19/10/2026, falhas silenciosas #1).
 *
 * Antes: enquanto a luz durasse, todo quadro saía com a última posição e
 * `eyeState: 'closed'`. O dwell pausava "por olhos fechados" — nada completava,
 * nem a Emergência — e depois de 2,6 s a tela dizia que os olhos estavam
 * fechados. Agora, por episódio:
 *  1. até a degradação se confirmar (~500 ms): pausa, como antes;
 *  2. até 10 s: posição repetida e NÃO medida, olhos `unknown`, degradada, com
 *     o motivo `contraluz`;
 *  3. depois: a predição volta, degradada e com o motivo (só Emergência e
 *     recuperação aceitam), fora da calibração e do teste de precisão.
 */

let nivelDaLuz: 'ok' | 'forte' = 'ok';
let quadro = 0;
/** O detector "perde" o rosto (silhueta contra a janela). */
let semRosto = false;

function rosto(i: number) {
  const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (k: number, x: number, y: number) => { pts[k] = { x, y, z: 0 }; };
  const dx = 0.004 * Math.sin(i / 5);
  set(33, 0.60, 0.45); set(133, 0.54, 0.45); set(159, 0.57, 0.435); set(145, 0.57, 0.465);
  set(263, 0.40, 0.45); set(362, 0.46, 0.45); set(386, 0.43, 0.435); set(374, 0.43, 0.465);
  set(468, 0.57 + dx, 0.45); set(469, 0.58 + dx, 0.45); set(470, 0.57 + dx, 0.44); set(471, 0.56 + dx, 0.45); set(472, 0.57 + dx, 0.46);
  set(473, 0.43 + dx, 0.45); set(474, 0.44 + dx, 0.45); set(475, 0.43 + dx, 0.44); set(476, 0.42 + dx, 0.45); set(477, 0.43 + dx, 0.46);
  set(1, 0.5, 0.55); set(10, 0.5, 0.30);
  return pts;
}

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: {
    createFromOptions: async () => ({
      detectForVideo: () => ({ faceLandmarks: semRosto ? [] : [rosto(quadro)], facialTransformationMatrixes: [] }),
      close: () => {},
    }),
  },
}));

const feedRawData = vi.fn();
vi.mock('../calibration', async (original) => ({
  ...(await original<typeof import('../calibration')>()),
  isCalibrated: () => true,
  init: () => {},
  feedRawData: (...a: unknown[]) => feedRawData(...a),
  mapGaze: (fl: number[], fr: number[]) => ({ x: 640 + 8000 * (fl[0] + fr[0]) / 2, y: 360 }),
}));

const feedAccuracyRaw = vi.fn();
const feedAccuracyFiltered = vi.fn();
vi.mock('../accuracy', async (original) => ({
  ...(await original<typeof import('../accuracy')>()),
  feedAccuracyRaw: (...a: unknown[]) => feedAccuracyRaw(...a),
  feedAccuracyFiltered: (...a: unknown[]) => feedAccuracyFiltered(...a),
}));

vi.mock('../contraluz', async (original) => {
  const real = await original<typeof import('../contraluz')>();
  class MedidorDeContraluz {
    medir() {
      return nivelDaLuz === 'forte'
        ? { rosto: 0.15, fundo: 0.6, razao: 4, nivel: 'forte' as const }
        : { rosto: 0.5, fundo: 0.5, razao: 1, nivel: 'ok' as const };
    }
    reiniciar() {}
    dispose() {}
    get medida() { return null; }
  }
  return { ...real, MedidorDeContraluz };
});

import { createGazeEngine, CONTRALUZ_ATE_PREDIZER_MS, DEGRADED_THRESHOLD_MS, type GazeEngine, type GazeSample } from './engine';

let fila: FrameRequestCallback[] = [];
let agora = 0;
let engine: GazeEngine | null = null;
let video: { currentTime: number; videoWidth: number; videoHeight: number; paused: boolean };

beforeEach(() => {
  fila = [];
  agora = 1000;
  quadro = 0;
  nivelDaLuz = 'ok';
  semRosto = false;
  feedRawData.mockClear();
  feedAccuracyRaw.mockClear();
  feedAccuracyFiltered.mockClear();
  vi.spyOn(performance, 'now').mockImplementation(() => agora);
  vi.spyOn(Date, 'now').mockImplementation(() => 1_760_000_000_000 + agora);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { fila.push(cb); return fila.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  video = { currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false };
});

afterEach(() => {
  engine?.dispose();
  engine = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Avança `n` quadros de câmera a ~30 Hz (as amostras chegam pelo `subscribe`). */
function quadros(n: number, _amostras: Array<{ t: number; s: GazeSample }>): void {
  for (let i = 0; i < n; i++) {
    quadro++;
    video.currentTime += 1 / 30;
    agora += 33;
    const q = fila;
    fila = [];
    for (const cb of q) cb(agora);
  }
}

async function ligar(): Promise<Array<{ t: number; s: GazeSample }>> {
  engine = createGazeEngine('http://teste/mediapipe');
  const amostras: Array<{ t: number; s: GazeSample }> = [];
  engine.subscribe((s) => amostras.push({ t: agora, s }));
  await engine.start(video as unknown as HTMLVideoElement);
  return amostras;
}

describe('engine — contraluz forte em três fases (relato de 19/10/2026)', () => {
  it('pausa curta, depois posição não medida com o motivo, depois a predição degradada', async () => {
    const amostras = await ligar();
    quadros(60, amostras); // 2 s de luz boa
    expect(engine!.getState()).toBe('tracking');
    const normais = amostras.slice(-10).map((a) => a.s);
    expect(normais.every((s) => s.eyeState === 'open' && s.motivo === undefined && s.posicaoMedida === undefined)).toBe(true);

    nivelDaLuz = 'forte';
    const inicio = agora + 33; // o primeiro quadro forte
    quadros(Math.ceil((CONTRALUZ_ATE_PREDIZER_MS + 2000) / 33), amostras);
    const sob = amostras.filter((a) => a.t >= inicio);

    // FASE 1 — até a degradação se confirmar: olhos `closed`, sem motivo (como antes).
    const fase1 = sob.filter((a) => a.t - inicio < DEGRADED_THRESHOLD_MS - 40);
    expect(fase1.length).toBeGreaterThan(5);
    expect(fase1.every((a) => a.s.eyeState === 'closed' && a.s.motivo === undefined && !a.s.degraded)).toBe(true);

    // FASE 2 — até 10 s: olhos `unknown`, degradada, motivo `contraluz`, posição NÃO medida e parada.
    const fase2 = sob.filter((a) => a.t - inicio > DEGRADED_THRESHOLD_MS + 40 && a.t - inicio < CONTRALUZ_ATE_PREDIZER_MS - 40);
    expect(fase2.length).toBeGreaterThan(200);
    for (const { s } of fase2) {
      expect(s.eyeState).toBe('unknown');
      expect(s.degraded).toBe(true);
      expect(s.motivo).toBe('contraluz');
      expect(s.posicaoMedida).toBe(false);
    }
    expect(new Set(fase2.map((a) => a.s.x)).size).toBe(1);
    expect(engine!.getState()).toBe('degraded');

    // FASE 3 — passados 10 s: a predição volta (a posição se mexe), degradada e com o motivo.
    const fase3 = sob.filter((a) => a.t - inicio > CONTRALUZ_ATE_PREDIZER_MS + 40);
    expect(fase3.length).toBeGreaterThan(30);
    for (const { s } of fase3) {
      expect(s.eyeState).toBe('open');
      expect(s.degraded).toBe(true);
      expect(s.motivo).toBe('contraluz');
      expect(s.posicaoMedida).toBeUndefined();
    }
    expect(new Set(fase3.map((a) => Math.round(a.s.x))).size).toBeGreaterThan(3);
    expect(engine!.getState()).toBe('degraded');
  });

  it('na fase 3 o quadro não entra na calibração nem no teste de precisão', async () => {
    const amostras = await ligar();
    quadros(30, amostras);
    const comLuzBoa = feedRawData.mock.calls.length;
    expect(comLuzBoa).toBeGreaterThan(0);
    expect(feedAccuracyRaw).toHaveBeenCalled();
    nivelDaLuz = 'forte';
    quadros(Math.ceil(CONTRALUZ_ATE_PREDIZER_MS / 33) + 60, amostras);
    expect(amostras.at(-1)!.s.motivo).toBe('contraluz');
    expect(amostras.at(-1)!.s.posicaoMedida).toBeUndefined(); // já é a fase 3
    expect(feedRawData.mock.calls.length).toBe(comLuzBoa);
    const brutos = feedAccuracyRaw.mock.calls.length;
    const filtrados = feedAccuracyFiltered.mock.calls.length;
    quadros(30, amostras);
    expect(feedAccuracyRaw.mock.calls.length).toBe(brutos);
    expect(feedAccuracyFiltered.mock.calls.length).toBe(filtrados);
  });

  it('a luz melhorou: a saída volta a ser a de sempre já no quadro seguinte', async () => {
    const amostras = await ligar();
    quadros(30, amostras);
    nivelDaLuz = 'forte';
    quadros(120, amostras);
    expect(amostras.at(-1)!.s.motivo).toBe('contraluz');
    nivelDaLuz = 'ok';
    const volta = agora + 33;
    quadros(30, amostras);
    const depois = amostras.filter((a) => a.t >= volta).map((a) => a.s);
    expect(depois.length).toBeGreaterThan(20);
    expect(depois.every((s) => s.eyeState === 'open' && s.motivo === undefined && s.posicaoMedida === undefined)).toBe(true);
    expect(engine!.getState()).toBe('tracking');
  });

  it('o episódio atravessa uma perda de rosto: a volta da Emergência não recomeça do zero', async () => {
    // Numa silhueta contra a janela o detector perde o rosto o tempo todo. Se
    // cada perda zerasse o episódio, os 10 s nunca chegariam — e a Emergência
    // nunca voltaria, que é o defeito que este pacote corrige.
    const amostras = await ligar();
    quadros(30, amostras);
    nivelDaLuz = 'forte';
    quadros(Math.ceil(6000 / 33), amostras); // 6 s de contraluz
    semRosto = true;
    const perda = agora + 33;
    quadros(30, amostras); // 1 s sem rosto
    expect(amostras.filter((a) => a.t >= perda).every((a) => a.s.hasFace === false)).toBe(true);
    semRosto = false;
    quadros(Math.ceil(4000 / 33), amostras); // mais 4 s: o episódio já passa de 10 s
    const ultima = amostras.at(-1)!.s;
    expect(ultima.hasFace).toBe(true);
    expect(ultima.motivo).toBe('contraluz');
    expect(ultima.posicaoMedida).toBeUndefined(); // fase 3: predição de volta
    expect(ultima.degraded).toBe(true);
  });
});
