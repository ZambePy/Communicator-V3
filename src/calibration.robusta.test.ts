import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  clearCalibration,
  completeCalibration,
  duracaoTotalDoPonto,
  feedRawData,
  getCalibrationFitDiagnostics,
  getCalibrationTargets,
  getCollectionMsForPoint,
  mapGaze,
  startCalibrationMode,
  startCollectingPoint,
} from './calibration';
import { EXPERIMENT } from './config/experiment';
import { profileRegistry } from './calibrationProfiles';

// Calibração robusta (M6) de ponta a ponta: um alvo em que a pessoa olhou
// para outro lugar (o rótulo está errado para todas as amostras dele) tem de
// perder peso no ajuste entre alvos (Huber), e os outros alvos têm de sair
// mais perto do que sem a robustez — esse alvo está DENTRO do treino dos
// outros e, com peso cheio, entorta o polinômio inteiro.

const W = 1920;
const H = 1080;
let relogio = 0;

function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}

/** Olho sintético linear: sem saturação, para o único defeito ser o rótulo. */
function olho(x: number, y: number, rnd: () => number): number[] {
  return [
    (x - 0.5) * 0.08 + rnd() * 0.0008,
    (y - 0.5) * 0.05 + rnd() * 0.0008,
    Math.tan((x - 0.5) * 0.9) + rnd() * 0.003,
    Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
  ];
}

const QUALIDADE = {
  yaw: 0, pitch: 0, roll: 0,
  irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0,
};

/** Índice do alvo em que a pessoa olhou 12 % da tela para a direita. */
const ERRADO = 4;

function calibrar(): { x: number; y: number }[] {
  const rnd = gerador(11);
  clearCalibration();
  expect(startCalibrationMode()).toBe(true);
  const alvos = getCalibrationTargets().map((t) => ({ x: t.x, y: t.y }));
  alvos.forEach((t, i) => {
    startCollectingPoint(t.x, t.y, () => {});
    const olhou = i === ERRADO ? { x: t.x + 0.12, y: t.y } : t;
    const dur = duracaoTotalDoPonto(getCollectionMsForPoint(t.x, t.y));
    for (let ms = 0; ms <= dur + 200; ms += 33) {
      relogio += 33;
      feedRawData(olho(olhou.x, olhou.y, rnd), olho(olhou.x, olhou.y, rnd), QUALIDADE);
    }
  });
  let ok: boolean | null = null;
  completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
  expect(ok).toBe(true);
  return alvos;
}

/** Erro médio em px nos alvos CERTOS, com o olho sem ruído. */
function erroNosCertos(alvos: { x: number; y: number }[]): number {
  const zero = () => 0;
  const erros = alvos
    .filter((_, i) => i !== ERRADO)
    .map((t) => {
      const p = mapGaze(olho(t.x, t.y, zero), olho(t.x, t.y, zero));
      expect(p).not.toBeNull();
      return Math.hypot(p!.x - t.x * W, p!.y - t.y * H);
    });
  return erros.reduce((s, e) => s + e, 0) / erros.length;
}

describe('calibração robusta (M6) com um alvo de rótulo errado', () => {
  const antes = { robusta: EXPERIMENT.calibracaoRobusta, persistir: EXPERIMENT.persistirCalibracao };

  beforeAll(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    EXPERIMENT.persistirCalibracao = false;
  });
  afterEach(() => {
    EXPERIMENT.calibracaoRobusta = antes.robusta;
  });
  afterAll(() => {
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = antes.persistir;
    clearCalibration();
  });

  it('o alvo errado perde peso, os certos ficam com peso cheio, e o IRLS converge', () => {
    EXPERIMENT.calibracaoRobusta = true;
    const alvos = calibrar();
    const r = getCalibrationFitDiagnostics()?.robusto;
    expect(r).toBeTruthy();
    expect(r!.convergiu).toBe(true);
    const peso = (t: { x: number; y: number }) =>
      r!.alvos.find((a) => Math.abs(a.x - t.x) < 1e-9 && Math.abs(a.y - t.y) < 1e-9)?.peso;
    expect(peso(alvos[ERRADO])).toBeLessThan(0.5);
    const certos = alvos.filter((_, i) => i !== ERRADO).map(peso);
    expect(Math.min(...certos.map((p) => p ?? 0))).toBeGreaterThan(0.9);
  });

  it('o perfil salvo diz de que método vem o relatório de alvos suspeitos', () => {
    // Com M6, `residualNorm`/`zScore` são o u de Huber, não o LOO + MAD de antes.
    EXPERIMENT.calibracaoRobusta = true;
    EXPERIMENT.persistirCalibracao = true;
    try {
      profileRegistry.clear();
      calibrar();
      const suspeitos = profileRegistry.getActive()?.quality?.outlierTargets;
      expect(suspeitos?.metodo).toBe('huber');
      expect(suspeitos?.perTarget[ERRADO].isOutlier).toBe(true);
    } finally {
      EXPERIMENT.persistirCalibracao = false;
      profileRegistry.clear();
    }
  });

  it('os alvos certos saem mais perto do que sem a robustez', () => {
    EXPERIMENT.calibracaoRobusta = false;
    const alvos = calibrar();
    const sem = erroNosCertos(alvos);
    EXPERIMENT.calibracaoRobusta = true;
    calibrar();
    const com = erroNosCertos(alvos);
    expect(com).toBeLessThan(sem * 0.7);
  });
});
