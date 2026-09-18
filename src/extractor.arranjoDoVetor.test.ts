import { describe, it, expect } from 'vitest';
import {
  FEATURE_SET_MIN_LENGTH_FOR_TEST,
  activeFeatureDims,
  featureVectorId,
  l2csSlotsInSet,
  projectFeatureSet,
  slotsAngularesNoConjunto,
} from './extractor';

/**
 * Arranjo do vetor que entra no Ridge.
 *
 * Duas alavancas, o mesmo objetivo: reduzir quantas colunas nove alvos
 * distintos precisam determinar.
 *
 *  - `dimsDaIris` corta a colinearidade na ENTRADA. `offsetX` e `relX` diferem
 *    por um divisor (a largura do olho) que varia pouco entre quadros —
 *    correlação medida de 0,9996 com ±5 % de variação. Levar os quatro gasta
 *    duas dimensões num sinal só.
 *  - `formaDaExpansao` corta os termos quadráticos do bloco angular, que já
 *    chega linearizado pela tangente.
 *
 * Os dois mudam o que o modelo vê, então os dois têm de invalidar perfis —
 * `dimsDaIris` pelo `FEATURE_VECTOR_ID`, a expansão pela chave de contexto
 * (coberta em `calibration.contextKey.test.ts`).
 */

/** Vetor completo com cada posição marcada pelo próprio índice. */
function marcado(n = 46): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

describe('conjuntos que cortam a colinearidade da íris', () => {
  it('`irisRel+l2cs` leva só as normalizadas e o par angular', () => {
    expect(projectFeatureSet(marcado(), 'irisRel+l2cs')).toEqual([2, 3, 37, 38]);
    expect(activeFeatureDims('irisRel+l2cs')).toBe(4);
  });

  it('`irisAbs+l2cs` leva só as absolutas e o par angular', () => {
    expect(projectFeatureSet(marcado(), 'irisAbs+l2cs')).toEqual([0, 1, 37, 38]);
    expect(activeFeatureDims('irisAbs+l2cs')).toBe(4);
  });

  it('as versões sem L2CS existem, para `l2cs=off`', () => {
    expect(projectFeatureSet(marcado(), 'irisRel')).toEqual([2, 3]);
    expect(projectFeatureSet(marcado(), 'irisAbs')).toEqual([0, 1]);
  });

  it('cada conjunto tem identidade PRÓPRIA — é o que invalida o perfil salvo', () => {
    const ids = [
      featureVectorId('irisCore+l2cs'),
      featureVectorId('irisRel+l2cs'),
      featureVectorId('irisAbs+l2cs'),
    ];
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('irisCore+l2cs:6');
    expect(ids[1]).toBe('irisRel+l2cs:4');
  });

  it('vetor curto demais LANÇA, como nos conjuntos antigos', () => {
    // 39 é o mínimo: o bloco angular começa em 37.
    expect(() => projectFeatureSet(marcado(20), 'irisRel+l2cs')).toThrow(RangeError);
    expect(projectFeatureSet(marcado(39), 'irisRel+l2cs')).toEqual([2, 3, 37, 38]);
  });

  it('quadro sem rosto continua devolvendo vazio', () => {
    expect(projectFeatureSet([], 'irisRel+l2cs')).toEqual([]);
  });
});

describe('slots angulares — o que a expansão parcial deixa linear', () => {
  it('no vetor de produção são as duas últimas posições', () => {
    expect(slotsAngularesNoConjunto('irisCore+l2cs')).toEqual([4, 5]);
  });

  it('nos conjuntos enxutos são as duas últimas de quatro', () => {
    expect(slotsAngularesNoConjunto('irisRel+l2cs')).toEqual([2, 3]);
    expect(slotsAngularesNoConjunto('irisAbs+l2cs')).toEqual([2, 3]);
  });

  it('sem bloco angular a lista é vazia — e aí `parcial` não tem o que poupar', () => {
    expect(slotsAngularesNoConjunto('irisCore')).toEqual([]);
    expect(slotsAngularesNoConjunto('irisRel')).toEqual([]);
  });

  it('inclui o ramo OCULAR, não só o L2CS: os dois já vêm em tangente', () => {
    // `l2csSlotsInSet` cobre só o bloco facial; a expansão parcial precisa dos dois.
    expect(l2csSlotsInSet('irisCore+l2cs+olho')).toEqual([4, 5]);
    expect(slotsAngularesNoConjunto('irisCore+l2cs+olho')).toEqual([4, 5, 6, 7]);
    expect(slotsAngularesNoConjunto('irisCore+olho')).toEqual([4, 5]);
  });

  it('o bloco L2CS completo entra inteiro', () => {
    expect(slotsAngularesNoConjunto('irisCore+l2csFull')).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('todo conjunto declara um mínimo', () => {
  it('nenhum conjunto fica sem comprimento mínimo', () => {
    for (const [set, min] of Object.entries(FEATURE_SET_MIN_LENGTH_FOR_TEST)) {
      expect(min, `conjunto '${set}'`).toBeGreaterThan(0);
      // O mínimo tem de cobrir o maior índice que o conjunto lê.
      expect(() => projectFeatureSet(marcado(min), set as never)).not.toThrow();
    }
  });
});
