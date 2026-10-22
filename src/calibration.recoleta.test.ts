import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  abortCalibration,
  alvosParaRecoletar,
  clearCalibration,
  completeCalibration,
  concluirRecoletaDeAlvos,
  duracaoTotalDoPonto,
  feedRawData,
  getCalibrationFitDiagnostics,
  getCalibrationTargets,
  getCollectionMsForPoint,
  getQualidadeDosAlvos,
  getResumoDoPonto,
  getSampleCount,
  getUltimaRecoleta,
  getValidacaoDoModelo,
  iniciarRecoletaDeAlvos,
  isCalibrated,
  listCalibrationProfiles,
  mapGaze,
  podeRecoletarAlvos,
  recoletaEmAndamento,
  registrarValidacaoDoModelo,
  setSessionGeometry,
  startCalibrationMode,
  startCollectingPoint,
  switchActiveProfile,
} from './calibration';
import { EXPERIMENT } from './config/experiment';
import { ouvirTrabalhoLongo } from './trabalhoLongo';

// Recoleta dos alvos ruins (item 7, pedido de 19/10/2026), pelo núcleo REAL:
// coleta por `feedRawData`, treino com scaler, λ por validação cruzada, Huber
// e correção dos cantos, exatamente como o app.
//
// O olho sintético é LISO (sem a saturação da pálpebra embaixo): numa sessão
// boa, nenhum alvo deve ser marcado. O alvo "mal coletado" é um canto em que a
// pessoa, em vez de olhar para ele, ficou olhando para (30 %, 30 %) — o olhar
// que chegou atrasado e não foi até o canto.

const W = 1920;
const H = 1080;
let relogio = 0;

type Olho = (x: number, y: number) => number[];

function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}

function olhoCom(rnd: () => number): Olho {
  return (x, y) => [
    (x - 0.5) * 0.08 + rnd() * 0.0008,
    (y - 0.5) * 0.05 + rnd() * 0.0008,
    Math.tan((x - 0.5) * 0.9) + rnd() * 0.003,
    Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
  ];
}
const semRuido: Olho = olhoCom(() => 0);

const QUALIDADE = {
  yaw: 0, pitch: 0, roll: 0,
  irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0,
};

const CANTO = { x: 0.05, y: 0.05 };
const mesmoAlvo = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

/** Coleta um alvo com a pessoa olhando para `olhar` (o próprio alvo, se omitido). */
function coletar(alvo: { x: number; y: number }, olho: Olho, olhar = alvo): void {
  startCollectingPoint(alvo.x, alvo.y, () => {});
  const dur = duracaoTotalDoPonto(getCollectionMsForPoint(alvo.x, alvo.y));
  for (let ms = 0; ms <= dur + 200; ms += 33) {
    relogio += 33;
    feedRawData(olho(olhar.x, olhar.y), olho(olhar.x, olhar.y), QUALIDADE);
  }
}

/**
 * Calibração de 13 pontos. `cantoRuim` faz o canto superior esquerdo ser
 * coletado com o olhar em (30 %, 30 %). Devolve quantas amostras aquele canto
 * deixou no perfil.
 */
function calibrar(opcoes: { cantoRuim?: boolean; semente?: number } = {}): { amostrasDoCanto: number } {
  const olho = olhoCom(gerador(opcoes.semente ?? 7));
  clearCalibration();
  expect(startCalibrationMode()).toBe(true);
  let amostrasDoCanto = 0;
  for (const t of getCalibrationTargets()) {
    const ehCanto = mesmoAlvo(t, CANTO);
    coletar(t, olho, ehCanto && opcoes.cantoRuim ? { x: 0.3, y: 0.3 } : t);
    if (ehCanto) amostrasDoCanto = getResumoDoPonto().aceitos;
  }
  let ok: boolean | null = null;
  completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
  expect(ok).toBe(true);
  return { amostrasDoCanto };
}

/** Onde o modelo põe o olhar numa grade de pontos de prova (px), sem ruído. */
function sonda(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const y of [0.05, 0.3, 0.5, 0.7, 0.95]) {
    for (const x of [0.05, 0.3, 0.5, 0.7, 0.95]) {
      const p = mapGaze(semRuido(x, y), semRuido(x, y));
      expect(p).not.toBeNull();
      out.push(p!);
    }
  }
  return out;
}

const erroNoPontoPx = (x: number, y: number) => {
  const p = mapGaze(semRuido(x, y), semRuido(x, y))!;
  return Math.hypot(p.x - x * W, p.y - y * H);
};

