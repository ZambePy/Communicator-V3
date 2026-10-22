import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createL2CSClient, INFERENCIAS_FALHAS_PARA_DESISTIR, IN_FLIGHT_TIMEOUT_MS } from './client';
import { EXPERIMENT } from '../config/experiment';
import type { L2CSWorkerRequest, L2CSWorkerResponse } from './types';

// Worker que morre ou erra sempre depois do `ready` (relato de 19/10/2026,
// falhas silenciosas #10). Antes: `infer_error` virava um aviso no console POR
// inferência (até ~70/s com a EyeNet), um erro do worker derrubava a thread sem
// avisar ninguém, e o engine seguia em `ready` com o bloco angular zerado.

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
  morrer(mensagem: string): void {
    for (const fn of this.ouvintes.error ?? []) fn({ message: mensagem, filename: 'w.js', lineno: 1 });
  }
}

const PRONTO: L2CSWorkerResponse = {
  type: 'ready',
  meta: {
    dataset: 'gaze360', outputBins: 90, binWidth: 4, binOffset: -180, inputSize: 448,
    inputTensorName: 'input', outputTensorNames: { yaw: 'yaw', pitch: 'pitch' },
  },
  executionProvider: 'webgpu',
  requested: 'auto',
  fallback: false,
  verificacao: { sha256Calculado: null, hashConfere: null },
};

let originalWorker: unknown;
let agora = 0;
const l2csAntes = EXPERIMENT.l2cs;

beforeEach(() => {
  FakeWorker.todos = [];
  agora = 1000;
  originalWorker = (globalThis as Record<string, unknown>).Worker;
  (globalThis as Record<string, unknown>).Worker = FakeWorker;
  vi.spyOn(performance, 'now').mockImplementation(() => agora);
  EXPERIMENT.l2cs = 'auto';
});

afterEach(() => {
  (globalThis as Record<string, unknown>).Worker = originalWorker;
  EXPERIMENT.l2cs = l2csAntes;
  vi.restoreAllMocks();
});

async function clientePronto(opts: Parameters<typeof createL2CSClient>[0] = {}) {
  const aoFalhar = vi.fn();
  const client = createL2CSClient({ cadenceMs: 0, ...opts, aoFalhar });
  const pronto = client.start();
  const w = FakeWorker.todos.at(-1)!;
  w.responder(PRONTO);
  await pronto;
  return { client, w, aoFalhar };
}

describe('inferência de teste no init (A3)', () => {
  it('o rosto manda o lado que a política escolheria para cada provider', () => {
    const client = createL2CSClient();
    void client.start();
    const init = FakeWorker.todos[0].posted.find((m) => m.type === 'init');
    // Gaze360 (padrão), modo auto: WebGPU 448², WASM 224².
    expect(init).toMatchObject({ type: 'init', teste: { porProvider: { webgpu: 448, wasm: 224 } } });
    client.stop();
  });

  it('o ramo ocular manda o tensor retangular do olho', () => {
    const client = createL2CSClient({ modelUrl: 'http://x/e.onnx', metaUrl: 'http://x/e.json', dimsDoTensor: [64, 96] });
    void client.start();
    expect(FakeWorker.todos[0].posted[0]).toMatchObject({ type: 'init', teste: { dims: [64, 96] } });
    client.stop();
  });
});

describe('falhas depois do ready', () => {
  it(`${INFERENCIAS_FALHAS_PARA_DESISTIR} erros de inferência seguidos: o worker é dado como perdido, uma vez`, async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, w, aoFalhar } = await clientePronto();
    for (let i = 0; i < INFERENCIAS_FALHAS_PARA_DESISTIR - 1; i++) {
      w.responder({ type: 'infer_error', id: 100 + i, error: 'GPU device lost' });
    }
    expect(aoFalhar).not.toHaveBeenCalled();
    w.responder({ type: 'infer_error', id: 999, error: 'GPU device lost' });
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar.mock.calls[0][0]).toBe('inferencia');
    expect(w.terminado).toBe(true);
    expect(client.canSubmit(agora)).toBe(false);
    expect(client.getLatestGaze(agora).valid).toBe(false);
    expect(client.getFalha()?.motivo).toBe('inferencia');
    // Mais erros (já em voo) não avisam de novo.
    w.responder({ type: 'infer_error', id: 1000, error: 'x' });
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    // E o console recebeu UM aviso pelos oito erros, não oito (limite de 5 s).
    expect(aviso.mock.calls.filter((c) => String(c[0]).includes('erro de inferência'))).toHaveLength(1);
  });

  it('um resultado bom no meio zera a sequência (erro isolado não derruba nada)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, w, aoFalhar } = await clientePronto();
    for (let rodada = 0; rodada < 3; rodada++) {
      for (let i = 0; i < INFERENCIAS_FALHAS_PARA_DESISTIR - 1; i++) {
        w.responder({ type: 'infer_error', id: 1, error: 'tensor ruim' });
      }
      // Um resultado chega: precisa de uma submissão em voo com aquele id.
      expect(client.submitTensor(new Float32Array(3 * 448 * 448))).toBe(true);
      const id = w.posted.filter((m) => m.type === 'infer').at(-1)!;
      w.responder({ type: 'result', id: (id as { id: number }).id, yaw: 0.1, pitch: 0, confidence: 0.9, inferenceMs: 50 });
    }
    expect(aoFalhar).not.toHaveBeenCalled();
    expect(w.terminado).toBe(false);
  });

  it('o worker morre depois do ready: aviso de falha (antes ninguém sabia)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, w, aoFalhar } = await clientePronto();
    w.morrer('out of memory');
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar.mock.calls[0]).toEqual(['worker_morreu', 'out of memory']);
    expect(client.canSubmit(agora)).toBe(false);
  });

  it('o worker morre ANTES do ready: é falha de carga (a promessa rejeita), não reinício', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const aoFalhar = vi.fn();
    const client = createL2CSClient({ aoFalhar });
    const pronto = client.start();
    FakeWorker.todos[0].morrer('script não carregou');
    await expect(pronto).rejects.toThrow(/script não carregou/);
    expect(aoFalhar).not.toHaveBeenCalled();
  });

  it('duas inferências seguidas sem resposta: worker travado, dado como perdido', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, aoFalhar } = await clientePronto();
    expect(client.submitTensor(new Float32Array(3 * 448 * 448))).toBe(true);
    agora += IN_FLIGHT_TIMEOUT_MS + 10;
    expect(client.canSubmit(agora)).toBe(true); // a primeira espera só libera o slot
    expect(aoFalhar).not.toHaveBeenCalled();
    expect(client.submitTensor(new Float32Array(3 * 448 * 448))).toBe(true);
    agora += IN_FLIGHT_TIMEOUT_MS + 10;
    expect(client.canSubmit(agora)).toBe(false);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar.mock.calls[0][0]).toBe('sem_resposta');
  });
});
