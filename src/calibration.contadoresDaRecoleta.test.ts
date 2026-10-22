// Revisão do pipeline de 19/10/2026 — os contadores do relatório não
// acompanhavam a troca nem o descarte de amostras da recoleta (M22): no
// aceite, `tempoUtilPorAlvoMs` ficava com 13+k entradas, os contadores somavam
// as tentativas e a pose e as distâncias dos alvos substituídos continuavam lá
// (a distância de referência do modelo novo saía da mediana de amostras que
// ele nem usa); no abort, `encerrarColeta` zerava os da calibração em uso.
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
const CANTO = { x: 0.05, y: 0.05 };
const ehCanto = (t: { x: number; y: number }) => Math.abs(t.x - CANTO.x) < 1e-9 && Math.abs(t.y - CANTO.y) < 1e-9;
const chave = (t: { x: number; y: number }) => `${t.x.toFixed(4)},${t.y.toFixed(4)}`;

/** Distância de cada alvo pela escala do rosto (IOD): cada alvo a uma distância um pouco diferente. */
const iodDoAlvo = (i: number) => 240 + 3 * i;
/** No canto mal coletado a pessoa estava mais perto da câmera (e com a cabeça virada). */
const IOD_DO_CANTO_RUIM = 330;

function coletar(alvo: { x: number; y: number }, olho: (x: number, y: number) => number[], olhar = alvo, iodPx = 250, yaw = 0) {
  cal.startCollectingPoint(alvo.x, alvo.y, () => {});
  const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(alvo.x, alvo.y));
  for (let ms = 0; ms <= dur + 200; ms += 33) {
    relogio += 33;
    cal.setCurrentFrameGeometry(iodPx, W, H, { x: 0.5, y: 0.45 });
    cal.feedRawData(olho(olhar.x, olhar.y), olho(olhar.x, olhar.y), {
      yaw, pitch: 0, roll: 0, irisVisibilityPercentage: 1, detectorConfidence: 0.99,
      brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0,
    });
  }
}
function calibrarComCantoRuim() {
  const olho = olhoCom(gerador(7));
  cal.clearCalibration();
  expect(cal.startCalibrationMode()).toBe(true);
  cal.getCalibrationTargets().forEach((t, i) => {
    coletar(t, olho, ehCanto(t) ? { x: 0.3, y: 0.3 } : t, ehCanto(t) ? IOD_DO_CANTO_RUIM : iodDoAlvo(i), ehCanto(t) ? 0.2 : 0);
  });
  cal.completeCalibration(() => {});
}
/** A distância (cm) que o núcleo mede para uma IOD. */
function distanciaDaIod(iodPx: number): number {
  cal.setCurrentFrameGeometry(iodPx, W, H, { x: 0.5, y: 0.45 });
  return cal.getCurrentCameraDistanceCm()!;
}
function medianaPonderada(pares: { valor: number; n: number }[]): number {
  const v = pares.flatMap((p) => Array<number>(p.n).fill(p.valor)).sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

describe('séries e contadores da sessão × recoleta', () => {
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
    cal.setCameraFovDeg(60);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = salvas.p;
    EXPERIMENT.recoletaDeAlvosRuins = salvas.r;
    cal.setCameraFovDeg(null);
    cal.clearCalibration();
  });

  it('recoleta ACEITA: uma entrada por alvo, e a distância de referência é a mediana das amostras EM USO', () => {
    calibrarComCantoRuim();
    expect(cal.getCalibrationFitDiagnostics()!.tempoUtilPorAlvoMs).toHaveLength(13);
    const alvos = cal.getCalibrationTargets().map((t) => ({ x: t.x, y: t.y }));
    const i0 = alvos.findIndex(ehCanto);

    expect(cal.iniciarRecoletaDeAlvos([CANTO])).toHaveLength(1);
    coletar(CANTO, olhoCom(gerador(11)), CANTO, iodDoAlvo(i0));
    const r = cal.concluirRecoletaDeAlvos();
    expect(r.aceito).toBe(true);
    expect(r.tempoUtilMs).toBeGreaterThan(0); // o custo da rodada fica no relatório dela

    const d1 = cal.getCalibrationFitDiagnostics()!;
    // Uma entrada por ALVO em uso: o canto entrou com a coleta nova, sem a antiga.
    expect(d1.tempoUtilPorAlvoMs).toHaveLength(13);
    expect(cal.getSessionPoseDrift()?.targets).toBe(13);
    // As distâncias são as das amostras que treinaram: o canto antigo (mais
    // perto) saiu. Cada alvo tem as amostras coletadas dele, todas à mesma IOD.
    const q = cal.getQualidadeDosAlvos()!;
    const pares = alvos.map((t, i) => ({
      valor: distanciaDaIod(iodDoAlvo(i)),
      n: q.find((a) => a.chave === chave(t))!.amostras,
    }));
    expect(cal.measuredCalibrationDistanceSamples()).toBe(pares.reduce((s, p) => s + p.n, 0));
    expect(cal.measuredCalibrationDistanceCm()).toBe(medianaPonderada(pares));
    expect(cal.getCalibrationDistancesCm().cameraCm).toBe(medianaPonderada(pares));
  });

  it('recoleta CANCELADA: as séries da calibração em uso ficam como estavam (antes eram zeradas)', () => {
    calibrarComCantoRuim();
    const tempo = cal.getCalibrationFitDiagnostics()!.tempoUtilPorAlvoMs.slice();
    const deriva = cal.getSessionPoseDrift();
    const distancias = cal.measuredCalibrationDistanceSamples();
    const referencia = cal.measuredCalibrationDistanceCm();
    expect(deriva).not.toBeNull();
    expect(deriva!.targets).toBe(13);

    expect(cal.iniciarRecoletaDeAlvos([CANTO])).toHaveLength(1);
    coletar(CANTO, olhoCom(gerador(11)));
    cal.abortCalibration();
    expect(cal.recoletaEmAndamento()).toBe(false);

    expect(cal.getSessionPoseDrift()).toEqual(deriva);
    expect(cal.measuredCalibrationDistanceSamples()).toBe(distancias);
    expect(cal.measuredCalibrationDistanceCm()).toBe(referencia);
    // O reforço que vier depois treina com a sessão inteira: a série de tempo
    // dele começa das 13 entradas da calibração, não do zero, e a grade
    // planejada continua a dos 13 pontos.
    const extras = cal.iniciarRodadaDeReforco({ piores: 1, maximo: 1, razaoMinima: 0 });
    expect(extras.length).toBeGreaterThan(0);
    const olho = olhoCom(gerador(3));
    for (const e of extras) coletar(e, olho);
    cal.completeCalibration(() => {});
    const d = cal.getCalibrationFitDiagnostics()!;
    expect(d.tempoUtilPorAlvoMs.slice(0, 13)).toEqual(tempo);
    expect(d.targetsPlanned).toBe(13 + extras.length);
  });

  it('recoleta RECUSADA pela trava: as séries voltam inteiras', () => {
    calibrarComCantoRuim();
    const d0 = cal.getCalibrationFitDiagnostics()!;
    const distancias = cal.measuredCalibrationDistanceSamples();
    const deriva = cal.getSessionPoseDrift();
    // Recoleta de um alvo bom com a pessoa olhando para o CENTRO: o LOTO piora.
    const bom = cal.getCalibrationTargets().find((t) => !ehCanto(t) && t.x > 0.9 && t.y > 0.9)!;
    expect(cal.iniciarRecoletaDeAlvos([bom])).toHaveLength(1);
    coletar(bom, olhoCom(gerador(3)), { x: 0.5, y: 0.5 });
    const r = cal.concluirRecoletaDeAlvos();
    expect(r.aceito).toBe(false);
    expect(cal.getCalibrationFitDiagnostics()!.tempoUtilPorAlvoMs).toEqual(d0.tempoUtilPorAlvoMs);
    expect(cal.measuredCalibrationDistanceSamples()).toBe(distancias);
    expect(cal.getSessionPoseDrift()).toEqual(deriva);
  });
});
