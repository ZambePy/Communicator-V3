import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  clearCalibration, startCalibrationMode, startCollectingPoint, feedRawData,
  completeCalibration, getCalibrationTargets, getCollectionMsForPoint,
  duracaoTotalDoPonto, getCalibrationFitDiagnostics,
} from './calibration';

// O LOO por alvo guardava só o TAMANHO do erro de cada alvo deixado de fora.
// Sem o vetor, os relatórios não dizem para que lado o mapa erra fora da
// amostra — e é esse lado que separa um mapa encolhido no vertical (ganho < 1,
// 10 de 15 sessões reais de 05/09–25/10/2026) de erro de padrão espalhado, e
// que permite testar offline uma correção de ganho feita na própria calibração
// (auditoria e pesquisa de 05/11/2026). `residuoMedioPx` é a média ASSINADA
// (predição − alvo) das amostras do alvo, fora da amostra, em px.

let relogio = 0;

/** Features com um sinal limpo e pouco ruído: o resíduo LOO é quase todo sistemático. */
function vetor(x: number, y: number, rnd: () => number) {
  const ox = (x - 0.5) * 0.08, oy = (y - 0.5) * 0.05;
  return [
    ox + rnd() * 0.001, oy + rnd() * 0.001,
    ox * 1.02 + rnd() * 0.0012, oy * 0.98 + rnd() * 0.0012,
    (x - 0.5) * 0.6 + rnd() * 0.004, (y - 0.5) * 0.4 + rnd() * 0.004,
  ];
}

beforeAll(() => {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 1920 });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 1080 });
});
afterAll(() => {
  delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
  delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
  vi.restoreAllMocks();
});

describe('LOO por alvo com o vetor do resíduo', () => {
  it('cada alvo traz o resíduo médio assinado, em px, coerente com o erro médio', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    clearCalibration();
    let semente = 5;
    const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 - 0.5; };
    startCalibrationMode();
    for (const t of getCalibrationTargets()) {
      startCollectingPoint(t.x, t.y, () => {});
      const dur = duracaoTotalDoPonto(getCollectionMsForPoint(t.x, t.y));
      for (let ms = 0; ms <= dur + 200; ms += 33) {
        relogio += 33;
        feedRawData(vetor(t.x, t.y, rnd), vetor(t.x, t.y, rnd), {
          yaw: 0.1, pitch: -0.05, roll: 0.01,
          irisVisibilityPercentage: 1, detectorConfidence: 0.99,
          brightnessEstimate: 0.24, contrastEstimate: 0.09, blurEstimate: 0,
        });
      }
    }
    let outcome: { ok: boolean } | null = null;
    completeCalibration((o) => { outcome = o as { ok: boolean }; });
    expect(outcome).toEqual({ ok: true });

    const alvos = getCalibrationFitDiagnostics()!.looByTarget.filter((t) => Number.isFinite(t.errorPx));
    expect(alvos.length).toBeGreaterThanOrEqual(9);
    let somaNorma = 0, somaErro = 0;
    for (const t of alvos) {
      const r = t.residuoMedioPx!;
      expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
      // |média| ≤ média de |·| (desigualdade triangular), na mesma unidade.
      expect(Math.hypot(r.x, r.y)).toBeLessThanOrEqual(t.errorPx + 1e-6);
      somaNorma += Math.hypot(r.x, r.y);
      somaErro += t.errorPx;
    }
    // Escala: aqui o LOO erra só 2–3 px, quase tudo ruído de amostra, e o
    // vetor médio fica em ~30 % da média dos tamanhos. Em fração da tela (o
    // erro de unidade que este teste pega) daria ~0,03 %.
    expect(somaNorma / somaErro).toBeGreaterThan(0.1);
  });
});
