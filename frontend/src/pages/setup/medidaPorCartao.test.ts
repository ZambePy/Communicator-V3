import { describe, it, expect } from 'vitest';
import {
  CARTAO_ID1_LARGURA_MM,
  PROPORCAO_DO_CARTAO,
  arredondarPolegadas,
  limitarLarguraDoCartao,
  medirMonitorPorCartao,
  resolucaoFisica,
  LARGURA_MAX_CSS_PX,
  LARGURA_MIN_CSS_PX,
} from './medidaPorCartao';

/** Largura, em px CSS, que um cartão real teria numa tela de `diag`" e `w×h` px físicos, com `dpr`. */
function cartaoEmCssPx(diagPol: number, w: number, h: number, dpr: number): number {
  const diagPx = Math.hypot(w, h);
  const pxPorMm = diagPx / (diagPol * 25.4);
  return (CARTAO_ID1_LARGURA_MM * pxPorMm) / dpr;
}

describe('medir o monitor com um cartão ID-1 (85,60 × 53,98 mm)', () => {
  it('23,8" Full HD a 100 %: recupera a diagonal', () => {
    const css = cartaoEmCssPx(23.8, 1920, 1080, 1);
    const m = medirMonitorPorCartao(css, 1, { larguraPx: 1920, alturaPx: 1080 })!;
    expect(m.diagonalPol).toBeCloseTo(23.8, 5);
    expect(m.larguraMm).toBeCloseTo(527, 0);
    expect(m.plausivel).toBe(true);
  });

  it('a escala do Windows (150 %) se cancela: mesmo monitor, mesma resposta', () => {
    // Notebook 15,6" 1920×1080 em 150 %: o cartão ocupa MENOS px CSS, mas cada
    // px CSS vale 1,5 px físicos.
    const css = cartaoEmCssPx(15.6, 1920, 1080, 1.5);
    const m = medirMonitorPorCartao(css, 1.5, { larguraPx: 1920, alturaPx: 1080 })!;
    expect(m.diagonalPol).toBeCloseTo(15.6, 5);
  });

  it('4K 27" a 200 %', () => {
    const css = cartaoEmCssPx(27, 3840, 2160, 2);
    expect(medirMonitorPorCartao(css, 2, { larguraPx: 3840, alturaPx: 2160 })!.diagonalPol).toBeCloseTo(27, 5);
  });

  it('contorno absurdo dá uma diagonal fora da faixa — e é marcada', () => {
    const m = medirMonitorPorCartao(40, 1, { larguraPx: 1920, alturaPx: 1080 })!;
    expect(m.plausivel).toBe(false);
  });

  it('sem resolução ou com entrada inválida, não inventa número', () => {
    expect(medirMonitorPorCartao(300, 1, { larguraPx: 0, alturaPx: 0 })).toBeNull();
    expect(medirMonitorPorCartao(0, 1, { larguraPx: 1920, alturaPx: 1080 })).toBeNull();
    expect(medirMonitorPorCartao(300, Number.NaN, { larguraPx: 1920, alturaPx: 1080 })).toBeNull();
  });

  it('proporção do contorno é a do cartão', () => {
    expect(PROPORCAO_DO_CARTAO).toBeCloseTo(0.6306, 4);
  });

  it('arredonda a uma casa, como o campo aceita', () => {
    expect(arredondarPolegadas(23.84)).toBe(23.8);
    expect(arredondarPolegadas(23.86)).toBe(23.9);
  });
});

describe('resolução física', () => {
  it('prefere os px físicos que o SO informa', () => {
    const info = { widthPx: 1280, heightPx: 720, scaleFactor: 1.5, physicalWidthPx: 1920, physicalHeightPx: 1080 };
    expect(resolucaoFisica(info, { width: 1, height: 1 }, 1)).toEqual({ larguraPx: 1920, alturaPx: 1080 });
  });

  it('sem px físicos, reconstrói pela escala', () => {
    const info = { widthPx: 1280, heightPx: 720, scaleFactor: 1.5, physicalWidthPx: 0, physicalHeightPx: 0 };
    expect(resolucaoFisica(info, { width: 1, height: 1 }, 1)).toEqual({ larguraPx: 1920, alturaPx: 1080 });
  });

  it('sem ponte (navegador), screen × devicePixelRatio', () => {
    expect(resolucaoFisica(null, { width: 1536, height: 864 }, 1.25)).toEqual({ larguraPx: 1920, alturaPx: 1080 });
  });
});

describe('limites do contorno', () => {
  it('prende a largura numa faixa desenhável', () => {
    expect(limitarLarguraDoCartao(10)).toBe(LARGURA_MIN_CSS_PX);
    expect(limitarLarguraDoCartao(5000)).toBe(LARGURA_MAX_CSS_PX);
    expect(limitarLarguraDoCartao(320.4)).toBe(320);
  });
});
