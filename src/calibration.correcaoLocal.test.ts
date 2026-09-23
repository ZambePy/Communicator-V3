import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  captureReferenceStateForProfile,
  clearCalibration,
  completeCalibration,
  duracaoTotalDoPonto,
  feedRawData,
  getCalibrationTargets,
  getCollectionMsForPoint,
  getCorrecaoLocal,
  mapGaze,
  restoreReferenceStateFromProfile,
  startCalibrationMode,
  startCollectingPoint,
} from './calibration';
import { EXPERIMENT } from './config/experiment';

// A calibração do perfil padrão tem 13 alvos (grade 3×3 + 4 cantos da tela) e
// ajusta, junto com o Ridge, uma correção local nos cantos (`correcaoLocal.ts`).
// Aqui o olho sintético SATURA embaixo — como a pálpebra faz com a íris real:
// abaixo de y = 0,84 as features param de andar — e o canto superior direito
// EXPANDE. Um polinômio global não representa as duas coisas; a correção tem de
// consertar os cantos sem mexer no miolo.

const W = 1920;
const H = 1080;
let relogio = 0;

function olho(x: number, y: number, rnd: () => number): number[] {
  const ys = Math.min(y, 0.84);                                   // saturação embaixo
  const expande = x > 0.9 && y < 0.1 ? 1.25 : 1;                  // canto sup. dir.
  const ox = (x - 0.5) * 0.08 * expande;
  const oy = (ys - 0.5) * 0.05;
  return [
    ox + rnd() * 0.0008, oy + rnd() * 0.0008,
    Math.tan((x - 0.5) * 0.9 * expande) + rnd() * 0.003, Math.tan((ys - 0.5) * 0.5) + rnd() * 0.003,
  ];
}

function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}

const QUALIDADE = {
  yaw: 0, pitch: 0, roll: 0,
  irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0,
};

function calibrar(): void {
  const rnd = gerador(7);
  clearCalibration();
  expect(startCalibrationMode()).toBe(true);
  for (const t of getCalibrationTargets()) {
    startCollectingPoint(t.x, t.y, () => {});
    const dur = duracaoTotalDoPonto(getCollectionMsForPoint(t.x, t.y));
    for (let ms = 0; ms <= dur + 200; ms += 33) {
      relogio += 33;
      feedRawData(olho(t.x, t.y, rnd), olho(t.x, t.y, rnd), QUALIDADE);
    }
  }
  let ok: boolean | null = null;
  completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
  expect(ok).toBe(true);
}

/** Erro em px de `mapGaze` no ponto (x, y), com o olho sem ruído. */
function erroPx(x: number, y: number): number {
  const zero = () => 0;
  const p = mapGaze(olho(x, y, zero), olho(x, y, zero));
  expect(p).not.toBeNull();
  return Math.hypot(p!.x - x * W, p!.y - y * H);
}

describe('calibração de 13 pontos com correção local dos cantos', () => {
  const persistirAntes = EXPERIMENT.persistirCalibracao;
  const correcaoAntes = EXPERIMENT.correcaoLocal;

  beforeAll(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    EXPERIMENT.persistirCalibracao = false;
  });
  afterEach(() => { EXPERIMENT.correcaoLocal = correcaoAntes; });
  afterAll(() => {
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = persistirAntes;
    clearCalibration();
  });

  it('ajusta a correção com os 13 alvos e conserta os cantos sem mexer no miolo', () => {
    EXPERIMENT.correcaoLocal = true;
    calibrar();
    const c = getCorrecaoLocal();
    expect(c).not.toBeNull();
    expect(c!.centros).toHaveLength(13);

    const cantos: [number, number][] = [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]];
    const miolo: [number, number][] = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.5], [0.5, 0.75]];
    const comCantos = cantos.map(([x, y]) => erroPx(x, y));
    const comMiolo = miolo.map(([x, y]) => erroPx(x, y));

    // Mesmo modelo, correção desligada na aplicação.
    EXPERIMENT.correcaoLocal = false;
    const semCantos = cantos.map(([x, y]) => erroPx(x, y));
    const semMiolo = miolo.map(([x, y]) => erroPx(x, y));

    const media = (v: number[]) => v.reduce((s, e) => s + e, 0) / v.length;
    // O modelo global erra os cantos distorcidos; a correção corta o erro.
    expect(media(semCantos)).toBeGreaterThan(20);
    expect(media(comCantos)).toBeLessThan(media(semCantos) * 0.5);
    // No miolo a correção não move o cursor (< 2 px em cada ponto).
    comMiolo.forEach((e, i) => expect(Math.abs(e - semMiolo[i])).toBeLessThan(2));
  });

  it('a correção viaja no perfil e some com ele', () => {
    EXPERIMENT.correcaoLocal = true;
    calibrar();
    const ref = captureReferenceStateForProfile();
    expect(ref.correcaoLocal).not.toBeNull();
    restoreReferenceStateFromProfile(null);
    expect(getCorrecaoLocal()).toBeNull();
    restoreReferenceStateFromProfile(JSON.parse(JSON.stringify(ref)));
    expect(getCorrecaoLocal()).toEqual(ref.correcaoLocal);
  });

  it('com a flag desligada no treino, não há correção: vale o modelo global', () => {
    EXPERIMENT.correcaoLocal = false;
    calibrar();
    expect(getCorrecaoLocal()).toBeNull();
  });
});
