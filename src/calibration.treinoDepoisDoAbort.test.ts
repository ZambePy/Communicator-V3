// Revisão do pipeline de 20/10/2026 — a tela dispara o treino depois da
// pintura (`esperarPintura`), e uma interrupção entre o último ponto e a
// pintura (a janela perde o foco, o núcleo interrompe a coleta) não o
// impedia. No núcleo, o treino que rodava DEPOIS do abort pegava as amostras
// da sessão cancelada, punha o modelo delas em uso por cima da calibração que o
// abort tinha devolvido e o gravava com o id e o instante DELA.
//
// O teste da revisão (scratchpad/revisao2_pipeline/testes/
// treinoDepoisDoAbort.test.ts) mostrava isso; aqui, invertido: o
// `completeCalibration` recusa a sessão cancelada (`sessao_cancelada`) e nada
// muda — o modelo em uso, o instante, o disco. Uma sessão nova treina normal.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as cal from './calibration';
import { EXPERIMENT } from './config/experiment';

const W = 1920, H = 1080;
let relogio = 0;
let agoraDate = 1_760_000_000_000;
function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}
const olhoCom = (rnd: () => number) => (x: number, y: number) => [
  (x - 0.5) * 0.08 + rnd() * 0.0008, (y - 0.5) * 0.05 + rnd() * 0.0008,
  Math.tan((x - 0.5) * 0.9) + rnd() * 0.003, Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
];
// A sessão B olha 5 % para a direita do alvo: um modelo dela prevê outro lugar.
const olhoDeslocado = (rnd: () => number) => (x: number, y: number) => olhoCom(rnd)(x + 0.05, y);
const semRuido = olhoCom(() => 0);
const Q = { yaw: 0, pitch: 0, roll: 0, irisVisibilityPercentage: 1, detectorConfidence: 0.99, brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0 };
function coletarTudo(olho: (x: number, y: number) => number[]) {
  for (const t of cal.getCalibrationTargets()) {
    cal.startCollectingPoint(t.x, t.y, () => {});
    const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(t.x, t.y));
    for (let ms = 0; ms <= dur + 200; ms += 33) { relogio += 33; cal.feedRawData(olho(t.x, t.y), olho(t.x, t.y), Q); }
  }
}
const sonda = () => [[0.05, 0.05], [0.5, 0.5], [0.95, 0.95]].map(([x, y]) => cal.mapGaze(semRuido(x, y), semRuido(x, y)));

describe('treino que chega depois do abort da calibração (revisão de 20/10/2026)', () => {
  const salvas = { p: EXPERIMENT.persistirCalibracao };
  beforeAll(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(Date, 'now').mockImplementation(() => agoraDate);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    EXPERIMENT.persistirCalibracao = true;
    localStorage.clear();
    cal.setSessionGeometry(null);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = salvas.p;
    cal.clearCalibration();
    localStorage.clear();
  });

  it('é recusado: a calibração de antes segue em uso, com o instante dela, e o disco não muda', () => {
    // Calibração A, de ontem.
    cal.clearCalibration();
    expect(cal.startCalibrationMode({ label: 'A (ontem)' })).toBe(true);
    coletarTudo(olhoCom(gerador(7)));
    cal.completeCalibration(() => {});
    const tA = cal.getCalibrationTimestampMs();
    const sondaA = sonda();
    const discoA = localStorage.getItem(cal.PROFILES_STORAGE_KEY);
    expect(discoA).not.toBeNull();

    // Um dia depois: calibração B, os 13 pontos fecham...
    agoraDate += 86_400_000;
    expect(cal.startCalibrationMode({ label: 'B (hoje)' })).toBe(true);
    coletarTudo(olhoDeslocado(gerador(99)));
    // ...e a janela perde o foco (ou o núcleo interrompe) antes do treino.
    cal.abortCalibration();
    expect(cal.getCalibrationTimestampMs()).toBe(tA); // o abort devolveu A
    expect(sonda()).toEqual(sondaA);

    // O `esperarPintura` dispara o treino mesmo assim.
    let desfecho: unknown = null;
    cal.completeCalibration((o) => { desfecho = o; });
    expect(desfecho).toMatchObject({ ok: false, reason: 'sessao_cancelada' });
    expect(cal.isCalibrated()).toBe(true);
    expect(cal.getCalibrationTimestampMs()).toBe(tA);
    expect(sonda()).toEqual(sondaA);
    expect(localStorage.getItem(cal.PROFILES_STORAGE_KEY)).toBe(discoA);
    // Pedir de novo não muda nada.
    cal.completeCalibration((o) => { desfecho = o; });
    expect(desfecho).toMatchObject({ ok: false, reason: 'sessao_cancelada' });
    expect(sonda()).toEqual(sondaA);
  });

  it('uma sessão nova depois do abort treina normalmente', () => {
    agoraDate += 3_600_000;
    expect(cal.startCalibrationMode({ label: 'C' })).toBe(true);
    coletarTudo(olhoDeslocado(gerador(5)));
    let desfecho: unknown = null;
    cal.completeCalibration((o) => { desfecho = o; });
    expect(desfecho).toMatchObject({ ok: true });
    expect(cal.getCalibrationTimestampMs()).toBe(agoraDate);
  });

  it('limpar a calibração não deixa a recusa para trás: sem amostras, o motivo é a falta delas', () => {
    expect(cal.startCalibrationMode()).toBe(true);
    cal.abortCalibration();
    cal.clearCalibration();
    let desfecho: unknown = null;
    cal.completeCalibration((o) => { desfecho = o; });
    expect(desfecho).toMatchObject({ ok: false, reason: 'insufficient_samples' });
  });
});
