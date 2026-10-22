import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearCalibration, startCalibrationMode, startCollectingPoint, feedRawData,
  completeCalibration, getCalibrationTargets, getCollectionMsForPoint, duracaoTotalDoPonto,
} from './calibration';
import { startAccuracyTest, feedAccuracyRaw, interromperTesteDePrecisao, fecharPainelDeDiagnostico } from './accuracy';
import { EXPERIMENT } from './config/experiment';
import { corDoFundoDoEstimulo, COR_DO_FUNDO, COR_DO_FUNDO_ANTIGA, usarEstimuloAntigo } from './alvoDeFixacao';

// Revisão do pipeline de 19/10/2026: o alvo ABC e o fundo #091B33 trocaram o
// estímulo da calibração e do teste SEM flag, e o "antes" de uma sessão de
// medição só existia noutro build. Com `estimuloAntigo` o teste volta ao alvo
// de antes (círculo azul-claro com cruz e anel, sobre preto), no MESMO build;
// sem ela (o padrão), nada muda.

const qualidade = () => ({
  yaw: 0.1, pitch: -0.05, roll: 0.01,
  irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.24, contrastEstimate: 0.09, blurEstimate: 0,
});
let relogio = 0;
let rafQueue: FrameRequestCallback[] = [];
function vetor(x: number, y: number, ruido: () => number, fase = 0) {
  return Array.from({ length: 6 }, (_, d) =>
    Math.sin(d * 1.7 + 0.3 + fase) * x + Math.cos(d * 2.3 + 1.1 + fase) * y
    + ruido() * 0.002 + (d >= 4 ? 0.3 : 0));
}
function calibrar() {
  let semente = 7;
  const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 - 0.5; };
  startCalibrationMode();
  for (const t of getCalibrationTargets()) {
    startCollectingPoint(t.x, t.y, () => {});
    const total = duracaoTotalDoPonto(getCollectionMsForPoint(t.x, t.y));
    for (let ms = 0; ms <= total + 200; ms += 40) {
      relogio += 40;
      feedRawData(vetor(t.x, t.y, rnd), vetor(t.x, t.y, rnd, 0.2), qualidade());
    }
  }
  completeCalibration(() => {});
}
function percorrer(quadros: number, aoQuadro: () => void) {
  let semente = 99;
  const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 - 0.5; };
  for (let i = 0; i < quadros; i++) {
    relogio += 16;
    vi.advanceTimersByTime(16);
    const fila = rafQueue;
    rafQueue = [];
    for (const cb of fila) cb(relogio);
    feedAccuracyRaw(vetor(0.5, 0.5, rnd), vetor(0.5, 0.5, rnd, 0.2), undefined, { yaw: 0.1, pitch: -0.05, roll: 0.01 });
    aoQuadro();
  }
}

const antes = EXPERIMENT.estimuloAntigo;
beforeEach(() => {
  relogio = 0;
  rafQueue = [];
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length; });
  document.body.innerHTML = '';
  clearCalibration();
});
afterEach(() => {
  EXPERIMENT.estimuloAntigo = antes;
  interromperTesteDePrecisao('fim do caso de teste');
  fecharPainelDeDiagnostico();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('estímulo do teste de precisão', () => {
  it('o padrão é o de hoje: o alvo ABC sobre o azul-marinho, "olhe para o ponto vermelho"', () => {
    expect(EXPERIMENT.estimuloAntigo).toBe(false);
    expect(usarEstimuloAntigo()).toBe(false);
    expect(corDoFundoDoEstimulo()).toBe(COR_DO_FUNDO);
    calibrar();
    startAccuracyTest(() => {});
    let visto = false;
    percorrer(300, () => {
      const dot = document.getElementById('accuracy-dot');
      if (!dot) return;
      visto = true;
      expect(dot.className).toBe('accuracy-dot');
      expect(dot.querySelector('.alvo-abc__centro')).not.toBeNull();
      expect(dot.querySelector('.dot-inner')).toBeNull();
    });
    expect(visto).toBe(true);
    expect(document.getElementById('accuracy-overlay')!.className).toBe('accuracy-overlay');
    expect(document.querySelector('.accuracy-instruction')?.textContent).toMatch(/ponto vermelho/);
  });

  it('com `estimuloAntigo`: o círculo de antes, sobre preto, e a instrução de antes', () => {
    EXPERIMENT.estimuloAntigo = true;
    expect(corDoFundoDoEstimulo()).toBe(COR_DO_FUNDO_ANTIGA);
    calibrar();
    startAccuracyTest(() => {});
    let visto = false;
    percorrer(300, () => {
      const dot = document.getElementById('accuracy-dot');
      if (!dot) return;
      visto = true;
      expect(dot.classList.contains('accuracy-dot--antigo')).toBe(true);
      expect(dot.querySelector('.dot-cross')).not.toBeNull();
      expect(dot.querySelector('.dot-inner')).not.toBeNull();
      expect(dot.querySelector('.alvo-abc')).toBeNull();
      // O alvo de antes não pulsa pela classe de chegada: não há contração.
      expect(dot.querySelector('.alvo-abc--chegando')).toBeNull();
    });
    expect(visto).toBe(true);
    expect(document.getElementById('accuracy-overlay')!.classList.contains('accuracy-overlay--antigo')).toBe(true);
    const instrucao = document.querySelector('.accuracy-instruction')?.textContent ?? '';
    expect(instrucao).toMatch(/olhe para o ponto/);
    expect(instrucao).not.toMatch(/vermelho/);
  });
});