describe('recoleta dos alvos ruins (M22)', () => {
  const salvas = {
    persistir: EXPERIMENT.persistirCalibracao,
    recoleta: EXPERIMENT.recoletaDeAlvosRuins,
  };

  beforeAll(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    EXPERIMENT.persistirCalibracao = false;
    setSessionGeometry(null);
  });
  beforeEach(() => {
    EXPERIMENT.recoletaDeAlvosRuins = true;
  });
  afterEach(() => {
    EXPERIMENT.recoletaDeAlvosRuins = salvas.recoleta;
  });
  afterAll(() => {
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = salvas.persistir;
    clearCalibration();
  });

  it('tudo bom: nenhum alvo a refazer, e a saída é idêntica com a flag ligada ou desligada', () => {
    calibrar();
    expect(podeRecoletarAlvos()).toBe(true);
    expect(alvosParaRecoletar()).toEqual([]);
    const q = getQualidadeDosAlvos();
    expect(q).toHaveLength(13);
    expect(q!.every((a) => a.motivos.length === 0)).toBe(true);
    // A dispersão por alvo vai para o diagnóstico (e daí para o relatório).
    expect(getCalibrationFitDiagnostics()!.looByTarget.every((t) => Number.isFinite(t.dispersaoPx))).toBe(true);
    const ligada = sonda();

    EXPERIMENT.recoletaDeAlvosRuins = false;
    calibrar();
    expect(alvosParaRecoletar()).toEqual([]);
    expect(sonda()).toEqual(ligada);
  });

  it('borda ruim: o canto mal coletado é refeito, as amostras são TROCADAS e o canto melhora', () => {
    const { amostrasDoCanto } = calibrar({ cantoRuim: true });
    const erroAntes = erroNoPontoPx(CANTO.x, CANTO.y);
    const perfisAntes = listCalibrationProfiles().length;

    const alvos = alvosParaRecoletar();
    const canto = alvos.find((a) => mesmoAlvo(a, CANTO));
    expect(canto).toBeDefined();
    expect(canto!.borda).toBe(true);
    expect(canto!.motivos).toContain('erro');
    // O pior é ele.
    expect(mesmoAlvo(alvos[0], CANTO)).toBe(true);

    const amostrasAntes = getSampleCount();
    const abertos = iniciarRecoletaDeAlvos(alvos, { automatica: true });
    expect(abertos).toHaveLength(alvos.length);
    expect(recoletaEmAndamento()).toBe(true);
    // O modelo de antes continua em uso durante a rodada.
    expect(isCalibrated()).toBe(true);

    const olho = olhoCom(gerador(11));
    const novasPorAlvo: number[] = [];
    for (const a of abertos) {
      coletar(a, olho);
      novasPorAlvo.push(getResumoDoPonto().aceitos);
    }
    const novas = novasPorAlvo.reduce((s, n) => s + n, 0);
    expect(getSampleCount()).toBe(amostrasAntes + novas);

    const r = concluirRecoletaDeAlvos();
    expect(r.aceito).toBe(true);
    expect(r.automatica).toBe(true);
    expect(r.looDepoisPx).toBeLessThan(r.looAntesPx);
    const doCanto = r.alvos.find((a) => mesmoAlvo(a, CANTO))!;
    expect(doCanto.substituido).toBe(true);
    expect(doCanto.depois!.erroLotoPx).toBeLessThan(doCanto.antes!.erroLotoPx * 0.5);

    // SUBSTITUIR, não somar: só o canto foi refeito aqui? Então o perfil perdeu
    // exatamente as amostras antigas dele e ganhou as novas.
    if (abertos.length === 1) {
      expect(getSampleCount()).toBe(amostrasAntes - amostrasDoCanto + novas);
    } else {
      expect(getSampleCount()).toBeLessThan(amostrasAntes + novas);
    }
    // O canto de verdade melhorou na saída do `mapGaze`.
    expect(erroNoPontoPx(CANTO.x, CANTO.y)).toBeLessThan(erroAntes * 0.5);
    // Gravado como o MESMO perfil — nada de perfil fantasma por recoleta.
    expect(listCalibrationProfiles().length).toBe(perfisAntes);
    // O antes e o depois vão para o relatório da calibração.
    expect(getCalibrationFitDiagnostics()!.recoleta).toEqual(getUltimaRecoleta());
    expect(recoletaEmAndamento()).toBe(false);
  });

  it('a trava: se o LOTO piora, volta o modelo de antes — a saída é a mesma, bit a bit', () => {
    calibrar();
    const antes = sonda();
    const looAntes = getCalibrationFitDiagnostics()!.looErrorPx;
    const amostras = getSampleCount();

    // Recoleta forçada de um canto bom, e a pessoa olhando para o CENTRO.
    expect(iniciarRecoletaDeAlvos([CANTO])).toHaveLength(1);
    coletar(CANTO, olhoCom(gerador(3)), { x: 0.5, y: 0.5 });
    const r = concluirRecoletaDeAlvos();

    expect(r.aceito).toBe(false);
    expect(r.motivo).toBe('piorou');
    expect(r.looDepoisPx).toBeGreaterThan(r.looAntesPx);
    expect(sonda()).toEqual(antes);
    expect(getSampleCount()).toBe(amostras);
    const d = getCalibrationFitDiagnostics()!;
    expect(d.looErrorPx).toBe(looAntes);
    expect(d.recoleta?.aceito).toBe(false);
    // E dá para tentar de novo.
    expect(podeRecoletarAlvos()).toBe(true);
  });

  it('recoleta que não rendeu amostras: o alvo fica com as antigas e nada muda', () => {
    calibrar();
    const antes = sonda();
    const amostras = getSampleCount();
    iniciarRecoletaDeAlvos([CANTO]);
    // O rosto sumiu: nenhum quadro chega.
    const r = concluirRecoletaDeAlvos();
    expect(r.aceito).toBe(false);
    expect(r.motivo).toBe('sem_amostras');
    expect(r.alvos[0].substituido).toBe(false);
    expect(sonda()).toEqual(antes);
    expect(getSampleCount()).toBe(amostras);
  });

  it('cancelar no meio da recoleta descarta as amostras novas e mantém o modelo', () => {
    calibrar();
    const antes = sonda();
    const amostras = getSampleCount();
    iniciarRecoletaDeAlvos([CANTO]);
    startCollectingPoint(CANTO.x, CANTO.y, () => {});
    for (let i = 0; i < 40; i++) {
      relogio += 33;
      feedRawData(semRuido(0.5, 0.5), semRuido(0.5, 0.5), QUALIDADE);
    }
    abortCalibration();
    expect(recoletaEmAndamento()).toBe(false);
    expect(isCalibrated()).toBe(true);
    expect(getSampleCount()).toBe(amostras);
    expect(sonda()).toEqual(antes);
  });

  // Revisão de segurança de 19/10/2026: o treino (e o retreino da recoleta)
  // avisa antes de travar a thread, para o vigia de página travada desarmar.
  it('o treino da calibração e o retreino da recoleta avisam o trabalho longo antes de começar', () => {
    const avisos = vi.fn();
    const parar = ouvirTrabalhoLongo(avisos);
    try {
      calibrar({ cantoRuim: true });
      expect(avisos).toHaveBeenCalledTimes(1);
      const abertos = iniciarRecoletaDeAlvos(alvosParaRecoletar(), { automatica: true });
      expect(abertos.length).toBeGreaterThan(0);
      const olho = olhoCom(gerador(11));
      for (const a of abertos) coletar(a, olho);
      concluirRecoletaDeAlvos();
      expect(avisos).toHaveBeenCalledTimes(2);
    } finally {
      parar();
    }
  });

  it('com a flag desligada, nada é proposto nem aberto', () => {
    calibrar({ cantoRuim: true });
    EXPERIMENT.recoletaDeAlvosRuins = false;
    expect(podeRecoletarAlvos()).toBe(false);
    expect(alvosParaRecoletar()).toEqual([]);
    expect(iniciarRecoletaDeAlvos([CANTO])).toEqual([]);
  });

  it('só recoleta sobre as amostras do modelo EM USO: trocou de perfil, não oferece', () => {
    calibrar({ cantoRuim: true });
    expect(podeRecoletarAlvos()).toBe(true);
    const id = listCalibrationProfiles()[0].meta.id;
    expect(switchActiveProfile(id)).not.toBeNull();
    expect(podeRecoletarAlvos()).toBe(false);
    expect(alvosParaRecoletar()).toEqual([]);
  });

  it('não recoleta alvo que não está no perfil (completar a grade é outra coisa)', () => {
    calibrar();
    expect(iniciarRecoletaDeAlvos([{ x: 0.42, y: 0.42 }])).toEqual([]);
    expect(recoletaEmAndamento()).toBe(false);
  });

  it('com o teste de precisão medido contra o modelo, quem diz que um canto ficou ruim é o teste', () => {
    calibrar();
    expect(alvosParaRecoletar()).toEqual([]);
    registrarValidacaoDoModelo({
      erroInternoPx: 45,
      pontos: [
        { x: 0.05, y: 0.05, erroPx: 160, borda: true },
        { x: 0.95, y: 0.05, erroPx: 40, borda: true },
        { x: 0.5, y: 0.5, erroPx: 300, borda: false },
      ],
    });
    expect(getValidacaoDoModelo()).toEqual({ erroInternoPx: 45, cantosRuins: [{ x: 0.05, y: 0.05 }] });
    const alvos = alvosParaRecoletar();
    expect(alvos).toHaveLength(1);
    expect(mesmoAlvo(alvos[0], CANTO)).toBe(true);
    expect(alvos[0].motivos).toEqual(['cantoNoTeste']);
    // Um treino novo troca o modelo: a medida do teste deixa de valer.
    calibrar();
    expect(getValidacaoDoModelo()).toBeNull();
  });
});
