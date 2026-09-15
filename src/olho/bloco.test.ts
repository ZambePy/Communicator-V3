import { describe, expect, it } from 'vitest';
import { activeFeatureDims, featureVectorId, l2csSlotsInSet, projectFeatureSet, setUsaRamoOcular } from '../extractor';
import { BLOCO_OCULAR_DIM, CONFIANCA_MIN_OCULAR, buildBlocoOcular, type SaidaDoRamoOcular } from './bloco';
import { ramoOcularNulo } from './ramoOcular';
import { extractFeatures } from '../featurePipeline';
import type { Point3D } from '../extractor';

const boa: SaidaDoRamoOcular = { yaw: 0.2, pitch: -0.1, confianca: 0.8, valid: true, timestamp: 1 };

describe('buildBlocoOcular', () => {
  it('leitura válida vira tangentes dos dois ângulos', () => {
    const b = buildBlocoOcular(boa);
    expect(b.motivo).toBeNull();
    expect(b.valores).toHaveLength(BLOCO_OCULAR_DIM);
    expect(b.valores[0]).toBeCloseTo(Math.tan(0.2), 12);
    expect(b.valores[1]).toBeCloseTo(Math.tan(-0.1), 12);
  });

  it('zera com motivo: ausente/obsoleta, implausível, confiança baixa', () => {
    expect(buildBlocoOcular(null)).toEqual({ valores: [0, 0], motivo: 'stale' });
    expect(buildBlocoOcular({ ...boa, valid: false }).motivo).toBe('stale');
    expect(buildBlocoOcular({ ...boa, yaw: 1.2 }).motivo).toBe('implausivel');
    expect(buildBlocoOcular({ ...boa, confianca: CONFIANCA_MIN_OCULAR - 0.01 }).motivo).toBe('confianca');
    expect(buildBlocoOcular({ ...boa, confianca: NaN }).motivo).toBe('confianca');
  });

  it('nunca devolve valor não finito', () => {
    // 0,6 rad passa no plausível (< 0,61) e encosta no clamp de π/4 na tangente.
    const b = buildBlocoOcular({ ...boa, yaw: 0.6, pitch: -0.6 });
    expect(b.valores.every((v) => Number.isFinite(v))).toBe(true);
    expect(Math.abs(b.valores[0])).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("conjuntos com ramo ocular", () => {
  const marcado = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("'irisCore+l2cs+olho' leva íris, as duas do L2CS e as duas do olho — oito dims", () => {
    const v = projectFeatureSet(marcado(46), 'irisCore+l2cs+olho');
    expect(v).toEqual([0, 1, 2, 3, 37, 38, 44, 45]);
    expect(activeFeatureDims('irisCore+l2cs+olho')).toBe(8);
    expect(l2csSlotsInSet('irisCore+l2cs+olho')).toEqual([4, 5]);
    expect(setUsaRamoOcular('irisCore+l2cs+olho')).toBe(true);
  });

  it("'irisCore+olho' dispensa o bloco facial mas mantém os índices do ocular", () => {
    const v = projectFeatureSet(marcado(46), 'irisCore+olho');
    expect(v).toEqual([0, 1, 2, 3, 44, 45]);
    expect(l2csSlotsInSet('irisCore+olho')).toEqual([]);
    expect(setUsaRamoOcular('irisCore+olho')).toBe(true);
    expect(setUsaRamoOcular('irisCore+l2cs')).toBe(false);
  });

  it('a identidade do vetor muda, invalidando perfis salvos com outro conjunto', () => {
    expect(featureVectorId('irisCore+l2cs+olho')).toBe('irisCore+l2cs+olho:8');
    expect(featureVectorId('irisCore+l2cs+olho')).not.toBe(featureVectorId('irisCore+l2cs'));
  });

  it('vetor sem o bloco ocular lança em vez de treinar com índice fora do vetor', () => {
    expect(() => projectFeatureSet(marcado(44), 'irisCore+l2cs+olho')).toThrow();
    expect(() => projectFeatureSet(marcado(44), 'irisCore+olho')).toThrow();
  });
});

describe('ramo ocular nulo', () => {
  it('nunca aceita nem responde', async () => {
    await ramoOcularNulo.start();
    expect(ramoOcularNulo.podeSubmeter()).toBe(false);
    expect(ramoOcularNulo.submeter(new Float32Array(3 * 64 * 96), null)).toBe(false);
    expect(ramoOcularNulo.ultimas()).toEqual({ esquerdo: null, direito: null });
    expect(ramoOcularNulo.ficha()).toBeNull();
  });
});

describe('extractFeatures com ramo ocular', () => {
  function rostoSintetico(): Point3D[] {
    return Array.from({ length: 478 }, (_, i) => ({
      x: 0.5 + Math.sin(i * 0.7) * 0.02,
      y: 0.5 + Math.cos(i * 0.9) * 0.02,
      z: Math.sin(i * 0.3) * 0.01,
    }));
  }
  const gazeInvalido = { yaw: 0, pitch: 0, valid: false };

  it('anexa o bloco ocular DEPOIS do bloco facial e projeta oito dims', () => {
    const r = extractFeatures(
      rostoSintetico(), undefined, { yaw: 0.1, pitch: 0.05, valid: true, confidence: 0.9 },
      1280, 720, 'irisCore+l2cs+olho', undefined,
      { esquerdo: boa, direito: { ...boa, yaw: -0.2 } },
    );
    expect(r.featuresLeft).toHaveLength(8);
    expect(r.featuresRight).toHaveLength(8);
    // As duas últimas são as do olho, e diferem entre os lados.
    expect(r.featuresLeft[6]).toBeCloseTo(Math.tan(0.2), 9);
    expect(r.featuresRight[6]).toBeCloseTo(Math.tan(-0.2), 9);
    // As do bloco facial são iguais nos dois lados.
    expect(r.featuresLeft[4]).toBe(r.featuresRight[4]);
  });

  it("com l2cs=off, 'irisCore+olho' exige um gaze inválido para ocupar o bloco facial", () => {
    const r = extractFeatures(
      rostoSintetico(), undefined, gazeInvalido, 1280, 720, 'irisCore+olho', undefined,
      { esquerdo: boa, direito: boa },
    );
    expect(r.featuresLeft).toHaveLength(6);
    expect(r.featuresLeft[4]).toBeCloseTo(Math.tan(0.2), 9);
  });

  it('ramo ocular sem bloco facial lança — os índices não podem andar', () => {
    expect(() =>
      extractFeatures(rostoSintetico(), undefined, null, 1280, 720, 'irisCore+olho', undefined, { esquerdo: boa, direito: boa }),
    ).toThrow(/bloco L2CS/);
  });

  it('sem ramo ocular, o conjunto ocular lança em vez de projetar lixo', () => {
    expect(() =>
      extractFeatures(rostoSintetico(), undefined, gazeInvalido, 1280, 720, 'irisCore+l2cs+olho'),
    ).toThrow();
  });
});
