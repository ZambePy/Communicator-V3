// Revisão do pipeline de 19/10/2026 — o painel simples do teste de precisão
// (fim da calibração) dizia "Refazer os cantos… na próxima tela dá para
// refazer só os cantos" pela PRÓPRIA conta (`resultadoDepois: true` sempre), e
// a tela de resultado decidia por `alvosParaRecoletar()`, que é vazio com a
// M22 desligada (o bloco `?exp.recoletaDeAlvosRuins=0` do roteiro de
// medição): o painel prometia o botão e a tela seguinte dizia "Ótima" sem ele.
//
// O teste da revisão (scratchpad/revisao_pipeline/testes/
// painelPrometeCantos.test.ts), com a afirmação INVERTIDA: as duas telas dizem
// a mesma palavra, e só prometem o botão quando ele existe.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as cal from './calibration';
import { EXPERIMENT } from './config/experiment';
import { palavraDoTeste } from './accuracy';
import { lerCalibracao, palavraDaCalibracao } from '../frontend/src/pages/calibration/veredito';

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
function calibrar() {
  const rnd = gerador(7);
  const olho = (x: number, y: number) => [
    (x - 0.5) * 0.08 + rnd() * 0.0008, (y - 0.5) * 0.05 + rnd() * 0.0008,
    Math.tan((x - 0.5) * 0.9) + rnd() * 0.003, Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
  ];
  cal.clearCalibration();
  expect(cal.startCalibrationMode()).toBe(true);
  for (const t of cal.getCalibrationTargets()) {
    cal.startCollectingPoint(t.x, t.y, () => {});
    const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(t.x, t.y));
    for (let ms = 0; ms <= dur + 200; ms += 33) { relogio += 33; const f = olho(t.x, t.y); cal.feedRawData(f, [...f], QUALIDADE); }
  }
  let ok: boolean | null = null;
  cal.completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
  expect(ok).toBe(true);
}

/** O teste mediu: miolo 45 px (Bom), canto B1 a 160 px (Ruim). */
const PONTOS_DO_PAINEL = [{ isEdge: true, error: 160 }, { isEdge: true, error: 40 }, { isEdge: false, error: 45 }];
function registrarOTeste() {
  cal.registrarValidacaoDoModelo({
    erroInternoPx: 45,
    pontos: [
      { x: 0.05, y: 0.05, erroPx: 160, borda: true },
      { x: 0.95, y: 0.05, erroPx: 40, borda: true },
      { x: 0.5, y: 0.5, erroPx: 45, borda: false },
    ],
  });
}
function palavraDaTela() {
  const diag = cal.getCalibrationFitDiagnostics();
  const pontosRuins = cal.alvosParaRecoletar();
  return {
    pontosRuins,
    ...palavraDaCalibracao(lerCalibracao(diag), diag, { validacao: cal.getValidacaoDoModelo(), pontosRuins }),
  };
}

describe('painel do teste × tela de resultado', () => {
  const salvas = { p: EXPERIMENT.persistirCalibracao, r: EXPERIMENT.recoletaDeAlvosRuins };
  beforeAll(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    EXPERIMENT.persistirCalibracao = false;
    cal.setSessionGeometry(null);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = salvas.p;
    EXPERIMENT.recoletaDeAlvosRuins = salvas.r;
    cal.clearCalibration();
  });

  it('com a M22 desligada: o painel não promete a próxima tela, e a próxima diz "Refazer os cantos" sem o botão', () => {
    EXPERIMENT.recoletaDeAlvosRuins = false;
    calibrar();
    // O que a tela de calibração passa ao teste como `resultadoDepois`.
    expect(cal.podeRecoletarAlvos()).toBe(false);
    expect(palavraDoTeste({ meanErrorInner: 45 }, PONTOS_DO_PAINEL)).toBe('refazerCantos');
    registrarOTeste();
    const daTela = palavraDaTela();
    expect(daTela.pontosRuins).toEqual([]); // sem botão "Refazer só os cantos"
    expect(daTela.palavra).toBe('refazerCantos');
    // A frase não promete o que a tela não oferece.
    expect(daTela.frase).toBe('refazerCantosSemBotao');
  });

  it('com a M22 ligada: o painel promete a próxima tela, e ela tem o botão', () => {
    EXPERIMENT.recoletaDeAlvosRuins = true;
    calibrar();
    expect(cal.podeRecoletarAlvos()).toBe(true);
    registrarOTeste();
    const daTela = palavraDaTela();
    expect(daTela.pontosRuins).toHaveLength(1);
    expect(daTela.palavra).toBe('refazerCantos');
    expect(daTela.frase).toBe('refazerCantos');
  });
});
