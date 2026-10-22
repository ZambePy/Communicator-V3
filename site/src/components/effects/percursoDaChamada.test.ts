import { describe, expect, it } from 'vitest'
import { ORDEM_DA_CALIBRACAO } from '@/components/produto/calibracao'
import {
  FIXACAO_NO_PERCURSO_MS,
  PASSOS_DO_PERCURSO,
  PASSO_DO_PERCURSO_MS,
  pontoDoPasso,
  pontosFeitos,
  proximoPasso,
} from './percursoDaChamada'

/* A chamada final (rodada 3, 21/10/2026): o anel de fixação percorre os 13
   pontos da figura da calibração, na ordem do app, devagar, enquanto a seção
   está na tela. As contas do percurso, sem navegador. */

describe('o percurso do anel pelos 13 pontos', () => {
  it('visita os 13 pontos na ordem da calibração, o centro primeiro', () => {
    const visitados = Array.from({ length: ORDEM_DA_CALIBRACAO.length }, (_, p) => pontoDoPasso(p))
    expect(visitados).toEqual([...ORDEM_DA_CALIBRACAO])
    expect(visitados[0]).toBe(4)
  })

  it('depois do último há um passo de "completo" (todos fixados, anel guardado) e então recomeça', () => {
    expect(PASSOS_DO_PERCURSO).toBe(14)
    expect(pontoDoPasso(13)).toBeNull()
    expect(pontosFeitos(13)).toHaveLength(13)
    expect(proximoPasso(12)).toBe(13)
    expect(proximoPasso(13)).toBe(0)
    expect(pontosFeitos(0)).toEqual([])
  })

  it('os pontos já fixados são os que vieram antes na ordem', () => {
    for (let p = 0; p <= 13; p++) expect(pontosFeitos(p)).toEqual(ORDEM_DA_CALIBRACAO.slice(0, p))
  })

  it('é devagar: mais de um segundo por ponto, e o anel fecha antes de passar ao próximo', () => {
    expect(PASSO_DO_PERCURSO_MS).toBeGreaterThanOrEqual(1000)
    expect(FIXACAO_NO_PERCURSO_MS).toBeLessThan(PASSO_DO_PERCURSO_MS)
    // A volta toda (13 pontos) não passa de ~20 s: não é uma espera sem fim.
    expect(PASSO_DO_PERCURSO_MS * PASSOS_DO_PERCURSO).toBeLessThanOrEqual(20000)
  })

  it('passos fora da faixa não quebram', () => {
    expect(pontoDoPasso(-1)).toBeNull()
    expect(pontoDoPasso(99)).toBeNull()
    expect(pontosFeitos(-3)).toEqual([])
    expect(pontosFeitos(99)).toHaveLength(13)
  })
})
