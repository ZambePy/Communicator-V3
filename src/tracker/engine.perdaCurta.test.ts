import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * M28 no engine (`EXPERIMENT.fixacaoNaPerdaCurta`): um quadro sem rosto no meio
 * da fixação não recomeça o estimador de fixação (M9). Antes, o ramo sem rosto
 * chamava `reiniciar()`: a fixação recomeçava de UMA amostra crua, e o cursor
 * saltava para ela. O teste do estimador cobre o `semRosto()`; este cobre a
 * ligação no engine, que é onde a flag é lida.
 */

let semRosto = false;
/** Onde o mapa põe o olhar (px). */
let alvoX = 640;

function rosto() {
  const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (k: number, x: number, y: number) => { pts[k] = { x, y, z: 0 }; };
  set(33, 0.60, 0.45); set(133, 0.54, 0.45); set(159, 0.57, 0.435); set(145, 0.57, 0.465);
  set(263, 0.40, 0.45); set(362, 0.46, 0.45); set(386, 0.43, 0.435); set(374, 0.43, 0.465);
  set(468, 0.57, 0.45); set(469, 0.58, 0.45); set(470, 0.57, 0.44); set(471, 0.56, 0.45); set(472, 0.57, 0.46);
  set(473, 0.43, 0.45); set(474, 0.44, 0.45); set(475, 0.43, 0.44); set(476, 0.42, 0.45); set(477, 0.43, 0.46);
  set(1, 0.5, 0.55); set(10, 0.5, 0.30);
  return pts;
}

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: {
    createFromOptions: async () => ({
      detectForVideo: () => ({ faceLandmarks: semRosto ? [] : [rosto()], facialTransformationMatrixes: [] }),
      close: () => {},
    }),
  },
}));

const SIGMA = 40;
// O ruído da calibração liga o estimador de fixação (M9) no caminho do One
// Euro. O MESMO objeto a cada quadro: o engine troca o estimador quando o ruído
// muda de identidade.
const RUIDO = { alvos: [{ x: 0.5, y: 0.5, sxx: SIGMA * SIGMA, syy: SIGMA * SIGMA, sxy: 0 }], rho1: 0.8 };
vi.mock('../calibration', async (original) => ({
  ...(await original<typeof import('../calibration')>()),
  isCalibrated: () => true,
  init: () => {},
  feedRawData: () => {},
  mapGaze: () => ({ x: alvoX, y: 360 }),
  getRuidoDaCalibracao: () => RUIDO,
}));

vi.mock('../accuracy', async (original) => ({
  ...(await original<typeof import('../accuracy')>()),
  feedAccuracyRaw: () => {},
  feedAccuracyFiltered: () => {},
}));

import { createGazeEngine, type GazeEngine, type GazeSample } from './engine';
import { EXPERIMENT } from '../config/experiment';

let fila: FrameRequestCallback[] = [];
let agora = 0;
let engine: GazeEngine | null = null;
let video: { currentTime: number; videoWidth: number; videoHeight: number; paused: boolean };
const salvo = { m28: EXPERIMENT.fixacaoNaPerdaCurta, filtro: EXPERIMENT.filterMode, estimador: EXPERIMENT.estimadorDeFixacao };

beforeEach(() => {
  fila = [];
  agora = 1000;
  semRosto = false;
  alvoX = 640;
  EXPERIMENT.filterMode = 'oneEuro';
  EXPERIMENT.estimadorDeFixacao = true;
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
  EXPERIMENT.fixacaoNaPerdaCurta = salvo.m28;
  EXPERIMENT.filterMode = salvo.filtro;
  EXPERIMENT.estimadorDeFixacao = salvo.estimador;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function quadros(n: number): void {
  for (let i = 0; i < n; i++) {
    video.currentTime += 1 / 30;
    agora += 33;
    const q = fila;
    fila = [];
    for (const cb of q) cb(agora);
  }
}

async function ligar(): Promise<GazeSample[]> {
  engine = createGazeEngine('http://teste/mediapipe');
  const amostras: GazeSample[] = [];
  engine.subscribe((s) => amostras.push(s));
  await engine.start(video as unknown as HTMLVideoElement);
  return amostras;
}

/** Fixação parada em 640, um quadro sem rosto e a volta com a amostra a 1σ. Devolve a saída na volta. */
async function voltaDepoisDeUmQuadroSemRosto(): Promise<number> {
  const amostras = await ligar();
  quadros(60);
  const parada = amostras.filter((s) => s.hasFace).at(-1)!;
  expect(parada.x).toBeCloseTo(640, 0);
  semRosto = true;
  quadros(1);
  semRosto = false;
  alvoX = 640 + SIGMA;
  const antes = amostras.length;
  quadros(1);
  const volta = amostras.slice(antes).filter((s) => s.hasFace);
  expect(volta.length).toBeGreaterThan(0);
  return volta[0].x;
}

describe('engine: um quadro sem rosto e a fixação (M28)', () => {
  it('com a flag, a fixação continua: a amostra da volta entra na média, sem salto', async () => {
    EXPERIMENT.fixacaoNaPerdaCurta = true;
    const x = await voltaDepoisDeUmQuadroSemRosto();
    expect(Math.abs(x - 640)).toBeLessThan(0.25 * SIGMA);
  });

  it('sem a flag (base), a fixação recomeça na amostra da volta: o cursor salta para ela', async () => {
    EXPERIMENT.fixacaoNaPerdaCurta = false;
    const x = await voltaDepoisDeUmQuadroSemRosto();
    expect(x).toBeCloseTo(640 + SIGMA, 0);
  });
});
