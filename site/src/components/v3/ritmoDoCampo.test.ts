import { describe, expect, it } from 'vitest'
import { ORDEM_DA_CALIBRACAO, PONTOS_DA_CALIBRACAO } from '@/components/produto/calibracao'
import {
  ANEL_DWELL_MS,
  DURACAO_DA_ENTRADA_MS,
  ENTRADA_INICIO_MS,
  INTERVALO_DO_RESPIRO_MS,
  VISITAS_DO_ANEL,
  atrasoDeEntradaMs,
  atrasoDoAnelMs,
  ordemDoPonto,
  pontoDoRespiro,
  pontosDoAnel,
} from './ritmoDoCampo'

/* O campo de pontos da abertura (rodada 3, 21/10/2026) é a primeira tela do
   IrisFlow: os 13 pontos da calibração, na mesma geometria e NA MESMA ORDEM em
   que o app os mostra (ordemDaGrade.ts do desktop, já copiada em
   produto/calibracao.ts). O que aparece primeiro, o que o anel de fixação
   visita e qual ponto respira saem daí — nada é inventado. */

describe('a ordem dos 13 pontos no campo', () => {
  it('cada ponto aparece na ordem da calibração: o centro primeiro, depois a ordem do app', () => {
    const porChegada = PONTOS_DA_CALIBRACAO.map((_, i) => i).sort((a, b) => atrasoDeEntradaMs(a) - atrasoDeEntradaMs(b))
    expect(porChegada).toEqual([...ORDEM_DA_CALIBRACAO])
    expect(PONTOS_DA_CALIBRACAO[porChegada[0]]).toEqual({ x: 0.5, y: 0.5 })
    expect(ordemDoPonto(ORDEM_DA_CALIBRACAO[0])).toBe(0)
    expect(ordemDoPonto(ORDEM_DA_CALIBRACAO[12])).toBe(12)
  })

  it('a entrada leva cerca de 1,5 s do primeiro ao último ponto, sem dois ao mesmo tempo', () => {
    const atrasos = ORDEM_DA_CALIBRACAO.map(atrasoDeEntradaMs)
    expect(atrasos[0]).toBe(ENTRADA_INICIO_MS)
    for (let k = 1; k < atrasos.length; k++) expect(atrasos[k]).toBeGreaterThan(atrasos[k - 1])
    const total = atrasos[12] - atrasos[0]
    expect(total).toBeGreaterThanOrEqual(1000)
    expect(total).toBeLessThanOrEqual(1600)
  })

  it('o anel de fixação visita os 6 primeiros da ordem, um de cada vez, enchendo como o dwell', () => {
    expect(VISITAS_DO_ANEL).toBeGreaterThanOrEqual(5)
    expect(VISITAS_DO_ANEL).toBeLessThanOrEqual(6)
    expect(pontosDoAnel()).toEqual(ORDEM_DA_CALIBRACAO.slice(0, VISITAS_DO_ANEL))
    for (let v = 0; v < VISITAS_DO_ANEL; v++) {
      // O ponto já existe quando o anel chega nele.
      expect(atrasoDoAnelMs(v)).toBeGreaterThan(atrasoDeEntradaMs(pontosDoAnel()[v]))
      // E uma visita só começa depois da anterior ter fechado.
      if (v > 0) expect(atrasoDoAnelMs(v)).toBeGreaterThanOrEqual(atrasoDoAnelMs(v - 1) + ANEL_DWELL_MS)
    }
  })

  it('a entrada inteira termina depois da última visita do anel', () => {
    const fimDoAnel = atrasoDoAnelMs(VISITAS_DO_ANEL - 1) + ANEL_DWELL_MS
    expect(DURACAO_DA_ENTRADA_MS).toBeGreaterThan(fimDoAnel)
    expect(DURACAO_DA_ENTRADA_MS).toBeLessThanOrEqual(7000)
  })
})

describe('o ponto que respira', () => {
  it('a cada ~4 s', () => {
    expect(INTERVALO_DO_RESPIRO_MS).toBeGreaterThanOrEqual(3500)
    expect(INTERVALO_DO_RESPIRO_MS).toBeLessThanOrEqual(4500)
  })

  it('é sempre um ponto diferente do anterior, e passa pelos 13 antes de repetir', () => {
    const vistos = Array.from({ length: 13 }, (_, n) => pontoDoRespiro(n))
    expect(new Set(vistos).size).toBe(13)
    for (let n = 1; n < 40; n++) expect(pontoDoRespiro(n)).not.toBe(pontoDoRespiro(n - 1))
    for (const i of vistos) expect(i).toBeGreaterThanOrEqual(0)
    for (const i of vistos) expect(i).toBeLessThan(13)
  })
})
