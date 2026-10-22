// Revisão do pipeline de 19/10/2026 — a recoleta ACEITA troca o modelo, mas
// gravava com a mesma meta (mesmo `createdAt`): `getCalibrationTimestampMs()`
// não mudava, o registro de blocos contava o próximo teste como "2 = repetição
// contra a MESMA calibração" — medido num modelo que não é o do bloco 1 — e a
// linha de base do vigia e do alvo mínimo (M18), o `accuracyResult`, seguia a
// do modelo de antes.
//
// O teste da revisão (scratchpad/revisao_pipeline/testes/
// blocoDepoisDaRecoleta.test.ts), com a afirmação INVERTIDA: o modelo novo
// ganha um instante de treino novo, o bloco recomeça em 1 e a linha de base do
// modelo de antes deixa de valer.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import * as cal from './calibration';
import { EXPERIMENT } from './config/experiment';
import { lerReferenciaDePrecisao } from './vigiaDeRecalibracao';
import { proximoBloco, limparContagemDeBlocos } from '../frontend/src/registroDaSessao';
import { requisitoMedidoPx } from '../frontend/src/design/gazeMetrics';

const W = 1920, H = 1080;
let relogio = 0;
let agora = Date.parse('2026-10-19T15:00:00Z');
/** O relógio do quadro (`performance.now`) e o de parede (`Date`, que dá o `createdAt`) andam juntos. */
function andar(ms: number) {
  relogio += ms;
  agora += ms;
  vi.setSystemTime(agora);
}
function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}
const QUALIDADE = {
  yaw: 0, pitch: 0, roll: 0, irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0,
};
const CANTO = { x: 0.05, y: 0.05 };
const olhoCom = (rnd: () => number) => (x: number, y: number) => [
  (x - 0.5) * 0.08 + rnd() * 0.0008, (y - 0.5) * 0.05 + rnd() * 0.0008,
  Math.tan((x - 0.5) * 0.9) + rnd() * 0.003, Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
];
const semRuido = olhoCom(() => 0);
function coletar(alvo: { x: number; y: number }, olho: (x: number, y: number) => number[], olhar = alvo) {
  cal.startCollectingPoint(alvo.x, alvo.y, () => {});
  const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(alvo.x, alvo.y));
  for (let ms = 0; ms <= dur + 200; ms += 33) {
    andar(33);
    cal.feedRawData(olho(olhar.x, olhar.y), olho(olhar.x, olhar.y), QUALIDADE);
  }
}
/** O canto superior esquerdo coletado com o olhar em (30 %, 30 %): a recoleta dele é aceita. */
function calibrarComCantoRuim() {
  const olho = olhoCom(gerador(7));
  cal.clearCalibration();
  expect(cal.startCalibrationMode()).toBe(true);
  for (const t of cal.getCalibrationTargets()) {
    const ehCanto = Math.abs(t.x - CANTO.x) < 1e-9 && Math.abs(t.y - CANTO.y) < 1e-9;
    coletar(t, olho, ehCanto ? { x: 0.3, y: 0.3 } : t);
  }
  cal.completeCalibration(() => {});
}
/** O teste de precisão logo depois da calibração: grava a linha de base. */
function gravarTesteDePrecisao() {
  andar(30_000);
  localStorage.setItem('accuracyResult', JSON.stringify({
    meanError: 40, timestamp: agora, bceaPx2: 1200, biasX: 10, biasY: 5, lado95Filtrado1sPx: 150,
  }));
}

describe('bloco de medição × recoleta pedida', () => {
  const salvas = { p: EXPERIMENT.persistirCalibracao, r: EXPERIMENT.recoletaDeAlvosRuins, m18: EXPERIMENT.alvoMinimoMedido };
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(agora);
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    EXPERIMENT.persistirCalibracao = false;
    EXPERIMENT.recoletaDeAlvosRuins = true;
    EXPERIMENT.alvoMinimoMedido = true;
    cal.setSessionGeometry(null);
  });
  beforeEach(() => {
    localStorage.clear();
    limparContagemDeBlocos();
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = salvas.p;
    EXPERIMENT.recoletaDeAlvosRuins = salvas.r;
    EXPERIMENT.alvoMinimoMedido = salvas.m18;
    cal.clearCalibration();
    localStorage.clear();
  });

  it('recoleta ACEITA: modelo novo, instante de treino novo, bloco 1 de novo, linha de base do modelo de antes não vale', () => {
    calibrarComCantoRuim();
    const t0 = cal.getCalibrationTimestampMs();
    expect(t0).not.toBeNull();
    // Bloco 1: o teste do fim da calibração mede o modelo A.
    expect(proximoBloco(t0)).toBe(1);
    gravarTesteDePrecisao();
    expect(requisitoMedidoPx()).toBe(150);
    expect(lerReferenciaDePrecisao(localStorage, t0)).not.toBeNull();
    const cantoAntes = cal.mapGaze(semRuido(CANTO.x, CANTO.y), semRuido(CANTO.x, CANTO.y))!;

    // "Refazer só os cantos" na tela de resultado: recoleta pedida, aceita.
    andar(60_000);
    const eventos = vi.fn();
    window.addEventListener(cal.EVENTO_DE_CALIBRACAO_EM_USO, eventos);
    expect(cal.iniciarRecoletaDeAlvos([CANTO])).toHaveLength(1);
    coletar(CANTO, olhoCom(gerador(11)));
    const r = cal.concluirRecoletaDeAlvos();
    window.removeEventListener(cal.EVENTO_DE_CALIBRACAO_EM_USO, eventos);
    expect(r.aceito).toBe(true);
    const cantoDepois = cal.mapGaze(semRuido(CANTO.x, CANTO.y), semRuido(CANTO.x, CANTO.y))!;
    expect(Math.hypot(cantoDepois.x - cantoAntes.x, cantoDepois.y - cantoAntes.y)).toBeGreaterThan(1);

    // O próximo teste é de OUTRO modelo: instante novo, contagem do 1.
    const t1 = cal.getCalibrationTimestampMs();
    expect(t1).not.toBeNull();
    expect(t1!).toBeGreaterThan(t0!);
    expect(eventos).toHaveBeenCalled();
    expect(cal.getActiveProfileMeta()?.createdAt).toBe(new Date(t1!).toISOString());
    // Mesmo perfil (o mesmo id), não um perfil novo.
    expect(cal.listCalibrationProfiles()).toHaveLength(1);
    expect(proximoBloco(t1)).toBe(1);
    // A medida do modelo de antes não vale para este: nem para o alvo mínimo
    // (M18) nem para o vigia de recalibração.
    expect(requisitoMedidoPx()).toBeNull();
    expect(lerReferenciaDePrecisao(localStorage, t1)).toBeNull();
  });

  it('recoleta RECUSADA pela trava: o modelo é o mesmo, o instante e o bloco seguem', () => {
    calibrarComCantoRuim();
    const t0 = cal.getCalibrationTimestampMs();
    expect(proximoBloco(t0)).toBe(1);
    andar(60_000);
    // A pessoa olhou para o CENTRO na recoleta do canto: o LOTO piora, volta o de antes.
    expect(cal.iniciarRecoletaDeAlvos([CANTO])).toHaveLength(1);
    coletar(CANTO, olhoCom(gerador(3)), { x: 0.5, y: 0.5 });
    const r = cal.concluirRecoletaDeAlvos();
    expect(r.aceito).toBe(false);
    expect(cal.getCalibrationTimestampMs()).toBe(t0);
    expect(proximoBloco(cal.getCalibrationTimestampMs())).toBe(2);
  });
});
