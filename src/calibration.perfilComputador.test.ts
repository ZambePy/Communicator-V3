import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  alvosDeCalibracao,
  computeCalibrationTargets,
  buildContextKeyFrom,
  getCollectionMsForPoint,
  excentricidadeDoAlvoDeg,
  startCalibrationMode,
  abortCalibration,
  clearCalibration,
  getCalibrationTargets,
  getPerfilDeCalibracao,
  setPerfilDeCalibracao,
  setModoDeClamp,
  getModoDeClamp,
  setContraluzAtual,
  getRecusaDeCalibracao,
  completeCalibration,
  INSET_COMPUTADOR,
  INSET_CANTOS_PADRAO,
  JOELHO_HIPOMETRIA_DEG,
  type CalibrationGeometry,
} from './calibration';

// Geometria de referência: 1920×1080, 23,6" a 60 cm.
const G: CalibrationGeometry = {
  screenWidthPx: 1920, screenHeightPx: 1080, screenDiagonalIn: 23.6, viewingDistanceCm: 60,
};

describe('alvosDeCalibracao — perfil computador', () => {
  it('13 alvos: 3×3 com inset de 2 % + 4 intermediários nas diagonais', () => {
    const alvos = alvosDeCalibracao(G, { perfil: 'computador' });
    expect(alvos).toHaveLength(13);
    const lo = INSET_COMPUTADOR;
    const hi = 1 - INSET_COMPUTADOR;
    // Os quatro cantos e as quatro bordas estão a 2 % da borda — não dentro do
    // orçamento de excentricidade, que é o que deixava o cursor "não chegar".
    for (const c of [[lo, lo], [hi, lo], [lo, hi], [hi, hi], [0.5, lo], [0.5, hi], [lo, 0.5], [hi, 0.5]]) {
      expect(alvos.some((a) => a.x === c[0] && a.y === c[1])).toBe(true);
    }
    expect(alvos.some((a) => a.x === 0.5 && a.y === 0.5)).toBe(true);
    // Intermediários a meio caminho do centro para cada canto.
    for (const c of [[lo, lo], [hi, lo], [lo, hi], [hi, hi]]) {
      const m = { x: (0.5 + c[0]) / 2, y: (0.5 + c[1]) / 2 };
      expect(alvos.some((a) => Math.abs(a.x - m.x) < 1e-12 && Math.abs(a.y - m.y) < 1e-12)).toBe(true);
    }
  });

  it('quick no perfil computador são os 4 cantos com inset', () => {
    const alvos = alvosDeCalibracao(G, { perfil: 'computador', quick: true });
    expect(alvos).toHaveLength(4);
    expect(alvos.every((a) => (a.x === INSET_COMPUTADOR || a.x === 1 - INSET_COMPUTADOR)
      && (a.y === INSET_COMPUTADOR || a.y === 1 - INSET_COMPUTADOR))).toBe(true);
  });

  it('perfil padrão (ou ausente): a grade de sempre, dentro do orçamento, + os 4 cantos da tela', () => {
    const lo = INSET_CANTOS_PADRAO;
    const hi = 1 - INSET_CANTOS_PADRAO;
    expect(alvosDeCalibracao(G)).toEqual([
      ...computeCalibrationTargets(G, false),
      { x: lo, y: lo }, { x: hi, y: lo },
      { x: lo, y: hi }, { x: hi, y: hi },
    ]);
    // O modo rápido continua sendo só os 4 cantos DA GRADE.
    expect(alvosDeCalibracao(G, { perfil: 'padrao', quick: true })).toEqual(computeCalibrationTargets(G, true));
    // A grade interna continua dentro do orçamento: os alvos horizontais dela
    // ficam bem longe da borda (≈17 %/83 %); só os cantos vão a 5 %/95 %.
    expect(Math.min(...computeCalibrationTargets(G, false).map((a) => a.x))).toBeGreaterThan(0.1);
    expect(alvosDeCalibracao(G)).toHaveLength(13);
  });
});

