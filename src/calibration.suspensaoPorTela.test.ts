import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isCalibrated, clearCalibration, startCalibrationMode, startCollectingPoint, feedRawData,
  completeCalibration, checarMudancaDeViewport, loadProfile, getSuspensaoDaCalibracao,
  onSuspensaoDaCalibracao, mesmoTamanhoFisico, init, dispose, type SuspensaoDaCalibracao,
} from './calibration';
import { EXPERIMENT } from './config/experiment';
import { stepDwell, createDwellState, DEFAULT_DWELL_CONFIG } from './interaction/dwell';

// -----------------------------------------------------------------------------
// CORE-3 — janela que muda de tamanho e VOLTA (F11 do cuidador, monitor que
// dorme e o Windows rearranja as janelas, escala do Windows).
//
// Antes: a primeira variação > 2 % DESCARTAVA o modelo em memória e nada o
// recarregava quando a janela voltava — com o perfil válido no disco. Até
// calibrar de novo os 13 pontos, nada era clicável, nem a Emergência.
//
// Agora: a calibração fica SUSPENSA (amostras degradadas: só Emergência e
// recuperação) e volta sozinha com a janela; mudança só de escala (mesmos
// pixels físicos) não suspende; e uma janela que chega ao tamanho de um perfil
// salvo carrega esse perfil.
// -----------------------------------------------------------------------------

function viewport(w: number, h: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(document.documentElement, 'clientHeight', { value: h, configurable: true });
}

function prng(seed: number): () => number {
  let a = seed;
  return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff - 0.5; };
}

/** Mesmo gerador de `calibration.invalidation.test.ts` (modelo real, 8 dims). */
function calibrar(): void {
  const alvos = [
    { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.2 },
    { x: 0.2, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 },
    { x: 0.2, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.8, y: 0.8 },
  ];
  const rnd = prng(42);
  let relogio = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => (relogio += 80));
  startCalibrationMode();
  for (const t of alvos) {
    startCollectingPoint(t.x, t.y, () => {});
    for (let i = 0; i < 40; i++) {
      const v = Array.from({ length: 8 }, (_, d) => Math.sin(d * 1.7 + 0.3) * t.x + Math.cos(d * 2.3 + 1.1) * t.y + rnd() * 0.01);
      const w = Array.from({ length: 8 }, (_, d) => Math.cos(d * 1.3 + 0.7) * t.x + Math.sin(d * 1.9 + 0.2) * t.y + rnd() * 0.01);
      feedRawData(v, w, null);
    }
  }
  completeCalibration();
  spy.mockRestore();
}

/** 10 s olhando um alvo com amostras degradadas (calibração suspensa). */
function olharPor10s(alvo: { isEmergency: boolean; isRecovery: boolean }): boolean {
  const target = { key: 'alvo', customDwellMs: null, isDisabled: false, ...alvo };
  let st = createDwellState();
  for (let t = 0; t <= 10_000; t += 33) {
    const r = stepDwell(st, {
      x: 10, y: 10, timestamp: t, hasFace: true,
      degraded: getSuspensaoDaCalibracao() !== null, uncalibrated: !isCalibrated(), eyeState: 'open',
    }, target, DEFAULT_DWELL_CONFIG);
    st = r.state;
    if (r.effect.type === 'click') return true;
  }
  return false;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  localStorage.clear();
  clearCalibration();
  (EXPERIMENT as { polynomialFeatures: boolean }).polynomialFeatures = false;
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
});

afterEach(() => {
  dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('calibração suspensa pela janela fora do tamanho (CORE-3)', () => {
  it('F11 duplo: suspende (só Emergência e recuperação) e volta sozinha, sem recalibrar', () => {
    viewport(1920, 1080);
    calibrar();
    expect(isCalibrated()).toBe(true);
    const eventos: Array<SuspensaoDaCalibracao | null> = [];
    const parar = onSuspensaoDaCalibracao((s) => eventos.push(s));

    viewport(1280, 800); // F11: sai da tela cheia
    expect(checarMudancaDeViewport(1280, 800)).toBe(true);
    expect(isCalibrated()).toBe(true); // o modelo NÃO foi descartado
    expect(getSuspensaoDaCalibracao()).toMatchObject({ calibracao: { w: 1920, h: 1080 }, atual: { w: 1280, h: 800 } });
    expect(olharPor10s({ isEmergency: true, isRecovery: false })).toBe(true);
    expect(olharPor10s({ isEmergency: false, isRecovery: true })).toBe(true);
    expect(olharPor10s({ isEmergency: false, isRecovery: false })).toBe(false);

    viewport(1920, 1080); // F11 de novo: volta
    expect(checarMudancaDeViewport(1920, 1080)).toBe(false);
    expect(isCalibrated()).toBe(true);
    expect(getSuspensaoDaCalibracao()).toBeNull();
    expect(olharPor10s({ isEmergency: false, isRecovery: false })).toBe(true);

    // Um aviso ao suspender e um ao voltar (não um por resize).
    expect(eventos.map((e) => (e ? 'suspensa' : 'valendo'))).toEqual(['suspensa', 'valendo']);
    parar();
  });

  it('só a escala do Windows mudou (mesmos pixels físicos): nada é suspenso', () => {
    viewport(1920, 1080);
    calibrar();
    // 125 %: o viewport em px CSS encolhe, a tela física é a mesma.
    expect(checarMudancaDeViewport(1536, 864, 1.25)).toBe(false);
    expect(getSuspensaoDaCalibracao()).toBeNull();
    expect(mesmoTamanhoFisico({ w: 1920, h: 1080, dpr: 1 }, { w: 1536, h: 864, dpr: 1.25 })).toBe(true);
    expect(mesmoTamanhoFisico({ w: 1920, h: 1080, dpr: 1 }, { w: 1280, h: 800, dpr: 1 })).toBe(false);
  });

  it('variação pequena (barra de rolagem, arredondamento) não suspende', () => {
    viewport(1920, 1080);
    calibrar();
    expect(checarMudancaDeViewport(1905, 1080)).toBe(false);
    expect(getSuspensaoDaCalibracao()).toBeNull();
  });

  it('recalibrar tira a suspensão', () => {
    viewport(1920, 1080);
    calibrar();
    checarMudancaDeViewport(1280, 800);
    expect(getSuspensaoDaCalibracao()).not.toBeNull();
    viewport(1280, 800);
    calibrar();
    expect(getSuspensaoDaCalibracao()).toBeNull();
    expect(isCalibrated()).toBe(true);
  });

  it('sem modelo em memória, a janela que chega ao tamanho de um perfil salvo carrega esse perfil', () => {
    // Tamanhos só deste teste: o módulo guarda em memória a lista de perfis
    // gravados pelos testes anteriores (1920×1080 e 1280×800).
    vi.useFakeTimers();
    viewport(1600, 900);
    calibrar(); // grava o perfil de 1600×900
    clearCalibration();
    expect(isCalibrated()).toBe(false);

    // O app abre com a janela menor: o perfil (escolhido pelo tamanho) não vale.
    viewport(1366, 768);
    init();
    expect(isCalibrated()).toBe(false);

    // O cuidador aperta F11: a janela chega ao tamanho do perfil.
    viewport(1600, 900);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(350);
    expect(isCalibrated()).toBe(true);
    expect(getSuspensaoDaCalibracao()).toBeNull();
    // E o perfil continua o mesmo que um `loadProfile()` escolheria.
    expect(loadProfile()).toBe(true);
  });
});
