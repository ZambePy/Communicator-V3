import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { DebugHUD } from './DebugHUD';

// O HUD do operador diz qual pipeline está rodando: as sessões de comparação
// do roteiro de medição trocam de condição pela URL (`?pipeline=base`), e medir
// a condição errada custa a sessão inteira.

const diag = {
  fpsRender: 30,
  l2cs: { status: 'disabled', hz: 0, latencyMs: 0, stalePct: 0, confidence: 0, pendingCount: 0 },
  gaze: { yaw: 0, pitch: 0 },
  pose: { yaw: 0, pitch: 0, roll: 0 },
  features: { dims: 4, blink: false },
  prediction: { x: 960, y: 540 },
  calibration: { calibrated: true, lambda: 1, samples: 100 },
  experiment: { expandFactor: 1.4, cadenceMs: 100, pipeline: 'base' as const },
  stageLatency: {},
};

let diagAtual: Record<string, unknown> = diag;

vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ getDiagnostics: () => diagAtual, state: 'tracking' }),
}));
vi.mock('../urlParams', () => ({ lerParametroDeUrl: (nome: string) => (nome === 'debug' ? '1' : null) }));

describe('<DebugHUD />', () => {
  it('mostra o pipeline em vigor na linha do experimento', async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<DebugHUD />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(container.textContent).toMatch(/base · expand 1\.4 · cad 100 ms/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('<DebugHUD /> — redes em uso', () => {
  // `?olho=onnx` liga a EyeNet; com `?ep=off` a L2CS-Net não roda. O HUD só
  // falava da L2CS-Net, com os números zerados de uma rede desligada.
  async function renderizar(d: Record<string, unknown>): Promise<string> {
    diagAtual = d;
    vi.useFakeTimers();
    try {
      const { container } = render(<DebugHUD />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      return container.textContent ?? '';
    } finally {
      vi.useRealTimers();
      diagAtual = diag;
    }
  }

  it('L2CS desligada aparece como desligada, e a EyeNet pronta ganha linha própria', async () => {
    const texto = await renderizar({
      ...diag,
      olho: { ativo: true, status: 'pronto', executionProvider: 'webgpu', hz: 58, latencyMs: 4, stalePct: 2, modelo: null },
    });
    expect(texto).toMatch(/desligada \(\?ep=off\)/);
    expect(texto).toMatch(/EyeNet pronto · webgpu · 58\.0 Hz · 4 ms · stale 2 %/);
  });

  it('sem a flag do olho, a linha da EyeNet não aparece', async () => {
    const texto = await renderizar({ ...diag, olho: { ativo: false, status: 'desligado' } });
    expect(texto).not.toMatch(/EyeNet/);
  });
});
