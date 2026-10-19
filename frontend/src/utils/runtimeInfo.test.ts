import { describe, it, expect, vi } from 'vitest';

vi.mock('@tracker/calibration', () => ({ getL2csInputSizeEfetivo: () => 448 }));

import { buildRuntimeInfo } from './runtimeInfo';

/**
 * O relatório de precisão gravava `EXPERIMENT.l2csInputSize` (448) mesmo
 * quando o engine rodava em WASM com recorte de 224²: toda medição em WASM
 * ficou anotada com o crop errado. O valor tem de ser o EFETIVO.
 */
describe('buildRuntimeInfo — lado do recorte do L2CS', () => {
  it('usa o lado efetivo publicado pelo engine, não a flag', () => {
    const info = buildRuntimeInfo({
      l2cs: { executionProvider: 'wasm', latencyMs: 300, stalePct: 12, inputSize: 224 },
      filtro: { efetivo: 'oneEuro', preset: 'balanceado-v2' },
      fpsRender: 30,
      video: { width: 1280, height: 720 },
    } as Parameters<typeof buildRuntimeInfo>[0]);
    expect(info?.l2csInputSize).toBe(224);
    expect(info?.l2csExecutionProvider).toBe('wasm');
  });

  it('sem o campo nos diagnósticos, cai no lado efetivo da calibração (a mesma fonte da chave do perfil)', () => {
    const info = buildRuntimeInfo({ l2cs: { executionProvider: 'webgpu' } } as Parameters<typeof buildRuntimeInfo>[0]);
    expect(info?.l2csInputSize).toBe(448);
  });
});

describe('buildRuntimeInfo — ramo ocular (EyeNet)', () => {
  // Um relatório de `?ep=off&olho=onnx` saía com `modelo: null` e nada sobre a
  // EyeNet: não dava para saber, lendo o arquivo, que modelo produziu o número.
  it('com o ramo ligado, grava status, provider e a ficha do modelo do olho', () => {
    const ficha = { arquivo: 'eyenet.onnx', integridade: 'confere' } as never;
    const info = buildRuntimeInfo({
      l2cs: { executionProvider: null },
      olho: { ativo: true, status: 'pronto', executionProvider: 'webgpu', latencyMs: 4, stalePct: 1, modelo: ficha },
    } as Parameters<typeof buildRuntimeInfo>[0]);
    expect(info?.olho).toEqual({ status: 'pronto', executionProvider: 'webgpu', latencyMs: 4, stalePct: 1, modelo: ficha });
  });

  it('com o ramo desligado, `olho` é null', () => {
    const info = buildRuntimeInfo({
      l2cs: { executionProvider: 'webgpu' },
      olho: { ativo: false, status: 'desligado' },
    } as Parameters<typeof buildRuntimeInfo>[0]);
    expect(info?.olho).toBeNull();
  });
});
