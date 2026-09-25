import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mapGaze, isCalibrated, clearCalibration, abortCalibration,
  startCalibrationMode, startCollectingPoint, feedRawData, completeCalibration,
  type CalibrationOutcome,
} from './calibration';
import { EXPERIMENT } from './config/experiment';

// Cancelar ou falhar uma calibração NOVA não pode deixar o app sem modelo.
//
// `startCalibrationMode` descarta o modelo em uso para a coleta começar do
// zero. Antes, sair da tela no meio (ou a janela perder o foco, ou acionar a
// Emergência) e um treino que falhava deixavam `isCalibrated()` em false: o
// dwell bloqueia tudo sem calibração — inclusive a Emergência — e o cursor
// some. Quem só usa o olhar ficava preso até alguém pegar o mouse.

function prng(seed: number): () => number {
  let a = seed;
  return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff - 0.5; };
}

const DIMS = 8;
const vetor = (x: number, y: number, ruido = 0) => ({
  v: Array.from({ length: DIMS }, (_, d) => Math.sin(d * 1.7 + 0.3) * x + Math.cos(d * 2.3 + 1.1) * y + ruido),
  w: Array.from({ length: DIMS }, (_, d) => Math.cos(d * 1.3 + 0.7) * x + Math.sin(d * 1.9 + 0.2) * y + ruido),
});

/**
 * Coleta os nove alvos com features sintéticas (mesma receita de
 * calibration.invalidation.test.ts). `trocado`: as features respondem a (y, x)
 * em vez de (x, y) — um mapeamento de fato diferente, que o scaler não anula.
 */
function coletar(trocado = false, seed = 42): void {
  const alvos = [
    { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.2 },
    { x: 0.2, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 },
    { x: 0.2, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.8, y: 0.8 },
  ];
  const rnd = prng(seed);
  for (const t of alvos) {
    startCollectingPoint(t.x, t.y, () => {});
    for (let i = 0; i < 40; i++) {
      const { v, w } = trocado ? vetor(t.y, t.x, rnd() * 0.01) : vetor(t.x, t.y, rnd() * 0.01);
      feedRawData(v, w, null);
    }
  }
}

let relogio = 0;

function calibrar(trocado = false, seed = 42): CalibrationOutcome | null {
  let desfecho: CalibrationOutcome | null = null;
  startCalibrationMode();
  coletar(trocado, seed);
  completeCalibration((o) => { desfecho = o; });
  return desfecho;
}

function predicao() {
  const { v, w } = vetor(0.35, 0.65);
  return mapGaze(v, w);
}

describe('calibração nova cancelada ou falha: a anterior volta', () => {
  beforeEach(() => {
    // O jsdom não faz layout (viewport 0×0): sem isto toda predição em px
    // sairia (0, 0) e as comparações abaixo não mediriam nada.
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1920 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 1080 });
    relogio = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (relogio += 80));
    clearCalibration();
    // Pipeline linear: o que se mede aqui é o ciclo de vida do modelo, não a
    // expansão polinomial (que só deixaria o treino mais lento).
    (EXPERIMENT as { polynomialFeatures: boolean }).polynomialFeatures = false;
  });

  afterEach(() => {
    abortCalibration();
    clearCalibration();
    vi.restoreAllMocks();
    delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
    delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
    (EXPERIMENT as { polynomialFeatures: boolean }).polynomialFeatures = true;
  });

  it('cancelar no meio da coleta devolve o modelo que funcionava, com as mesmas predições', () => {
    expect(calibrar()?.ok).toBe(true);
    const antes = predicao();
    expect(antes).not.toBeNull();

    startCalibrationMode();
    startCollectingPoint(0.2, 0.2, () => {});
    expect(isCalibrated()).toBe(false); // a coleta começa do zero

    abortCalibration();
    expect(isCalibrated()).toBe(true);
    const depois = predicao();
    expect(depois).not.toBeNull();
    expect(depois!.x).toBeCloseTo(antes!.x, 9);
    expect(depois!.y).toBeCloseTo(antes!.y, 9);
  });

  it('recomeçar a calibração em curso e então cancelar ainda devolve o modelo de antes', () => {
    expect(calibrar()?.ok).toBe(true);
    startCalibrationMode();
    startCalibrationMode({ quick: true }); // "Recomeçar" no meio
    abortCalibration();
    expect(isCalibrated()).toBe(true);
  });

  it('treino da calibração nova que falha: o desfecho é falha, mas o app segue calibrado', () => {
    expect(calibrar()?.ok).toBe(true);
    let desfecho: CalibrationOutcome | null = null;
    startCalibrationMode();
    // Nenhuma amostra: insufficient_samples.
    completeCalibration((o) => { desfecho = o; });
    expect(desfecho).not.toBeNull();
    expect(desfecho!.ok).toBe(false);
    expect(isCalibrated()).toBe(true);
  });

  it('calibração nova concluída fica valendo — um abort depois não volta à antiga', () => {
    expect(calibrar(false, 42)?.ok).toBe(true);
    const antiga = predicao();
    expect(calibrar(true, 7)?.ok).toBe(true);
    const nova = predicao();
    abortCalibration(); // ex.: a tela de calibração desmontando depois do sucesso
    expect(isCalibrated()).toBe(true);
    const agora = predicao();
    expect(agora!.x).toBeCloseTo(nova!.x, 9);
    expect(agora!.y).toBeCloseTo(nova!.y, 9);
    expect(Math.abs(nova!.x - antiga!.x) + Math.abs(nova!.y - antiga!.y)).toBeGreaterThan(1e-3);
  });

  it('clearCalibration no meio de uma calibração descarta de verdade (nada volta)', () => {
    expect(calibrar()?.ok).toBe(true);
    startCalibrationMode();
    clearCalibration();
    expect(isCalibrated()).toBe(false);
    abortCalibration();
    expect(isCalibrated()).toBe(false);
  });

  it('sem modelo antes, cancelar continua deixando sem modelo', () => {
    startCalibrationMode();
    startCollectingPoint(0.5, 0.5, () => {});
    abortCalibration();
    expect(isCalibrated()).toBe(false);
  });
});
