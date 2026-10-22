import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Modelo do olhar que morre ou passa a errar toda inferência depois de pronto
// (relato de 19/10/2026, falhas silenciosas #10). Antes: status `ready` para
// sempre, bloco angular zerado, nenhum reinício — só o HUD do desenvolvedor
// mostrava "stale 100 %". Agora: status de erro com o motivo, reinício com
// espera crescente (a segunda tentativa força o WASM) e, acabadas as
// tentativas, o erro fica visível e parado.

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: {
    createFromOptions: async () => ({
      detectForVideo: () => ({ faceLandmarks: [], facialTransformationMatrixes: [] }),
      close: () => {},
    }),
  },
}));

import {
  createGazeEngine,
  ESPERAS_DO_REINICIO_DO_MODELO_MS,
  MAX_REINICIOS_DO_MODELO,
  type GazeEngine,
} from './engine';
import { EXPERIMENT } from '../config/experiment';
import { INFERENCIAS_FALHAS_PARA_DESISTIR } from '../l2cs/client';
import type { L2CSModelMeta, L2CSWorkerRequest, L2CSWorkerResponse } from '../l2cs/types';

class FakeWorker {
  static todos: FakeWorker[] = [];
  posted: L2CSWorkerRequest[] = [];
  terminado = false;
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
  terminate(): void { this.terminado = true; }
  responder(data: L2CSWorkerResponse): void {
    for (const fn of this.ouvintes.message ?? []) fn({ data });
  }
  errarSempre(): void {
    for (let i = 0; i < INFERENCIAS_FALHAS_PARA_DESISTIR; i++) {
      this.responder({ type: 'infer_error', id: 500 + i, error: 'GPU device lost' });
    }
  }
  get init(): Extract<L2CSWorkerRequest, { type: 'init' }> | undefined {
    return this.posted.find((m): m is Extract<L2CSWorkerRequest, { type: 'init' }> => m.type === 'init');
  }
}

const META_DO_ROSTO = JSON.parse(
  readFileSync(resolve(__dirname, '../../frontend/public/models/l2cs/l2cs.meta.json'), 'utf8'),
) as L2CSModelMeta;
const META_DO_OLHO = JSON.parse(
  readFileSync(resolve(__dirname, '../../frontend/public/models/eyenet/eyenet.meta.json'), 'utf8'),
) as L2CSModelMeta;

const pronto = (meta: L2CSModelMeta, provider: 'webgpu' | 'wasm'): L2CSWorkerResponse => ({
  type: 'ready', meta, executionProvider: provider, requested: 'auto', fallback: provider === 'wasm',
  verificacao: { sha256Calculado: null, hashConfere: null },
});

const flagsAntes = { eyeNet: EXPERIMENT.eyeNet, l2cs: EXPERIMENT.l2cs };
let engine: GazeEngine | null = null;

