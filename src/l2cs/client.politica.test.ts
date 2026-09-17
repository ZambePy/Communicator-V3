import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createL2CSClient, politicaPorProvider } from './client';
import type { L2CSWorkerRequest, L2CSWorkerResponse } from './types';

// -----------------------------------------------------------------------------
// Cadência e tamanho do recorte decididos pelo PROVIDER efetivo.
//
// WebGPU → 448² a 100 ms; WASM → 224² a 160 ms. A troca é automática no
// primeiro status (`ready`) e o cliente expõe o que está em vigor. O que este
// teste guarda: a política entra ANTES de o `ready` resolver (quem ouve o
// status já lê o valor certo), a cadência explícita do harness vence a
// política, e o provider forçado (condição de medição) não é sobrescrito.
// -----------------------------------------------------------------------------

class FakeWorker {
  static provider: 'webgpu' | 'wasm' = 'wasm';
  listeners = new Map<string, Set<(ev: unknown) => void>>();
  posted: L2CSWorkerRequest[] = [];
  addEventListener(type: string, cb: (ev: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(): void { /* não usado */ }
  postMessage(msg: L2CSWorkerRequest): void {
    this.posted.push(msg);
    if (msg.type === 'init') {
      queueMicrotask(() => this.deliver({
        type: 'ready',
        meta: {
          dataset: 'gaze360', outputBins: 90, binWidth: 4, binOffset: -180,
          inputSize: 448, inputTensorName: 'input',
          outputTensorNames: { yaw: 'yaw', pitch: 'pitch' },
        },
        executionProvider: FakeWorker.provider,
        requested: msg.provider,
        fallback: FakeWorker.provider !== msg.provider && msg.provider !== 'auto',
        verificacao: { sha256Calculado: null, hashConfere: null },
      }));
    }
  }
  terminate(): void { /* nada a liberar */ }
  deliver(data: L2CSWorkerResponse): void {
    for (const cb of this.listeners.get('message') ?? []) cb({ data });
  }
}

let originalWorker: unknown;
beforeEach(() => {
  originalWorker = (globalThis as Record<string, unknown>).Worker;
  (globalThis as Record<string, unknown>).Worker = FakeWorker;
});
afterEach(() => {
  (globalThis as Record<string, unknown>).Worker = originalWorker;
});

const AUTO = { l2cs: 'auto' as const, l2csInputSize: 448 as const, l2csCadenceMs: 100 };

describe('politicaPorProvider', () => {
  it('WebGPU → 448² a 100 ms; WASM → 224² a 160 ms', () => {
    expect(politicaPorProvider('webgpu', AUTO)).toEqual({ inputSize: 448, cadenceMs: 100 });
    expect(politicaPorProvider('wasm', AUTO)).toEqual({ inputSize: 224, cadenceMs: 160 });
  });

  it('sem provider ainda, vale o pedido em EXPERIMENT', () => {
    expect(politicaPorProvider(null, { ...AUTO, l2csInputSize: 224, l2csCadenceMs: 120 }))
      .toEqual({ inputSize: 224, cadenceMs: 120 });
  });

  it('provider FORÇADO (medição) não é sobrescrito pela política', () => {
    expect(politicaPorProvider('wasm', { l2cs: 'wasm', l2csInputSize: 448, l2csCadenceMs: 100 }))
      .toEqual({ inputSize: 448, cadenceMs: 100 });
  });
});

describe('cliente — a política entra no primeiro status', () => {
  it('em WASM a cadência passa a 160 ms e o recorte a 224², já no ready', async () => {
    FakeWorker.provider = 'wasm';
    const c = createL2CSClient({ provider: 'auto' });
    expect(c.getPolitica()).toEqual({ inputSize: 448, cadenceMs: 100 });
    await c.start();
    expect(c.getExecutionProvider()).toBe('wasm');
    expect(c.getPolitica()).toEqual({ inputSize: 224, cadenceMs: 160 });
    // A cadência em vigor é a da política: 150 ms depois da primeira
    // submissão ainda não pode; 160 ms depois, pode.
    expect(c.submitTensor(new Float32Array(3 * 224 * 224))).toBe(true);
    c.stop();
  });

  it('em WebGPU mantém 448² a 100 ms', async () => {
    FakeWorker.provider = 'webgpu';
    const c = createL2CSClient({ provider: 'auto' });
    await c.start();
    expect(c.getPolitica()).toEqual({ inputSize: 448, cadenceMs: 100 });
    c.stop();
  });

  it('cadência explícita (harness) vence a política', async () => {
    FakeWorker.provider = 'wasm';
    const c = createL2CSClient({ provider: 'auto', cadenceMs: 33 });
    await c.start();
    expect(c.getPolitica().cadenceMs).toBe(33);
    expect(c.getPolitica().inputSize).toBe(224);
    c.stop();
  });

  it('`stop()` volta ao pedido', async () => {
    FakeWorker.provider = 'wasm';
    const c = createL2CSClient({ provider: 'auto' });
    await c.start();
    c.stop();
    expect(c.getPolitica()).toEqual({ inputSize: 448, cadenceMs: 100 });
  });
});
