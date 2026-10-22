// Revisão do pipeline de 20/10/2026 — a recoleta, o reforço e a segunda pose já
// eram recusados com a calibração suspensa PELO RECORTE (`recorteTrocado()`).
// Suspensa PELA JANELA, não: a recoleta abria, misturava amostras de duas
// geometrias, o treino gravava a janela de agora, tirava a suspensão e
// regravava o ÚNICO perfil com o mesmo id e a chave do tamanho de agora. Na
// próxima abertura em tela cheia nenhum perfil carregava, e ninguém era avisado.
//
// O teste da revisão (scratchpad/revisao2_pipeline/testes/
// recoletaComJanelaSuspensa.test.ts) afirmava "é permitida"; aqui, invertido:
// as três rodadas recusam, a tela não oferece o botão (`alvosParaRecoletar`
// vazio), o perfil do disco fica intacto e, com a janela de volta, tudo volta.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as cal from './calibration';
import { EXPERIMENT } from './config/experiment';

const W = 1920, H = 1080;
let largura = W;
let relogio = 0;
function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}
// O olho responde à posição FÍSICA na tela; a janela menor fica encostada à esquerda.
const olhoFisico = (rnd: () => number) => (fx: number, y: number) => {
  const x = fx * (largura / W);
  return [
    (x - 0.5) * 0.08 + rnd() * 0.0008, (y - 0.5) * 0.05 + rnd() * 0.0008,
    Math.tan((x - 0.5) * 0.9) + rnd() * 0.003, Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
  ];
};
const Q = { yaw: 0, pitch: 0, roll: 0, irisVisibilityPercentage: 1, detectorConfidence: 0.99, brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0 };
function coletar(alvo: { x: number; y: number }, f: (x: number, y: number) => number[]) {
  cal.startCollectingPoint(alvo.x, alvo.y, () => {});
  const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(alvo.x, alvo.y));
  for (let ms = 0; ms <= dur + 200; ms += 33) { relogio += 33; cal.feedRawData(f(alvo.x, alvo.y), f(alvo.x, alvo.y), Q); }
}
const discoBruto = () => localStorage.getItem(cal.PROFILES_STORAGE_KEY);
const perfisNoDisco = () => (JSON.parse(discoBruto() ?? '[]') as { meta: { id: string }; contextKey: string }[])
  .map((p) => ({ id: p.meta.id, chave: p.contextKey }));
/** Onde o modelo põe três olhares sem ruído (na tela cheia). */
const sonda = () => {
  const f = olhoFisico(() => 0);
  const out: ({ x: number; y: number } | null)[] = [];
  for (const [x, y] of [[0.05, 0.05], [0.5, 0.5], [0.95, 0.95]] as const) out.push(cal.mapGaze(f(x, y), f(x, y)));
  return out;
};

describe('recoleta com a calibração suspensa pela janela (revisão de 20/10/2026)', () => {
  const salvas = { p: EXPERIMENT.persistirCalibracao, r: EXPERIMENT.recoletaDeAlvosRuins };
  beforeAll(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => largura });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    EXPERIMENT.persistirCalibracao = true;
    EXPERIMENT.recoletaDeAlvosRuins = true;
    localStorage.clear();
    cal.setSessionGeometry(null);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = salvas.p;
    EXPERIMENT.recoletaDeAlvosRuins = salvas.r;
    cal.clearCalibration();
    localStorage.clear();
  });

  it('recusa a recoleta, o reforço e a segunda pose; o perfil do disco fica intacto e volta com a janela', () => {
    largura = W;
    const f = olhoFisico(gerador(7));
    cal.clearCalibration();
    expect(cal.startCalibrationMode()).toBe(true);
    // O canto de cima à esquerda foi mal fixado na calibração (o olhar estava em
    // 0,3/0,3): é o caso em que a recoleta MELHORA o LOTO e a trava aceitaria.
    for (const t of cal.getCalibrationTargets()) {
      const ruim = Math.abs(t.x - 0.05) < 1e-9 && Math.abs(t.y - 0.05) < 1e-9;
      coletar(t, ruim ? (() => f(0.3, 0.3)) : f);
    }
    cal.completeCalibration(() => {});
    expect(cal.isCalibrated()).toBe(true);
    const chaveCheia = cal.chaveDoContextoAtual();
    expect(cal.podeRecoletarAlvos()).toBe(true);
    expect(cal.alvosParaRecoletar().length).toBeGreaterThan(0);
    const discoAntes = discoBruto();
    expect(perfisNoDisco()).toEqual([{ id: expect.any(String), chave: chaveCheia }]);
    const antes = sonda();

    // A janela sai da tela cheia (monitor que dormiu e rearranjou as janelas).
    largura = 1600;
    expect(cal.checarMudancaDeViewport(largura, H)).toBe(true);
    expect(cal.getSuspensaoDaCalibracao()).not.toBeNull();
    expect(cal.getSuspensaoDaCalibracao()?.recorte).toBeUndefined();

    // As três rodadas recusam, e a tela de resultado não tem o que oferecer.
    expect(cal.podeRecoletarAlvos()).toBe(false);
    expect(cal.alvosParaRecoletar()).toEqual([]);
    const canto = { x: 0.05, y: 0.05 };
    expect(cal.iniciarRecoletaDeAlvos([canto])).toEqual([]);
    expect(cal.iniciarRodadaDeReforco()).toEqual([]);
    expect(cal.iniciarRodadaDeSegundaPose()).toEqual([]);
    expect(cal.recoletaEmAndamento()).toBe(false);
    // Nada aberto: a coleta não começa e um "concluir" perdido não troca nada.
    expect(cal.concluirRecoletaDeAlvos().motivo).toBe('sem_rodada');

    // A suspensão continua (só a Emergência e a recuperação), o modelo é o mesmo
    // e o disco tem o mesmo perfil, com a chave da tela cheia, byte a byte.
    expect(cal.getSuspensaoDaCalibracao()).not.toBeNull();
    expect(discoBruto()).toBe(discoAntes);
    largura = W;
    expect(sonda()).toEqual(antes);

    // A janela volta: a suspensão sai sozinha, a recoleta volta a ser possível e
    // a próxima abertura em tela cheia carrega o perfil.
    expect(cal.checarMudancaDeViewport(largura, H)).toBe(false);
    expect(cal.getSuspensaoDaCalibracao()).toBeNull();
    expect(cal.podeRecoletarAlvos()).toBe(true);
    expect(cal.loadProfile()).toBe(true);
    expect(cal.isCalibrated()).toBe(true);
    expect(cal.chaveDoContextoAtual()).toBe(chaveCheia);
  });
});
