import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createL2CSClient } from './client';
import type { L2CSWorkerRequest, L2CSWorkerResponse } from './types';

// O worker do L2CS roda a L2CS-Net do rosto e, no ramo ocular, a EyeNet de
// cada olho. As mensagens de console diziam `[L2CS]` nos três casos — com
// `?ep=off&olho=onnx` o console anunciava uma L2CS-Net que não estava rodando.
// O rótulo de quem cria o client vai no `init` (o worker o usa nos logs dele) e
// prefixa os logs do próprio client.

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
}

let originalWorker: unknown;

beforeEach(() => {
  FakeWorker.todos = [];
  originalWorker = (globalThis as Record<string, unknown>).Worker;
  (globalThis as Record<string, unknown>).Worker = FakeWorker;
});

afterEach(() => {
  (globalThis as Record<string, unknown>).Worker = originalWorker;
  vi.restoreAllMocks();
});

describe('rótulo do client no console', () => {
  it('sem rótulo, o init leva `[L2CS]` (a rede do rosto)', () => {
    const client = createL2CSClient();
    void client.start();
    const init = FakeWorker.todos[0].posted.find((m) => m.type === 'init');
    expect(init).toMatchObject({ type: 'init', rotulo: '[L2CS]' });
    client.stop();
  });

  it('o rótulo de quem chama vai no init e prefixa o erro de carga, que diz o arquivo', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = createL2CSClient({
      modelUrl: 'http://x/models/eyenet/eyenet.onnx',
      metaUrl: 'http://x/models/eyenet/eyenet.meta.json',
      rotulo: '[olho esquerdo]',
    });
    const pronto = client.start();
    const w = FakeWorker.todos[0];
    expect(w.posted[0]).toMatchObject({ type: 'init', rotulo: '[olho esquerdo]' });

    w.responder({ type: 'init_error', error: 'model HTTP 404' });
    await expect(pronto).rejects.toThrow(/eyenet\.onnx: model HTTP 404/);
    expect(erro).toHaveBeenCalled();
    expect(erro.mock.calls[0][0]).toBe('[olho esquerdo]');
    expect(erro.mock.calls.flat().join(' ')).not.toContain('[L2CS]');
  });
});
