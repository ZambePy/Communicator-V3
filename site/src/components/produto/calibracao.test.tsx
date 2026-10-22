import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ESCALA_DE_CHEGADA,
  ORDEM_DA_CALIBRACAO,
  PONTOS_DA_CALIBRACAO,
  TEMPOS_DA_CALIBRACAO,
  curvaDaViagem,
  duracaoDaCalibracao,
  quadroDaCalibracao,
  type Ponto,
} from './calibracao'
import { CalibracaoAoVivo } from './CalibracaoAoVivo'

/* Os 13 pontos na geometria e na ordem do app; o alvo que chega maior e
   encolhe em cada ponto; o resultado em palavras no fim. A ordem é conferida
   com as mesmas contas de frontend/src/pages/calibration/ordemDaGrade.ts. */

function pearson(a: number[], b: number[]): number {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb)
    saa += (a[i] - ma) ** 2
    sbb += (b[i] - mb) ** 2
  }
  return saa < 1e-12 || sbb < 1e-12 ? 0 : sab / Math.sqrt(saa * sbb)
}

function caminho(pontos: Ponto[], proporcao = 16 / 9): number {
  let total = 0
  for (let k = 1; k < pontos.length; k++) {
    total += Math.hypot((pontos[k].x - pontos[k - 1].x) * proporcao, pontos[k].y - pontos[k - 1].y)
  }
  return total
}

describe('os 13 pontos da calibração', () => {
  it('a geometria do perfil padrão: grade 3 × 3 dentro do orçamento e os 4 cantos a 5 %', () => {
    expect(PONTOS_DA_CALIBRACAO).toHaveLength(13)
    const xs = new Set(PONTOS_DA_CALIBRACAO.slice(0, 9).map((p) => p.x))
    const ys = new Set(PONTOS_DA_CALIBRACAO.slice(0, 9).map((p) => p.y))
    expect([...xs]).toEqual([0.171, 0.5, 0.829])
    expect([...ys]).toEqual([0.05, 0.5, 0.8375])
    expect(PONTOS_DA_CALIBRACAO.slice(9)).toEqual([
      { x: 0.05, y: 0.05 },
      { x: 0.95, y: 0.05 },
      { x: 0.05, y: 0.95 },
      { x: 0.95, y: 0.95 },
    ])
  })

  it('a ordem do app: começa no centro e não anda junto com x nem com y', () => {
    expect([...ORDEM_DA_CALIBRACAO].sort((a, b) => a - b)).toEqual([...Array(13).keys()])
    expect(PONTOS_DA_CALIBRACAO[ORDEM_DA_CALIBRACAO[0]]).toEqual({ x: 0.5, y: 0.5 })
    const visitados = ORDEM_DA_CALIBRACAO.map((i) => PONTOS_DA_CALIBRACAO[i])
    const t = visitados.map((_, k) => k)
    // Os limites do teste do app para a geometria de referência.
    expect(Math.abs(pearson(t, visitados.map((p) => p.x)))).toBeLessThanOrEqual(0.1)
    expect(Math.abs(pearson(t, visitados.map((p) => p.y)))).toBeLessThanOrEqual(0.1)
    // E o caminho é mais curto que o da ordem de leitura (linha a linha).
    const leitura = [...PONTOS_DA_CALIBRACAO].sort((a, b) => a.y - b.y || a.x - b.x)
    expect(Math.abs(pearson(t, leitura.map((p) => p.y)))).toBeGreaterThan(0.9)
    expect(caminho(visitados)).toBeLessThan(caminho(leitura))
  })
})

describe('a linha do tempo', () => {
  const T = TEMPOS_DA_CALIBRACAO
  const porPonto = T.viagemMs + T.contracaoMs + T.coletaMs

  it('o alvo viaja, chega 1,5× maior, encolhe e deixa o ponto', () => {
    expect(quadroDaCalibracao(0).alvo).toBeNull()
    // O segundo ponto: no começo da viagem, ainda no primeiro, maior.
    const saindo = quadroDaCalibracao(T.inicioMs + porPonto + 1)
    expect(saindo.feitos).toBe(1)
    expect(saindo.alvo!.de).toEqual(PONTOS_DA_CALIBRACAO[ORDEM_DA_CALIBRACAO[0]])
    expect(saindo.alvo!.para).toEqual(PONTOS_DA_CALIBRACAO[ORDEM_DA_CALIBRACAO[1]])
    expect(saindo.alvo!.escala).toBe(ESCALA_DE_CHEGADA)
    // Chegou: encolhe até o tamanho de fixação, e fica parado na coleta.
    const coletando = quadroDaCalibracao(T.inicioMs + porPonto + T.viagemMs + T.contracaoMs + 10)
    expect(coletando.alvo!.viagem).toBe(1)
    expect(coletando.alvo!.escala).toBeCloseTo(1)
  })

  it('depois do 13º, o resultado; e para', () => {
    const fim = duracaoDaCalibracao()
    expect(fim).toBeLessThan(9000)
    expect(quadroDaCalibracao(fim - T.resultadoMs - 1).resultado).toBe(0)
    const q = quadroDaCalibracao(fim + 1)
    expect(q).toEqual({ feitos: 13, alvo: null, resultado: 1, fim: true })
  })

  it('a curva da viagem é a do app: parte parada e chega parada', () => {
    expect(curvaDaViagem(0)).toBeCloseTo(0)
    expect(curvaDaViagem(1)).toBeCloseTo(1)
    expect(curvaDaViagem(0.5)).toBeGreaterThan(0.5)
  })
})

describe('<CalibracaoAoVivo />', () => {
  const original = window.matchMedia
  afterEach(() => {
    window.matchMedia = original
    vi.unstubAllGlobals()
  })

  it('com movimento reduzido: os 13 pontos marcados e "Ótima", parados, sem controle', () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
    const { container } = render(<CalibracaoAoVivo />)
    expect(container.querySelectorAll('.calib__ponto.is-feito')).toHaveLength(13)
    expect(screen.getByText('Ótima')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('.calib__tela')).toHaveAttribute('aria-hidden', 'true')
  })

  it('espera a tela entrar para começar; aí aparece o "Pausar"', () => {
    const avisos: Array<(e: Partial<IntersectionObserverEntry>[]) => void> = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) {
          avisos.push(cb)
        }
        observe() {}
        disconnect() {}
      },
    )
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const { container } = render(<CalibracaoAoVivo />)
    expect(container.querySelectorAll('.calib__ponto.is-feito')).toHaveLength(0)
    expect(screen.queryByRole('button')).toBeNull()
    act(() => avisos.forEach((cb) => cb([{ isIntersecting: true, intersectionRatio: 0.8 }])))
    expect(screen.getByRole('button', { name: 'Pausar a calibração' })).toBeInTheDocument()
  })

  it('o CSS só anima transform e opacity', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'calibracao-ao-vivo.css'), 'utf8')
    const blocos = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
    expect(blocos.length).toBeGreaterThan(0)
    for (const bloco of blocos) {
      const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
      expect(props.every((p) => p === 'transform' || p === 'opacity')).toBe(true)
    }
  })
})
