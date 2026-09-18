import { describe, it, expect } from 'vitest';
import { expandPolynomialFeatures, dimsDaExpansao } from './polynomial';

describe('expandPolynomialFeatures', () => {
  it('grau 2 sobre d=1: devolve [x, x²]', () => {
    expect(expandPolynomialFeatures([3])).toEqual([3, 9]);
  });

  it('grau 2 sobre d=2: devolve [x, y, x², xy, y²]', () => {
    expect(expandPolynomialFeatures([2, 3])).toEqual([2, 3, 4, 6, 9]);
  });

  it('grau 2 sobre d=3: devolve 3 + 6 = 9 features', () => {
    // [a, b, c, a², ab, ac, b², bc, c²]
    expect(expandPolynomialFeatures([1, 2, 3])).toEqual([
      1, 2, 3,          // originais
      1, 2, 3,          // a², ab, ac
      4, 6,             // b², bc
      9,                // c²
    ]);
  });

  it('não muta a entrada', () => {
    const input = [1, 2];
    const copy = [...input];
    expandPolynomialFeatures(input);
    expect(input).toEqual(copy);
  });

  it('vetor vazio devolve vetor vazio', () => {
    expect(expandPolynomialFeatures([])).toEqual([]);
  });

  it('valores NaN passam adiante sem quebrar', () => {
    // Ridge lida com NaN separadamente; polynomial não deve introduzir NaN em input finito.
    const out = expandPolynomialFeatures([NaN, 2]);
    expect(Number.isNaN(out[0])).toBe(true);
    expect(out[1]).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Expansão PARCIAL.
//
// O bloco angular já chega linearizado pela tangente (`x_tela ≈ x_olho +
// d·tan(yaw)`), então o quadrado e o cruzado dessas dimensões capturam só
// curvatura residual — e ainda ocupam colunas que nove alvos precisam
// determinar. `lineares` as deixa fora dos produtos.
// ─────────────────────────────────────────────────────────────────────────────
describe('expandPolynomialFeatures — expansão parcial', () => {
  it('sem `lineares` o resultado é IDÊNTICO ao histórico', () => {
    const x = [1, 2, 3];
    expect(expandPolynomialFeatures(x, [])).toEqual(expandPolynomialFeatures(x));
    expect(expandPolynomialFeatures(x, undefined)).toEqual(expandPolynomialFeatures(x));
  });

  it('mantém TODAS as dims no bloco linear e só corta os produtos', () => {
    // [a, b, c] com `c` linear → [a, b, c, a², ab, b²]
    const out = expandPolynomialFeatures([2, 3, 5], [2]);
    expect(out).toEqual([2, 3, 5, 4, 6, 9]);
  });

  it('o vetor de produção: 6 dims viram 16 em vez de 27', () => {
    const x = [1, 2, 3, 4, 5, 6];
    expect(expandPolynomialFeatures(x)).toHaveLength(27);
    // As duas últimas são tan(yaw)/tan(pitch) no conjunto `irisCore+l2cs`.
    expect(expandPolynomialFeatures(x, [4, 5])).toHaveLength(16);
  });

  it('a ordem das colunas é estável — os coeficientes do Ridge são posicionais', () => {
    const out = expandPolynomialFeatures([1, 2, 3, 4], [2, 3]);
    // lineares: 1,2,3,4 · produtos entre as posições 0 e 1: 1·1, 1·2, 2·2
    expect(out).toEqual([1, 2, 3, 4, 1, 2, 4]);
  });

  it('`lineares` fora de faixa ou repetido não quebra a contagem', () => {
    expect(expandPolynomialFeatures([1, 2], [5, 5, 9])).toEqual(
      expandPolynomialFeatures([1, 2]),
    );
    expect(expandPolynomialFeatures([1, 2], [0, 0])).toEqual([1, 2, 4]);
  });

  it('todas lineares: nenhum termo quadrático sobra', () => {
    expect(expandPolynomialFeatures([1, 2, 3], [0, 1, 2])).toEqual([1, 2, 3]);
  });

  it('vetor vazio continua vazio', () => {
    expect(expandPolynomialFeatures([], [0])).toEqual([]);
  });

  it('`dimsDaExpansao` concorda com o comprimento real', () => {
    expect(dimsDaExpansao(6, 0)).toBe(expandPolynomialFeatures([1, 2, 3, 4, 5, 6]).length);
    expect(dimsDaExpansao(6, 2)).toBe(
      expandPolynomialFeatures([1, 2, 3, 4, 5, 6], [4, 5]).length,
    );
    expect(dimsDaExpansao(4, 2)).toBe(expandPolynomialFeatures([1, 2, 3, 4], [2, 3]).length);
    expect(dimsDaExpansao(0)).toBe(0);
  });
});