/** Deixa as promessas (o `then` do `start()` dos clientes) andarem. */
async function esvaziar(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  FakeWorker.todos = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  engine?.dispose();
  engine = null;
  EXPERIMENT.eyeNet = flagsAntes.eyeNet;
  EXPERIMENT.l2cs = flagsAntes.l2cs;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function iniciar(flags: { eyeNet: 'off' | 'onnx'; l2cs: 'auto' | 'off' }): Promise<GazeEngine> {
  EXPERIMENT.eyeNet = flags.eyeNet;
  EXPERIMENT.l2cs = flags.l2cs;
  engine = createGazeEngine('http://teste/mediapipe');
  await engine.start({ currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false } as unknown as HTMLVideoElement);
  return engine;
}

describe('reinício do modelo do rosto (L2CS)', () => {
  it('worker que passa a errar: erro com motivo, reinício em 2 s, e na segunda tentativa força o WASM', async () => {
    const e = await iniciar({ eyeNet: 'off', l2cs: 'auto' });
    const status: string[] = [];
    e.onL2CSStatusChange((s) => status.push(s));
    FakeWorker.todos[0].responder(pronto(META_DO_ROSTO, 'webgpu'));
    await esvaziar();
    expect(e.getL2CSStatus()).toBe('ready');

    // O dispositivo WebGPU foi perdido: toda inferência falha.
    FakeWorker.todos[0].errarSempre();
    expect(e.getL2CSStatus()).toBe('error');
    expect(e.getDiagnostics().l2cs.motivoDoErro).toBe('falha_do_worker');
    expect(FakeWorker.todos[0].terminado).toBe(true);
    expect(FakeWorker.todos).toHaveLength(1);

    // Primeira tentativa, depois da primeira espera, com o provider de sempre.
    await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[0]);
    expect(FakeWorker.todos).toHaveLength(2);
    expect(FakeWorker.todos[1].init?.provider).toBe('auto');
    // Ela não sobe: continua em erro e agenda a próxima.
    FakeWorker.todos[1].responder({ type: 'init_error', error: 'requestAdapter falhou' });
    await esvaziar();
    expect(e.getL2CSStatus()).toBe('error');
    expect(e.getDiagnostics().l2cs.motivoDoErro).toBe('falha_do_worker');

    // Segunda tentativa: WASM forçado.
    await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[1]);
    expect(FakeWorker.todos).toHaveLength(3);
    expect(FakeWorker.todos[2].init?.provider).toBe('wasm');
    FakeWorker.todos[2].responder(pronto(META_DO_ROSTO, 'wasm'));
    await esvaziar();
    expect(e.getL2CSStatus()).toBe('ready');
    const d = e.getDiagnostics().l2cs;
    expect(d.motivoDoErro).toBeNull();
    expect(d.executionProvider).toBe('wasm');
    expect(d.reinicio).toEqual({ tentativas: 2, desistiu: false });
    // `loading` é o valor entregue na assinatura.
    expect(status).toEqual(['loading', 'ready', 'error', 'ready']);
  });

  it('acabadas as tentativas, fica em erro, visível, sem reiniciar mais', async () => {
    const e = await iniciar({ eyeNet: 'off', l2cs: 'auto' });
    FakeWorker.todos[0].responder(pronto(META_DO_ROSTO, 'webgpu'));
    await esvaziar();
    FakeWorker.todos[0].errarSempre();
    for (let i = 0; i < MAX_REINICIOS_DO_MODELO; i++) {
      await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[Math.min(i, ESPERAS_DO_REINICIO_DO_MODELO_MS.length - 1)]);
      FakeWorker.todos.at(-1)!.responder({ type: 'init_error', error: 'sem GPU' });
      await esvaziar();
    }
    expect(FakeWorker.todos).toHaveLength(1 + MAX_REINICIOS_DO_MODELO);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(FakeWorker.todos).toHaveLength(1 + MAX_REINICIOS_DO_MODELO);
    expect(e.getL2CSStatus()).toBe('error');
    expect(e.getDiagnostics().l2cs.reinicio).toEqual({ tentativas: MAX_REINICIOS_DO_MODELO, desistiu: true });
  });

  it('a PRIMEIRA carga que falha é "carga": sem reinício (recarregar não traz o arquivo de volta)', async () => {
    const e = await iniciar({ eyeNet: 'off', l2cs: 'auto' });
    FakeWorker.todos[0].responder({
      type: 'init_error',
      error: 'a meta declara 90 bins, mas o modelo devolveu 28 (yaw) e 28 (pitch). Atualize a meta (.meta.json) do modelo carregado.',
    });
    await esvaziar();
    expect(e.getL2CSStatus()).toBe('error');
    expect(e.getDiagnostics().l2cs.motivoDoErro).toBe('carga');
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(FakeWorker.todos).toHaveLength(1);
    expect(e.getDiagnostics().l2cs.reinicio).toBeNull();
  });

  it('um reinício agendado morre com o dispose', async () => {
    const e = await iniciar({ eyeNet: 'off', l2cs: 'auto' });
    FakeWorker.todos[0].responder(pronto(META_DO_ROSTO, 'webgpu'));
    await esvaziar();
    FakeWorker.todos[0].errarSempre();
    e.dispose();
    engine = null;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWorker.todos).toHaveLength(1);
  });
});

describe('reinício do ramo ocular (EyeNet, `?olho=onnx`)', () => {
  it('um olho que passa a errar derruba o ramo: erro com motivo e reinício dos dois workers', async () => {
    const e = await iniciar({ eyeNet: 'onnx', l2cs: 'off' });
    expect(FakeWorker.todos).toHaveLength(2);
    for (const w of FakeWorker.todos) w.responder(pronto(META_DO_OLHO, 'webgpu'));
    await esvaziar();
    expect(e.getDiagnostics().olho.status).toBe('pronto');

    FakeWorker.todos[0].errarSempre();
    expect(e.getDiagnostics().olho.status).toBe('erro');
    expect(e.getDiagnostics().olho.motivoDoErro).toBe('falha_do_worker');
    expect(FakeWorker.todos[1].terminado).toBe(true); // o outro olho também sai

    await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[0]);
    expect(FakeWorker.todos).toHaveLength(4);
    // No reinício o status segue `erro` até o ramo novo responder.
    expect(e.getDiagnostics().olho.status).toBe('erro');
    for (const w of FakeWorker.todos.slice(2)) {
      expect(w.init?.teste).toEqual({ dims: [64, 96] });
      w.responder(pronto(META_DO_OLHO, 'webgpu'));
    }
    await esvaziar();
    const d = e.getDiagnostics().olho;
    expect(d.status).toBe('pronto');
    expect(d.motivoDoErro).toBeNull();
    expect(d.reinicio).toEqual({ tentativas: 1, desistiu: false });
  });
});
