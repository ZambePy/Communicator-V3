import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Saída do engine para entrada NORMAL — gravada antes do pacote "rastreamento
 * robusto" (relato de 19/10/2026) e conferida número a número depois dele.
 *
 * O pacote mexe nos ramos de falha do laço (contraluz forte, predição não
 * finita, worker do L2CS que morre). A regra do projeto para correção de
 * robustez é provar que a saída normal fica IDÊNTICA: mesmas amostras, mesmos
 * números até o último bit, mesmos estados, e nenhum campo novo nas amostras
 * de um quadro normal. Esta sessão sintética passa por olhar parado, sacadas,
 * uma piscada, uma perda de rosto e a volta dele, com a luz medida como boa.
 *
 * Regravar (só quando uma mudança de saída for intencional e medida):
 *   IRISFLOW_GRAVAR_SAIDA_NORMAL=1 npx vitest run src/tracker/engine.saidaNormal.test.ts
 */

const ARQUIVO = resolve(__dirname, '../../fixtures/saida-normal-do-engine.json');

/** Quadro corrente da sessão sintética; o FaceLandmarker falso o lê. */
let quadro = 0;

/** Rosto sintético do quadro `i`: íris que passeia, piscada e perda de rosto. */
function rostoDoQuadro(i: number): Array<{ x: number; y: number; z: number }> | null {
  if (i >= 150 && i < 170) return null; // perda de rosto
  const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (k: number, x: number, y: number) => { pts[k] = { x, y, z: 0 }; };
  // Olhar: oscilação lenta (fixação com tremor) e uma sacada no quadro 96.
  const dx = 0.004 * Math.sin(i / 7) + (i >= 96 ? 0.006 : 0);
  const dy = 0.003 * Math.cos(i / 11) - (i >= 96 ? 0.002 : 0);
  const piscando = i >= 90 && i < 96;
  const abertura = piscando ? 0.001 : 0.015;
  set(33, 0.60, 0.45); set(133, 0.54, 0.45); set(159, 0.57, 0.45 - abertura); set(145, 0.57, 0.45 + abertura);
  set(263, 0.40, 0.45); set(362, 0.46, 0.45); set(386, 0.43, 0.45 - abertura); set(374, 0.43, 0.45 + abertura);
  const irisE = { x: 0.57 + dx, y: 0.45 + dy };
  const irisD = { x: 0.43 + dx, y: 0.45 + dy };
  set(468, irisE.x, irisE.y); set(469, irisE.x + 0.01, irisE.y); set(470, irisE.x, irisE.y - 0.01);
  set(471, irisE.x - 0.01, irisE.y); set(472, irisE.x, irisE.y + 0.01);
  set(473, irisD.x, irisD.y); set(474, irisD.x + 0.01, irisD.y); set(475, irisD.x, irisD.y - 0.01);
  set(476, irisD.x - 0.01, irisD.y); set(477, irisD.x, irisD.y + 0.01);
  set(1, 0.5 + 0.001 * Math.sin(i / 13), 0.55); set(10, 0.5, 0.30);
  return pts;
}

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: {
    createFromOptions: async () => ({
      detectForVideo: () => {
        const r = rostoDoQuadro(quadro);
        return { faceLandmarks: r ? [r] : [], facialTransformationMatrixes: [] };
      },
      close: () => {},
    }),
  },
}));

// Calibração pronta, com um modelo determinístico: a predição é função das
// features do quadro, então o filtro e o resto do laço trabalham sobre um sinal
// que se mexe.
vi.mock('../calibration', async (original) => ({
  ...(await original<typeof import('../calibration')>()),
  isCalibrated: () => true,
  init: () => {},
  mapGaze: (fl: number[], fr: number[]) => ({
    x: 640 + 8000 * (fl[0] + fr[0]) / 2,
    y: 360 + 8000 * (fl[1] + fr[1]) / 2,
  }),
}));

// Luz medida como BOA o tempo todo: é o caso normal de uso.
vi.mock('../contraluz', async (original) => {
  const real = await original<typeof import('../contraluz')>();
  class MedidorDeContraluz {
    medir() { return { rosto: 0.5, fundo: 0.5, razao: 1, nivel: 'ok' as const }; }
    reiniciar() {}
    dispose() {}
    get medida() { return null; }
  }
  return { ...real, MedidorDeContraluz };
});

import { createGazeEngine, type GazeEngine, type GazeSample } from './engine';

let fila: FrameRequestCallback[] = [];
let agora = 0;
let engine: GazeEngine | null = null;

beforeEach(() => {
  fila = [];
  agora = 1000;
  quadro = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => agora);
  // O detector de piscada usa `Date.now()`: o mesmo relógio virtual, para a
  // sessão não depender da velocidade da máquina.
  vi.spyOn(Date, 'now').mockImplementation(() => 1_760_000_000_000 + agora);
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

interface Registro {
  amostras: Array<Record<string, unknown>>;
  estados: string[];
}

async function rodarSessao(): Promise<Registro> {
  const video = { currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false } as unknown as HTMLVideoElement;
  engine = createGazeEngine('http://teste/mediapipe');
  const estados: string[] = [];
  engine.onStateChange((s) => estados.push(s));
  const amostras: Array<Record<string, unknown>> = [];
  // A amostra inteira, com as chaves que vierem: um campo novo num quadro
  // normal também é mudança de saída.
  engine.subscribe((s: GazeSample) => amostras.push({ ...s }));
  await engine.start(video);
  for (quadro = 0; quadro < 240; quadro++) {
    (video as unknown as { currentTime: number }).currentTime += 1 / 30;
    agora += 33;
    const q = fila;
    fila = [];
    for (const cb of q) cb(agora);
  }
  return { amostras, estados };
}

describe('engine — saída para entrada normal (relato de 19/10/2026)', () => {
  it('é idêntica, número a número, à gravada antes do pacote de robustez', async () => {
    const r = await rodarSessao();
    // A sessão passa pelos ramos que interessam: olho aberto, piscada e rosto perdido.
    expect(r.amostras.some((a) => a.eyeState === 'open')).toBe(true);
    expect(r.amostras.some((a) => a.eyeState === 'closed')).toBe(true);
    expect(r.amostras.some((a) => a.hasFace === false)).toBe(true);

    if (process.env.IRISFLOW_GRAVAR_SAIDA_NORMAL === '1') {
      writeFileSync(ARQUIVO, `${JSON.stringify(r, null, 1)}\n`);
    }
    const gravado = JSON.parse(readFileSync(ARQUIVO, 'utf8')) as Registro;
    expect(r.estados).toEqual(gravado.estados);
    expect(r.amostras).toHaveLength(gravado.amostras.length);
    // `toStrictEqual`: mesma lista de chaves em cada amostra, mesmos valores.
    expect(r.amostras).toStrictEqual(gravado.amostras);
  });
});
