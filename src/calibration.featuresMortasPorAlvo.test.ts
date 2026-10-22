import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  countDeadFeatures, clearCalibration, startCalibrationMode, startCollectingPoint, feedRawData,
  completeCalibration, isCalibrated, type CalibrationOutcome,
} from './calibration';
import { EXPERIMENT } from './config/experiment';

// Features mortas agrupadas pelo alvo NOMINAL (relato de 19/10/2026, auditoria
// A5). O treino passava os alvos já compensados por pose — uma coordenada por
// amostra —, e `countDeadFeatures` agrupava por eles: um grupo por amostra. A
// "variância entre alvos" virava a variância de amostra a amostra, e uma
// feature que só treme, sem sinal nenhum de olhar, passava por viva.

function prng(seed: number): () => number {
  let a = seed;
  return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff - 0.5; };
}

describe('countDeadFeatures com o alvo nominal', () => {
  // Três alvos nominais, dez amostras cada; o alvo compensado é único por
  // amostra (a cabeça mexe um pouco).
  const nominais = [0.1, 0.5, 0.9];
  const alvos: { screenX: number; screenY: number }[] = [];
  const grupos: string[] = [];
  const features: number[][] = [];
  for (const x of nominais) {
    for (let k = 0; k < 10; k++) {
      alvos.push({ screenX: x + (k - 4.5) * 0.003, screenY: 0.5 + (k % 3) * 0.002 });
      grupos.push(`${x.toFixed(4)},0.5000`);
      // dim 0: sinal de olhar; dim 1: só tremor, com média por alvo idêntica.
      features.push([x, 0.5 + (k % 2 === 0 ? 0.01 : -0.01)]);
    }
  }

  it('sem o grupo (o comportamento de antes), o tremor passava por sinal', () => {
    const r = countDeadFeatures(features, alvos);
    expect(r.deadIndices).toEqual([]);
  });

  it('com o grupo nominal, a feature que só treme é morta — e a de sinal continua viva', () => {
    const r = countDeadFeatures(features, alvos, undefined, grupos);
    expect(r.deadIndices).toEqual([1]);
  });

  it('grupo de comprimento errado é ignorado (cai no agrupamento por alvo)', () => {
    const r = countDeadFeatures(features, alvos, undefined, grupos.slice(1));
    expect(r.deadIndices).toEqual([]);
  });
});

describe('o treino usa o agrupamento nominal', () => {
  const alvos = [
    { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.2 },
    { x: 0.2, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 },
    { x: 0.2, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.8, y: 0.8 },
  ];

  /** Calibra com 8 dims; as `mortas` primeiras só tremem. A pose de cada
   *  quadro varia um pouco, então os alvos compensados são únicos. */
  function calibrar(mortas: number): CalibrationOutcome | null {
    const rnd = prng(7);
    let relogio = 0;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => (relogio += 80));
    let saida: CalibrationOutcome | null = null;
    try {
      startCalibrationMode();
      for (const t of alvos) {
        startCollectingPoint(t.x, t.y, () => {});
        for (let i = 0; i < 40; i++) {
          const olho = (fase: number) => Array.from({ length: 8 }, (_, d) =>
            d < mortas
              ? 0.3 + rnd() * 0.007 // tremor puro: variância por quadro > 1e-6, média por alvo ~constante
              : Math.sin(d * 1.7 + fase) * t.x + Math.cos(d * 2.3 + fase) * t.y + rnd() * 0.01);
          feedRawData(olho(0.3), olho(1.1), {
            yaw: rnd() * 0.02, pitch: rnd() * 0.02, roll: rnd() * 0.02,
          });
        }
      }
      completeCalibration((o) => { saida = o; });
    } finally {
      spy.mockRestore();
    }
    return saida;
  }

  beforeEach(() => {
    clearCalibration();
    (EXPERIMENT as { polynomialFeatures: boolean }).polynomialFeatures = false;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    (EXPERIMENT as { polynomialFeatures: boolean }).polynomialFeatures = true;
    clearCalibration();
  });

  it('entrada normal (todas as dims com sinal): calibra como antes', () => {
    const o = calibrar(0);
    expect(o).toEqual({ ok: true });
    expect(isCalibrated()).toBe(true);
  });

  it('três de oito dims só com tremor (> 30 %): recusa por features mortas', () => {
    const o = calibrar(3);
    expect(o).toMatchObject({ ok: false, reason: 'degenerate_features' });
    // Tremor não é "o modelo do olhar não respondeu": nada de causa marcada.
    expect((o as { causa?: string }).causa).toBeUndefined();
    expect(isCalibrated()).toBe(false);
  });
});