describe('amostragem mais longa nos 4 cantos (joelho de hipometria)', () => {
  it('o canto do monitor está além do joelho e ganha tempo extra; a borda e a diagonal não', () => {
    const lo = INSET_COMPUTADOR;
    const hi = 1 - INSET_COMPUTADOR;
    expect(excentricidadeDoAlvoDeg(lo, lo, G)).toBeGreaterThan(JOELHO_HIPOMETRIA_DEG);
    const cantoPadrao = getCollectionMsForPoint(lo, lo, 'padrao', G);
    const cantoComputador = getCollectionMsForPoint(lo, lo, 'computador', G);
    expect(cantoComputador).toBeGreaterThan(cantoPadrao);
    // Os quatro cantos recebem o mesmo tratamento.
    expect(getCollectionMsForPoint(hi, hi, 'computador', G)).toBe(cantoComputador);
    expect(getCollectionMsForPoint(hi, lo, 'computador', G)).toBe(cantoComputador);
    // Meio de borda e intermediário da diagonal: igual ao padrão.
    expect(getCollectionMsForPoint(0.5, lo, 'computador', G)).toBe(getCollectionMsForPoint(0.5, lo, 'padrao', G));
    expect(getCollectionMsForPoint(0.26, 0.26, 'computador', G)).toBe(getCollectionMsForPoint(0.26, 0.26, 'padrao', G));
  });

  it('o extra é proporcional a quanto o canto passa do joelho, com teto', () => {
    const lo = INSET_COMPUTADOR;
    const base = getCollectionMsForPoint(lo, lo, 'padrao', G);
    // 23,6" a 60 cm: canto a ~26° → bem mais que 2× o joelho → extra cheio (1120 ms).
    expect(getCollectionMsForPoint(lo, lo, 'computador', G) - base).toBe(1120);
    // Tela pequena e longe: canto abaixo do joelho → nenhum extra.
    const pequena: CalibrationGeometry = { screenWidthPx: 1366, screenHeightPx: 768, screenDiagonalIn: 11, viewingDistanceCm: 80 };
    expect(excentricidadeDoAlvoDeg(lo, lo, pequena)).toBeLessThan(JOELHO_HIPOMETRIA_DEG);
    expect(getCollectionMsForPoint(lo, lo, 'computador', pequena)).toBe(getCollectionMsForPoint(lo, lo, 'padrao', pequena));
  });
});

describe('a chave do perfil salvo separa app e Computador', () => {
  const base = {
    viewportW: 1920, viewportH: 1080, featureVectorId: 'fv', formatVersion: 3,
    polynomialFeatures: true, geometricPoseCompensation: true, expandFactor: 1.4, l2csInputSize: 448,
  };

  it('`padrao` não muda a chave (perfis já salvos continuam válidos); `computador` muda', () => {
    const semPerfil = buildContextKeyFrom(base);
    expect(buildContextKeyFrom({ ...base, perfil: 'padrao' })).toBe(semPerfil);
    const comp = buildContextKeyFrom({ ...base, perfil: 'computador' });
    expect(comp).not.toBe(semPerfil);
    expect(comp.endsWith('_computador')).toBe(true);
  });
});

describe('sessão de calibração com perfil', () => {
  beforeEach(() => {
    clearCalibration();
    setContraluzAtual(null);
  });
  afterEach(() => {
    abortCalibration();
    setPerfilDeCalibracao('padrao');
  });

  it('startCalibrationMode({perfil}) define os 13 alvos e o perfil ativo', () => {
    expect(startCalibrationMode({ perfil: 'computador' })).toBe(true);
    expect(getPerfilDeCalibracao()).toBe('computador');
    expect(getCalibrationTargets()).toHaveLength(13);
    abortCalibration();
    expect(startCalibrationMode({ perfil: 'padrao' })).toBe(true);
    expect(getCalibrationTargets()).toHaveLength(13);
  });

  it('setPerfilDeCalibracao troca o perfil e procura o modelo daquele perfil', () => {
    expect(setPerfilDeCalibracao('computador')).toBe(false); // nada salvo para ele
    expect(getPerfilDeCalibracao()).toBe('computador');
  });
});

describe('modo de clamp', () => {
  afterEach(() => setModoDeClamp('suave'));

  it('nasce suave; duro com margem limitada a 0–4 px', () => {
    expect(getModoDeClamp()).toEqual({ modo: 'suave', margemPx: 0 });
    setModoDeClamp('duro', 2);
    expect(getModoDeClamp()).toEqual({ modo: 'duro', margemPx: 2 });
    setModoDeClamp('duro', 30);
    expect(getModoDeClamp().margemPx).toBe(4);
    setModoDeClamp('duro', NaN);
    expect(getModoDeClamp().margemPx).toBe(0);
  });
});

describe('contraluz forte: a calibração não começa nem grava', () => {
  beforeEach(() => clearCalibration());
  afterEach(() => {
    setContraluzAtual(null);
    abortCalibration();
  });

  it('startCalibrationMode recusa por estado, sem lançar', () => {
    setContraluzAtual('forte');
    expect(startCalibrationMode()).toBe(false);
    const r = getRecusaDeCalibracao();
    expect(r?.motivo).toBe('contraluz_forte');
    expect(r?.mensagem).toMatch(/luz forte atrás/i);
    // A luz melhorou: começa, e a recusa some.
    setContraluzAtual('atencao');
    expect(startCalibrationMode()).toBe(true);
    expect(getRecusaDeCalibracao()).toBeNull();
  });

  it('completeCalibration sob contraluz forte devolve `contraluz_forte` e não grava perfil', () => {
    setContraluzAtual('ok');
    expect(startCalibrationMode()).toBe(true);
    setContraluzAtual('forte');
    let outcome: { ok: boolean; reason?: string } | null = null;
    completeCalibration((o) => { outcome = o; });
    expect(outcome).not.toBeNull();
    expect(outcome!.ok).toBe(false);
    expect(outcome!.reason).toBe('contraluz_forte');
    expect(getRecusaDeCalibracao()?.motivo).toBe('contraluz_forte');
  });
});
