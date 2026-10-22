import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  chaveDoContextoAtual, clearCalibration, haCalibracaoNoDisco, isCalibrated, loadProfile, mapGaze,
  getUltimaPredicaoSemCorrecao, PROFILES_STORAGE_KEY,
  startCalibrationMode, startCollectingPoint, feedRawData, completeCalibration,
} from './calibration';
import { EXPERIMENT } from './config/experiment';
import type { StoredCalibrationProfile } from './calibrationProfiles';

// Predição não finita virava "olhar no centro da tela" (relato de 19/10/2026,
// falhas silenciosas #12): o clamp devolve 0,5 para NaN, e um perfil salvo com
// um `null` no lugar de um desvio (NaN gravado em JSON) fazia isso em TODA
// predição, com o estado em `tracking` e o dwell podendo acionar o botão do
// centro.

function perfil(over: Partial<StoredCalibrationProfile> = {}): StoredCalibrationProfile {
  const modelo = {
    betaX: [0, 1], betaY: [0, 1], numFeatures: 1,
    lambda: 1, lambdaX: 1, lambdaY: 1, nearSingularCols: [] as number[], penalty: 'isotropic' as const,
  };
  return {
    meta: { id: 'p1', label: 'p1', createdAt: new Date(Date.now() - 60_000).toISOString(), opticalCondition: 'sem_oculos' },
    contextKey: chaveDoContextoAtual(),
    schemaVersion: 2,
    modelLeft: modelo,
    modelRight: { ...modelo },
    scalerParamsLeft: { means: [0], stds: [1] },
    scalerParamsRight: { means: [0], stds: [1] },
    reference: {
      pose: null, center: null, cameraDistanceCm: null, screenDistanceCm: null, refDistance: null, eyeReliability: null,
    },
    ...over,
  };
}

const gravar = (v: unknown) => localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(v));

describe('perfil salvo com números inválidos é "malformado"', () => {
  beforeEach(() => {
    localStorage.clear();
    clearCalibration();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearCalibration();
  });

  it('o perfil válido continua carregando (controle)', () => {
    gravar([perfil()]);
    expect(haCalibracaoNoDisco()).toBe(true);
    expect(loadProfile()).toBe(true);
  });

  const casos: Array<[string, Partial<StoredCalibrationProfile>]> = [
    // NaN gravado em JSON volta como `null`: é o caso real.
    ['desvio `null` (NaN no JSON)', { scalerParamsLeft: { means: [0], stds: [null as unknown as number] } }],
    ['média `null`', { scalerParamsRight: { means: [null as unknown as number], stds: [1] } }],
    ['desvio zero (dividiria por zero)', { scalerParamsLeft: { means: [0], stds: [0] } }],
    ['médias de comprimento errado', { scalerParamsLeft: { means: [0, 0], stds: [1, 1] } }],
    ['peso `null` no modelo', {
      modelLeft: { betaX: [0, null as unknown as number], betaY: [0, 1], numFeatures: 1, lambda: 1, nearSingularCols: [] },
    }],
    ['pesos sem o intercepto', {
      modelRight: { betaX: [1], betaY: [1], numFeatures: 1, lambda: 1, nearSingularCols: [] },
    }],
  ];
  for (const [nome, over] of casos) {
    it(`${nome}: não carrega, e a abertura não diz que há calibração`, () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      gravar([perfil(over)]);
      expect(haCalibracaoNoDisco()).toBe(false);
      expect(loadProfile()).toBe(false);
      expect(isCalibrated()).toBe(false);
      expect(aviso.mock.calls.some((c) => String(c[0]).includes('malformado'))).toBe(true);
    });
  }

  it('um perfil ruim não esconde um bom mais antigo', () => {
    const bom = perfil({ meta: { id: 'bom', label: 'bom', createdAt: new Date(Date.now() - 3_600_000).toISOString(), opticalCondition: 'sem_oculos' } });
    const ruim = perfil({ scalerParamsLeft: { means: [0], stds: [null as unknown as number] } });
    gravar([ruim, bom]);
    expect(loadProfile()).toBe(true);
  });
});

describe('mapGaze com predição não finita devolve null, não o centro', () => {
  function prng(seed: number): () => number {
    let a = seed;
    return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff - 0.5; };
  }
  const v = (x: number, y: number, d: number) => Math.sin(d * 1.7 + 0.3) * x + Math.cos(d * 2.3 + 1.1) * y;
  const w = (x: number, y: number, d: number) => Math.cos(d * 1.3 + 0.7) * x + Math.sin(d * 1.9 + 0.2) * y;

  function calibrar8(): void {
    const alvos = [0.2, 0.5, 0.8].flatMap((y) => [0.2, 0.5, 0.8].map((x) => ({ x, y })));
    const rnd = prng(42);
    let relogio = 0;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => (relogio += 80));
    startCalibrationMode();
    for (const t of alvos) {
      startCollectingPoint(t.x, t.y, () => {});
      for (let i = 0; i < 40; i++) {
        feedRawData(
          Array.from({ length: 8 }, (_, d) => v(t.x, t.y, d) + rnd() * 0.01),
          Array.from({ length: 8 }, (_, d) => w(t.x, t.y, d) + rnd() * 0.01),
          null,
        );
      }
    }
    completeCalibration();
    spy.mockRestore();
  }

  beforeEach(() => {
    localStorage.clear();
    clearCalibration();
    (EXPERIMENT as { polynomialFeatures: boolean }).polynomialFeatures = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    (EXPERIMENT as { polynomialFeatures: boolean }).polynomialFeatures = true;
    clearCalibration();
    localStorage.clear();
  });

  it('feature não finita: null (o engine liga o timer de degradação), sem sujar o estado', () => {
    calibrar8();
    expect(isCalibrated()).toBe(true);
    const fl = Array.from({ length: 8 }, (_, d) => v(0.3, 0.6, d));
    const fr = Array.from({ length: 8 }, (_, d) => w(0.3, 0.6, d));
    const boa = mapGaze(fl, fr);
    expect(boa).not.toBeNull();
    expect(Number.isFinite(boa!.x) && Number.isFinite(boa!.y)).toBe(true);
    const anterior = getUltimaPredicaoSemCorrecao();

    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const comNaN = fl.slice();
    comNaN[2] = Number.NaN;
    for (let i = 0; i < 30; i++) expect(mapGaze(comNaN, fr)).toBeNull();
    // O estado não guarda o NaN — a predição de antes continua a última.
    expect(getUltimaPredicaoSemCorrecao()).toEqual(anterior);
    // Um aviso, não trinta (limite de frequência).
    expect(erro.mock.calls.filter((c) => String(c[0]).includes('predição não finita'))).toHaveLength(1);
    // E a calibração continua lá: o quadro ruim não invalida o modelo.
    expect(isCalibrated()).toBe(true);
    expect(mapGaze(fl, fr)).toEqual(boa);
  });
});
