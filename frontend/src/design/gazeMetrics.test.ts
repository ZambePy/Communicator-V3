import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let calibradoEm: number | null = 1000;
vi.mock('@tracker/calibration', () => ({ getCalibrationTimestampMs: () => calibradoEm }));

import {
  DERIVA_ACOMODADA_DEG,
  GAZE_TOKENS,
  alvoMinimoComMedicaoPx,
  degToPx,
  requisitoMedidoPx,
} from './gazeMetrics';

// Alvo mínimo medido (M18): o requisito que a última medição mediu, mais a
// deriva, entre o mínimo e o recomendado do design system.

const D = 60;
const PX_CM = 96 / 2.54;
const minimo = degToPx(GAZE_TOKENS.targetMinDeg, D, PX_CM);
const recomendado = degToPx(GAZE_TOKENS.targetRecommendedDeg, D, PX_CM);

describe('alvoMinimoComMedicaoPx', () => {
  it('sem medição, o mínimo de 5°', () => {
    expect(alvoMinimoComMedicaoPx(null, D, PX_CM)).toBeCloseTo(minimo, 9);
  });

  it('medição pequena não encolhe abaixo do mínimo', () => {
    expect(alvoMinimoComMedicaoPx(50, D, PX_CM)).toBeCloseTo(minimo, 9);
  });

  it('no meio da faixa, o medido mais o dobro da deriva', () => {
    const medido = (minimo + recomendado) / 2 - 2 * degToPx(DERIVA_ACOMODADA_DEG, D, PX_CM);
    expect(alvoMinimoComMedicaoPx(medido, D, PX_CM)).toBeCloseTo((minimo + recomendado) / 2, 9);
  });

  it('nunca passa do recomendado (6,6°): acima disso é caso de recalibrar', () => {
    expect(alvoMinimoComMedicaoPx(5000, D, PX_CM)).toBeCloseTo(recomendado, 9);
  });
});

describe('requisitoMedidoPx', () => {
  beforeEach(() => {
    calibradoEm = 1000;
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it('lê o lado de 1 s da última medição feita depois da calibração em uso', () => {
    localStorage.setItem('accuracyResult', JSON.stringify({ lado95Filtrado1sPx: 230, timestamp: 2000 }));
    expect(requisitoMedidoPx()).toBe(230);
  });

  it('medição de antes da calibração em uso não vale', () => {
    localStorage.setItem('accuracyResult', JSON.stringify({ lado95Filtrado1sPx: 230, timestamp: 500 }));
    expect(requisitoMedidoPx()).toBeNull();
    calibradoEm = null;
    expect(requisitoMedidoPx()).toBeNull();
  });

  it('sem o campo (relatório antigo) ou com lixo, null', () => {
    localStorage.setItem('accuracyResult', JSON.stringify({ meanError: 50, timestamp: 2000 }));
    expect(requisitoMedidoPx()).toBeNull();
    localStorage.setItem('accuracyResult', '{quebrado');
    expect(requisitoMedidoPx()).toBeNull();
  });
});
