import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { criarRamoOcularOnnx, ramoOcularNulo } from './ramoOcular';
import type { L2CSModelMeta, L2CSWorkerRequest, L2CSWorkerResponse } from '../l2cs/types';

// Um worker por olho, cada um com o seu rótulo no console, e o provider em
// vigor exposto para o diagnóstico (HUD, preflight, relatório).

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

const META = JSON.parse(
  readFileSync(resolve(__dirname, '../../frontend/public/models/eyenet/eyenet.meta.json'), 'utf8'),
) as L2CSModelMeta;

let originalWorker: unknown;
beforeEach(() => {
  FakeWorker.todos = [];
  originalWorker = (globalThis as Record<string, unknown>).Worker;
  (globalThis as Record<string, unknown>).Worker = FakeWorker;
});
afterEach(() => {
  (globalThis as Record<string, unknown>).Worker = originalWorker;
});

describe('criarRamoOcularOnnx', () => {
  it('cria um worker por olho, rotulados, carregando a EyeNet', () => {
    const ramo = criarRamoOcularOnnx();
    void ramo.start();
    expect(FakeWorker.todos).toHaveLength(2);
    const inits = FakeWorker.todos.map((w) => w.posted.find((m) => m.type === 'init'));
    expect(inits.map((m) => m && m.type === 'init' && m.rotulo)).toEqual(['[olho esquerdo]', '[olho direito]']);
    for (const m of inits) {
      expect(m && m.type === 'init' && m.modelUrl.endsWith('models/eyenet/eyenet.onnx')).toBe(true);
    }
    ramo.stop();
  });

  it('expõe o provider e a ficha depois do ready', async () => {
    const ramo = criarRamoOcularOnnx();
    const pronto = ramo.start();
    expect(ramo.executionProvider()).toBeNull();
    const verificacao = { sha256Calculado: META.sha256 ?? null, hashConfere: true };
    for (const w of FakeWorker.todos) {
      w.responder({ type: 'ready', meta: META, executionProvider: 'webgpu', requested: 'auto', fallback: false, verificacao });
    }
    await pronto;
    expect(ramo.executionProvider()).toBe('webgpu');
    expect(ramo.ficha()?.arquivo).toBe('eyenet.onnx');
    expect(ramo.ficha()?.integridade).toBe('confere');
    ramo.stop();
  });

  it('o ramo nulo não tem provider', () => {
    expect(ramoOcularNulo.executionProvider()).toBeNull();
  });
});
