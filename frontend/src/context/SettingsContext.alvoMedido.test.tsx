import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import { EXPERIMENT } from '@tracker/config/experiment';

// O alvo mínimo medido (M18) só vale para a calibração em que foi medido. O
// perfil salvo carrega depois do MediaPipe — bem depois de o SettingsProvider
// montar —, então a interface tem de recalcular os tokens quando o modelo em
// uso muda, e não só no redimensionamento.

const relogio = vi.hoisted(() => ({ treinadoEm: null as number | null }));
vi.mock('@tracker/calibration', async (orig) => {
  const real = await orig<typeof import('@tracker/calibration')>();
  return { ...real, getCalibrationTimestampMs: () => relogio.treinadoEm };
});

import { EVENTO_DE_CALIBRACAO_EM_USO } from '@tracker/calibration';
import { SettingsProvider } from './SettingsContext';

const alvoMinimo = () => Number.parseFloat(document.documentElement.style.getPropertyValue('--gaze-target-min'));
const antes = EXPERIMENT.alvoMinimoMedido;

beforeEach(() => {
  EXPERIMENT.alvoMinimoMedido = true;
  relogio.treinadoEm = null;
  // Medição de 1000 px às 10 h: acima do teto de 6,6°, então o alvo vai ao teto.
  localStorage.setItem('accuracyResult', JSON.stringify({ lado95Filtrado1sPx: 1000, timestamp: 10_000 }));
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 1;
  });
});
afterEach(() => {
  EXPERIMENT.alvoMinimoMedido = antes;
  localStorage.removeItem('accuracyResult');
  vi.restoreAllMocks();
});

describe('alvo mínimo medido (M18) e o modelo em uso', () => {
  it('recalcula quando o perfil carrega depois da montagem', () => {
    render(<SettingsProvider><span /></SettingsProvider>);
    // Sem calibração em uso a medição não vale: fica o mínimo de 5°.
    const semModelo = alvoMinimo();
    // O perfil carregou, treinado antes da medição: agora ela vale.
    relogio.treinadoEm = 5_000;
    act(() => {
      window.dispatchEvent(new Event(EVENTO_DE_CALIBRACAO_EM_USO));
    });
    expect(alvoMinimo()).toBeGreaterThan(semModelo);
  });

  it('volta ao mínimo quando uma calibração nova torna a medição antiga', () => {
    relogio.treinadoEm = 5_000;
    render(<SettingsProvider><span /></SettingsProvider>);
    const comMedicao = alvoMinimo();
    relogio.treinadoEm = 20_000;
    act(() => {
      window.dispatchEvent(new Event(EVENTO_DE_CALIBRACAO_EM_USO));
    });
    expect(alvoMinimo()).toBeLessThan(comMedicao);
  });
});
