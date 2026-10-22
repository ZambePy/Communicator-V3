import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createL2CSClient } from './client';
import type { L2CSWorkerRequest, L2CSWorkerResponse } from './types';

// Falha #13 da auditoria de 18/10/2026: o tensor é transferido ao worker a
// cada inferência e o recorte alocava outro (2,4 MB em 448²). O worker agora
// devolve o buffer com a resposta, e o client o empresta ao próximo recorte.

class FakeWorker {
  static instances: FakeWorker[] = [];
  listeners = new Map<string, Set<(ev: unknown) => void>>();
  posted: L2CSWorkerRequest[] = [];
  terminated = false;

  constructor(_url: URL | string, _opts?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  removeEventListener(type: string, cb: (ev: unknown) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  postMessage(msg: L2CSWorkerRequest, _transfer?: Transferable[]): void {
    this.posted.push(msg);
    // O `init` é respondido de imediato para o teste não precisar orquestrar
    // o handshake — o que está sob teste é a fila de inferência, não o boot.
    if (msg.type === 'init') {
      queueMicrotask(() => this.deliver({
        type: 'ready',
        meta: {
          dataset: 'gaze360', outputBins: 90, binWidth: 4, binOffset: -180,
          inputSize: 448, inputTensorName: 'input',
          outputTensorNames: { yaw: 'yaw', pitch: 'pitch' },
        },
        executionProvider: 'wasm',
        requested: msg.provider,
        fallback: false,
      }));
    }
  }

  terminate(): void { this.terminated = true; }

  /** Entrega uma resposta ao cliente, como se o worker tivesse respondido. */
  deliver(data: L2CSWorkerResponse): void {
    for (const cb of this.listeners.get('message') ?? []) cb({ data });
  }

  /** Quantas mensagens `infer` foram postadas até agora. */
  inferCount(): number {
    return this.posted.filter((m) => m.type === 'infer').length;
  }

  /** Os ids das inferências postadas, na ordem. */
  inferIds(): number[] {
    return this.posted.flatMap((m) => (m.type === 'infer' ? [m.id] : []));
  }
}


let originalWorker: unknown;
beforeEach(() => {
  FakeWorker.instances = [];
  originalWorker = (globalThis as Record<string, unknown>).Worker;
  (globalThis as Record<string, unknown>).Worker = FakeWorker;
});
afterEach(() => {
  (globalThis as Record<string, unknown>).Worker = originalWorker;
  vi.restoreAllMocks();
});

async function pronto() {
  const client = createL2CSClient({ cadenceMs: 0 });
  await client.start();
  return { client, worker: FakeWorker.instances.at(-1)! };
}

const N = 3 * 224 * 224;

describe('reserva de tensores devolvidos pelo worker', () => {
  it('sem nada devolvido: não há o que emprestar (o recorte aloca, como antes)', async () => {
    const { client } = await pronto();
    expect(client.emprestarTensor(N)).toBeUndefined();
  });

  it('o buffer que volta com o resultado é emprestado ao próximo recorte', async () => {
    const { client, worker } = await pronto();
    const t = new Float32Array(N);
    client.submitTensor(t);
    const id = worker.inferIds().at(-1)!;
    const devolvido = new Float32Array(N);
    worker.deliver({ type: 'result', id, yaw: 0, pitch: 0, confidence: 1, inferenceMs: 5, devolvido });
    expect(client.emprestarTensor(N)).toBe(devolvido);
    expect(client.emprestarTensor(N)).toBeUndefined();
  });

  it('volta também na falha da inferência; outro tamanho não serve', async () => {
    const { client, worker } = await pronto();
    client.submitTensor(new Float32Array(N));
    const id = worker.inferIds().at(-1)!;
    const devolvido = new Float32Array(N);
    worker.deliver({ type: 'infer_error', id, error: 'x', devolvido });
    expect(client.emprestarTensor(3 * 448 * 448)).toBeUndefined();
    expect(client.emprestarTensor(N)).toBe(devolvido);
  });

  it('guarda no máximo dois por tamanho, e o stop esvazia', async () => {
    const { client, worker } = await pronto();
    for (let i = 0; i < 4; i++) {
      client.submitTensor(new Float32Array(N));
      const id = worker.inferIds().at(-1)!;
      worker.deliver({ type: 'result', id, yaw: 0, pitch: 0, confidence: 1, inferenceMs: 5, devolvido: new Float32Array(N) });
    }
    expect(client.emprestarTensor(N)).toBeDefined();
    expect(client.emprestarTensor(N)).toBeDefined();
    expect(client.emprestarTensor(N)).toBeUndefined();
    client.submitTensor(new Float32Array(N));
    worker.deliver({ type: 'result', id: worker.inferIds().at(-1)!, yaw: 0, pitch: 0, confidence: 1, inferenceMs: 5, devolvido: new Float32Array(N) });
    client.stop();
    expect(client.emprestarTensor(N)).toBeUndefined();
  });
});
