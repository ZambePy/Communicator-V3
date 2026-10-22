// Revisão do pipeline de 20/10/2026 — a perda de foco no meio do REFORÇO (S4)
// virou, em 19/10, a pausa "A calibração está salva" e, ao voltar, segue para o
// teste e a tela de resultado: o abort do reforço passou a ser caminho normal.
// O núcleo, no abort, não desfazia o reforço: as amostras do extra que já tinha
// fechado ficavam no perfil (o modelo em uso nunca as usou), e as séries e os
// contadores da sessão eram zerados. A recoleta pedida depois retreinava COM o
// extra, e o relatório descrevia uma sessão sem os 13 pontos.
//
// O teste da revisão (scratchpad/revisao2_pipeline/testes/
// reforcoInterrompidoVazaNaRecoleta.test.ts) afirmava o vazamento; aqui,
// invertido: o abort devolve o perfil, os alvos e as séries do início do
// reforço, como o da recoleta.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as cal from './calibration';
import { EXPERIMENT } from './config/experiment';

const W = 1920, H = 1080;
let relogio = 0;
function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}
const olhoCom = (rnd: () => number) => (x: number, y: number) => [
  (x - 0.5) * 0.08 + rnd() * 0.0008, (y - 0.5) * 0.05 + rnd() * 0.0008,
  Math.tan((x - 0.5) * 0.9) + rnd() * 0.003, Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
];
const Q = { yaw: 0, pitch: 0, roll: 0, irisVisibilityPercentage: 1, detectorConfidence: 0.99, brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0 };
function coletar(alvo: { x: number; y: number }, olho: (x: number, y: number) => number[], olhar = alvo) {
  cal.startCollectingPoint(alvo.x, alvo.y, () => {});
  const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(alvo.x, alvo.y));
  for (let ms = 0; ms <= dur + 200; ms += 33) { relogio += 33; cal.feedRawData(olho(olhar.x, olhar.y), olho(olhar.x, olhar.y), Q); }
}
const chave = (p: { x: number; y: number }) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;

describe('reforço interrompido × recoleta seguinte (revisão de 20/10/2026)', () => {
  const salvas = { p: EXPERIMENT.persistirCalibracao, r: EXPERIMENT.recoletaDeAlvosRuins };
  beforeAll(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    EXPERIMENT.persistirCalibracao = false;
    EXPERIMENT.recoletaDeAlvosRuins = true;
    cal.setSessionGeometry(null);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = salvas.p;
    EXPERIMENT.recoletaDeAlvosRuins = salvas.r;
    cal.clearCalibration();
  });

  it('o abort devolve o perfil, os alvos e as séries do início do reforço; a recoleta seguinte não vê o extra', () => {
    const olho = olhoCom(gerador(424242));
    cal.clearCalibration();
    expect(cal.startCalibrationMode()).toBe(true);
    const alvos = cal.getCalibrationTargets().map((t) => ({ x: t.x, y: t.y }));
    // Um alvo mal fixado concentra o erro LOO: o reforço abre extras em volta dele.
    alvos.forEach((t, i) => coletar(t, olho, i === 3 ? { x: t.x + 0.06, y: t.y - 0.05 } : t));
    let ok = false;
    cal.completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
    expect(ok).toBe(true);
    const amostrasDoModelo = cal.getSampleCount();
    const chavesDoModelo = new Set(cal.getCalibrationFitDiagnostics()!.looByTarget.map((t) => chave(t.alvo!)));
    const derivaAntes = JSON.parse(JSON.stringify(cal.getSessionPoseDrift()));
    const planejadosAntes = cal.getCalibrationTargets().map(chave);

    const extras = cal.iniciarRodadaDeReforco();
    expect(extras.length).toBeGreaterThan(0);
    // O primeiro extra fecha; a janela perde o foco logo depois.
    coletar(extras[0], olho);
    expect(cal.getSampleCount()).toBeGreaterThan(amostrasDoModelo);
    cal.abortCalibration(); // o que `abortarPorPerdaDeFoco` faz (calibration.abort)
    expect(cal.isCalibrated()).toBe(true); // a calibração dos 13 pontos segue em uso

    // Tudo como antes do reforço: as amostras, os alvos planejados, a deriva.
    expect(cal.getSampleCount()).toBe(amostrasDoModelo);
    expect(cal.getCalibrationTargets().map(chave)).toEqual(planejadosAntes);
    expect(cal.getTargetsSkipped()).toEqual([]);
    expect(JSON.parse(JSON.stringify(cal.getSessionPoseDrift()))).toEqual(derivaAntes);

    // "Continuar" → teste → tela de resultado → "Refazer só os cantos".
    expect(cal.podeRecoletarAlvos()).toBe(true);
    const canto = alvos.find((t) => t.x < 0.1 && t.y < 0.1)!;
    expect(cal.iniciarRecoletaDeAlvos([canto])).toHaveLength(1);
    coletar(canto, olho);
    const r = cal.concluirRecoletaDeAlvos();
    expect(r.motivo).not.toBe('sem_rodada');
    const d = cal.getCalibrationFitDiagnostics()!;
    const chavesDepois = new Set(d.looByTarget.map((t) => chave(t.alvo!)));
    // O extra que fechou antes do abort não entrou no treino da recoleta.
    expect(chavesDepois.has(chave(extras[0]))).toBe(false);
    expect(chavesDepois.size).toBe(chavesDoModelo.size);
    // E as séries descrevem a sessão de 13 pontos (não 0, não 14).
    expect(d.targetsPlanned).toBe(alvos.length);
    expect(d.tempoUtilPorAlvoMs).toHaveLength(alvos.length);
  });

  it('o reforço que termina continua igual: os extras entram no treino', () => {
    const olho = olhoCom(gerador(424242));
    cal.clearCalibration();
    expect(cal.startCalibrationMode()).toBe(true);
    const alvos = cal.getCalibrationTargets().map((t) => ({ x: t.x, y: t.y }));
    alvos.forEach((t, i) => coletar(t, olho, i === 3 ? { x: t.x + 0.06, y: t.y - 0.05 } : t));
    cal.completeCalibration(() => {});
    const amostras = cal.getSampleCount();
    const extras = cal.iniciarRodadaDeReforco();
    expect(extras.length).toBeGreaterThan(0);
    for (const x of extras) coletar(x, olho);
    let ok = false;
    cal.completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
    expect(ok).toBe(true);
    expect(cal.getSampleCount()).toBeGreaterThan(amostras);
    const chaves = new Set(cal.getCalibrationFitDiagnostics()!.looByTarget.map((t) => chave(t.alvo!)));
    for (const x of extras) expect(chaves.has(chave(x))).toBe(true);
    // Um abort depois do treino do reforço não tem o que desfazer.
    cal.abortCalibration();
    expect(cal.getSampleCount()).toBeGreaterThan(amostras);
  });
});
