// Revisão do pipeline de 19/10/2026 — `poucasAmostras` da recoleta contava as
// amostras DEPOIS do filtro robusto por quadro (M6), mas o mínimo é o da
// COLETA (MIN_ACCEPTED_SAMPLES = 15). Num PC a ~15 fps todo ponto fecha
// (estável) com exatamente 15 amostras; um único quadro descartado pelo M6
// (piscada parcial, intrusão sacádica) marcava o alvo como "ruim" e a recoleta
// automática o refazia — tempo de fixação gasto à toa por quem tem ELA.
//
// O teste da revisão (scratchpad/revisao_pipeline/testes/
// poucasAmostrasPosM6.test.ts), com a afirmação INVERTIDA: agora o alvo conta
// as amostras COLETADAS (antes do M6) e nada é marcado só por isso.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as cal from './calibration';
import { EXPERIMENT } from './config/experiment';

const W = 1920, H = 1080;
let relogio = 0;
function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}
const QUALIDADE = {
  yaw: 0, pitch: 0, roll: 0, irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0,
};

/**
 * Calibração de 13 pontos a `passoMs` por quadro; nos alvos de `comPico`, um
 * quadro (o 5º depois da acomodação) traz um pico na 3ª feature (não usada pelo
 * fechamento). `ralo(i)`: o rosto some depois de 8 quadros úteis naquele alvo
 * (o ponto fecha pelo teto com menos que o mínimo).
 */
function calibrar(passoMs: number, comPico: (i: number) => boolean, ralo: (i: number) => boolean = () => false) {
  const rnd = gerador(7);
  const olho = (x: number, y: number, pico: number) => [
    (x - 0.5) * 0.08 + rnd() * 0.0008,
    (y - 0.5) * 0.05 + rnd() * 0.0008,
    Math.tan((x - 0.5) * 0.9) + rnd() * 0.003 + pico,
    Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
  ];
  cal.clearCalibration();
  expect(cal.startCalibrationMode()).toBe(true);
  const aceitos: number[] = [];
  cal.getCalibrationTargets().forEach((t, i) => {
    let fechou = false;
    cal.startCollectingPoint(t.x, t.y, () => { fechou = true; });
    const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(t.x, t.y));
    const acomodacao = cal.acomodacaoDoPontoMs();
    let k = 0;
    for (let ms = 0; ms <= dur + 200 && !fechou; ms += passoMs) {
      relogio += passoMs;
      const depoisDaAcomodacao = ms > acomodacao;
      if (depoisDaAcomodacao) k++;
      if (ralo(i) && k > 8) continue; // o rosto sumiu: nenhum quadro chega
      const pico = comPico(i) && k === 5 ? 0.5 : 0;
      const f = olho(t.x, t.y, pico);
      cal.feedRawData(f, [...f], QUALIDADE);
    }
    // O ponto ralo fecha pelo timeout duro (o `setTimeout` do núcleo).
    if (!fechou) vi.runOnlyPendingTimers();
    aceitos.push(cal.getResumoDoPonto().aceitos);
  });
  let ok: boolean | null = null;
  cal.completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
  expect(ok).toBe(true);
  return aceitos;
}

describe('recoleta × filtro robusto (M6)', () => {
  const salvas = { p: EXPERIMENT.persistirCalibracao, r: EXPERIMENT.recoletaDeAlvosRuins, m6: EXPERIMENT.calibracaoRobusta };
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    EXPERIMENT.persistirCalibracao = false;
    EXPERIMENT.recoletaDeAlvosRuins = true;
    EXPERIMENT.calibracaoRobusta = true;
    cal.setSessionGeometry(null);
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = salvas.p;
    EXPERIMENT.recoletaDeAlvosRuins = salvas.r;
    EXPERIMENT.calibracaoRobusta = salvas.m6;
    cal.clearCalibration();
  });

  it('a 15 fps, um quadro descartado pelo M6 NÃO vira "poucasAmostras" nem manda refazer o alvo', () => {
    const comPico = (i: number) => i === 2 || i === 7;
    const aceitos = calibrar(66, comPico);
    // Todo alvo fechou com o mínimo da coleta.
    expect(Math.min(...aceitos)).toBeGreaterThanOrEqual(cal.MIN_ACCEPTED_SAMPLES);
    // O M6 tirou mesmo os quadros com pico (é o que o teste exercita).
    expect(cal.getCalibrationFitDiagnostics()!.robusto!.fracaoDescartada).toBeGreaterThan(0);
    const q = cal.getQualidadeDosAlvos()!;
    // O alvo conta o que foi COLETADO: as amostras do diagnóstico são as da coleta.
    expect(q.map((a) => a.amostras)).toEqual(aceitos);
    expect(q.filter((a) => a.motivos.includes('poucasAmostras'))).toEqual([]);
    expect(cal.alvosParaRecoletar()).toEqual([]);
  });

  it('controle: os mesmos picos a 30 fps não marcam nada', () => {
    const comPico = (i: number) => i === 2 || i === 7;
    calibrar(33, comPico);
    const q = cal.getQualidadeDosAlvos()!;
    expect(q.filter((a) => a.motivos.length > 0)).toEqual([]);
    expect(cal.alvosParaRecoletar()).toEqual([]);
  });

  it('um alvo que de fato COLETOU menos que o mínimo (o rosto sumiu) continua marcado', () => {
    const aceitos = calibrar(33, () => false, (i) => i === 4);
    expect(aceitos[4]).toBeLessThan(cal.MIN_ACCEPTED_SAMPLES);
    const q = cal.getQualidadeDosAlvos()!;
    const marcados = q.filter((a) => a.motivos.includes('poucasAmostras'));
    expect(marcados).toHaveLength(1);
    expect(marcados[0].amostras).toBe(aceitos[4]);
    expect(cal.alvosParaRecoletar().map((a) => `${a.x},${a.y}`)).toContain(`${marcados[0].x},${marcados[0].y}`);
  });
});
