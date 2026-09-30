import { describe, expect, it } from 'vitest'
import { capituloNoTempo, legendaNoTempo, progressoNoCapitulo } from './capitulosDoVideo'

/* O tempo do vídeo decide o capítulo, a legenda e a barra dos passos da home.
   Os limites importam: um quadro cedo demais acende o passo errado. */

const CAPS = [{ inicio: 0 }, { inicio: 9 }, { inicio: 16.1 }]
const LEGENDAS = [
  { de: 9, texto: 'a' },
  { de: 10, texto: 'b' },
  { de: 13.8, texto: 'c' },
]

describe('capítulo no tempo do vídeo', () => {
  it('cada instante cai no capítulo que começou por último', () => {
    expect(capituloNoTempo(0, CAPS)).toBe(0)
    expect(capituloNoTempo(8.99, CAPS)).toBe(0)
    expect(capituloNoTempo(9, CAPS)).toBe(1)
    expect(capituloNoTempo(16.09, CAPS)).toBe(1)
    expect(capituloNoTempo(16.1, CAPS)).toBe(2)
    expect(capituloNoTempo(23.5, CAPS)).toBe(2)
  })

  it('antes de carregar (NaN) ou com tempo estranho, o primeiro', () => {
    expect(capituloNoTempo(Number.NaN, CAPS)).toBe(0)
    expect(capituloNoTempo(-1, CAPS)).toBe(0)
    expect(capituloNoTempo(Number.POSITIVE_INFINITY, CAPS)).toBe(0)
  })
})

describe('legenda no tempo do vídeo', () => {
  it('vale a partir do seu instante até a próxima', () => {
    expect(legendaNoTempo(9.2, LEGENDAS)).toBe(0)
    expect(legendaNoTempo(10, LEGENDAS)).toBe(1)
    expect(legendaNoTempo(13.79, LEGENDAS)).toBe(1)
    expect(legendaNoTempo(15, LEGENDAS)).toBe(2)
  })

  it('antes da primeira, ou sem tempo, a primeira', () => {
    expect(legendaNoTempo(8, LEGENDAS)).toBe(0)
    expect(legendaNoTempo(Number.NaN, LEGENDAS)).toBe(0)
  })
})

describe('progresso dentro do capítulo', () => {
  it('vai de 0 no início a 1 no começo do próximo', () => {
    expect(progressoNoCapitulo(0, 0, CAPS, 23.57)).toBe(0)
    expect(progressoNoCapitulo(4.5, 0, CAPS, 23.57)).toBeCloseTo(0.5)
    expect(progressoNoCapitulo(12.5, 1, CAPS, 23.57)).toBeCloseTo(3.5 / 7.1)
  })

  it('o último capítulo termina no fim da gravação', () => {
    expect(progressoNoCapitulo(23.57, 2, CAPS, 23.57)).toBe(1)
    expect(progressoNoCapitulo((16.1 + 23.57) / 2, 2, CAPS, 23.57)).toBeCloseTo(0.5)
  })

  it('fica entre 0 e 1, e 0 sem tempo ou sem duração', () => {
    expect(progressoNoCapitulo(3, 1, CAPS, 23.57)).toBe(0)
    expect(progressoNoCapitulo(30, 2, CAPS, 23.57)).toBe(1)
    expect(progressoNoCapitulo(Number.NaN, 0, CAPS, 23.57)).toBe(0)
    expect(progressoNoCapitulo(20, 2, CAPS, Number.NaN)).toBe(0)
  })
})
