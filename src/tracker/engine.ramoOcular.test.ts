import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Quais redes rodam com `?olho=onnx`.
//
// O ramo ocular reusa o worker do L2CS e, com as duas flags ligadas, roda JUNTO
// com a L2CS-Net do rosto. Quem abria `?olho=onnx` para testar a EyeNet via só
// a L2CS-Net no console e não tinha como saber se a EyeNet tinha carregado.
// Aqui: a condição sem rede do rosto (`?ep=off&olho=onnx`) cria só os dois
// workers do olho; o diagnóstico diz o estado da EyeNet; o console diz quais
// redes rodam e, com as duas ligadas, como testar a EyeNet sozinha.

let resolverVision: (() => void) | null = null;
let visionPromise: Promise<unknown>;

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: () => visionPromise,
  },
  FaceLandmarker: {
    createFromOptions: async () => ({
      detectForVideo: () => ({ faceLandmarks: [], facialTransformationMatrixes: [] }),
      close: () => {},
    }),
  },
}));

import { createGazeEngine } from './engine';
import { EXPERIMENT } from '../config/experiment';
import type { L2CSModelMeta, L2CSWorkerRequest, L2CSWorkerResponse } from '../l2cs/types';

class FakeWorker {
  static todos: FakeWorker[] = [];
  posted: L2CSWorkerRequest[] = [];
  private ouvintes: Record<string, Array<(ev: unknown) => void>> = {};
  constructor(_url: URL | string, _opts?: WorkerOptions) {
    FakeWorker.todos.push(this);
  }
  addEventListener(tipo: string, fn: (ev: unknown) => void): void {
    (this.ouvintes[tipo] ??= []).push(fn);
  }
  removeEventListener(): void {}
  postMessage(msg: L2CSWorkerRequest): void {
    this.posted.push(msg);
  }
  terminate(): void {}
  responder(data: L2CSWorkerResponse): void {
    for (const fn of this.ouvintes.message ?? []) fn({ data });
  }
  get init(): Extract<L2CSWorkerRequest, { type: 'init' }> | undefined {
    return this.posted.find((m): m is Extract<L2CSWorkerRequest, { type: 'init' }> => m.type === 'init');
  }
}

const META_DO_OLHO = JSON.parse(
  readFileSync(resolve(__dirname, '../../frontend/public/models/eyenet/eyenet.meta.json'), 'utf8'),
) as L2CSModelMeta;

const PRONTO: L2CSWorkerResponse = {
  type: 'ready',
  meta: META_DO_OLHO,
  executionProvider: 'webgpu',
  requested: 'auto',
  fallback: false,
  verificacao: { sha256Calculado: META_DO_OLHO.sha256 ?? null, hashConfere: true },
};

function videoFalso(): HTMLVideoElement {
  return { currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false } as unknown as HTMLVideoElement;
}

const esvaziar = () => new Promise((r) => setTimeout(r, 0));

const flagsAntes = { eyeNet: EXPERIMENT.eyeNet, l2cs: EXPERIMENT.l2cs };
let logs: string[] = [];

beforeEach(() => {
  visionPromise = new Promise((res) => { resolverVision = () => res({}); });
  FakeWorker.todos = [];
  logs = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  EXPERIMENT.eyeNet = flagsAntes.eyeNet;
  EXPERIMENT.l2cs = flagsAntes.l2cs;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function iniciar(flags: { eyeNet: 'off' | 'onnx'; l2cs: 'auto' | 'off' }) {
  EXPERIMENT.eyeNet = flags.eyeNet;
  EXPERIMENT.l2cs = flags.l2cs;
  const engine = createGazeEngine('http://test/mediapipe');
  const p = engine.start(videoFalso());
  resolverVision!();
  await p;
  return engine;
}

describe('ramo ocular no engine', { timeout: 20_000 }, () => {
  it('EyeNet no lugar da L2CS-Net (`?ep=off&olho=onnx`): só os workers do olho, e o status chega a pronto', async () => {
    const engine = await iniciar({ eyeNet: 'onnx', l2cs: 'off' });

    // Nenhum worker para o rosto: só os dois da EyeNet, rotulados.
    expect(FakeWorker.todos.map((w) => w.init?.rotulo)).toEqual(['[olho esquerdo]', '[olho direito]']);
    expect(engine.getL2CSStatus()).toBe('disabled');
    expect(engine.getDiagnostics().olho.status).toBe('carregando');

    for (const w of FakeWorker.todos) w.responder(PRONTO);
    await esvaziar();

    const d = engine.getDiagnostics().olho;
    expect(d.status).toBe('pronto');
    expect(d.executionProvider).toBe('webgpu');
    expect(d.modelo?.arquivo).toBe('eyenet.onnx');
    expect(d.modelo?.integridade).toBe('confere');

    expect(logs.some((l) => l.includes('redes desta sessão') && l.includes('rosto: desligada') && l.includes('olhos: EyeNet'))).toBe(true);
    expect(logs.some((l) => l.includes('nenhuma L2CS-Net roda'))).toBe(true);
    expect(logs.some((l) => l.includes('ramo ocular pronto') && l.includes('hash confere'))).toBe(true);
    expect(logs.some((l) => l.includes('modelo do rosto'))).toBe(false);

    engine.dispose();
    expect(engine.getDiagnostics().olho.status).toBe('desligado');
  });

  it('com a rede do rosto ligada, o console avisa que a EyeNet roda junto e como testá-la sozinha', async () => {
    const engine = await iniciar({ eyeNet: 'onnx', l2cs: 'auto' });

    expect(FakeWorker.todos.map((w) => w.init?.rotulo)).toEqual(['[olho esquerdo]', '[olho direito]', '[L2CS]']);
    expect(logs.some((l) => l.includes('roda JUNTO com a L2CS-Net') && l.includes('?ep=off&olho=onnx'))).toBe(true);
    engine.dispose();
  });

  it('EyeNet que não carrega: status erro, e um dispose depois zera o status', async () => {
    const engine = await iniciar({ eyeNet: 'onnx', l2cs: 'off' });
    for (const w of FakeWorker.todos) w.responder({ type: 'init_error', error: 'model HTTP 404' });
    await esvaziar();
    expect(engine.getDiagnostics().olho.status).toBe('erro');
    expect(engine.getDiagnostics().olho.modelo).toBeNull();
    engine.dispose();
    expect(engine.getDiagnostics().olho.status).toBe('desligado');
  });

  it('resposta que chega depois do dispose não ressuscita o status', async () => {
    const engine = await iniciar({ eyeNet: 'onnx', l2cs: 'off' });
    const workers = [...FakeWorker.todos];
    engine.dispose();
    for (const w of workers) w.responder(PRONTO);
    await esvaziar();
    expect(engine.getDiagnostics().olho.status).toBe('desligado');
  });

  it('com a flag desligada, nenhum worker de olho e status desligado', async () => {
    const engine = await iniciar({ eyeNet: 'off', l2cs: 'off' });
    expect(FakeWorker.todos).toHaveLength(0);
    expect(engine.getDiagnostics().olho.status).toBe('desligado');
    expect(engine.getDiagnostics().olho.ativo).toBe(false);
    engine.dispose();
  });
});
