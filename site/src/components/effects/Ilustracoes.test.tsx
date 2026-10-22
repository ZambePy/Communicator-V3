import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ilustracoes from './Ilustracoes'
import { AlvosDeCalibracao, CofreDoComputador, posicoesDaCalibracao } from './Ilustracoes'
import { ORDEM_DA_CALIBRACAO } from '@/components/produto/calibracao'
import { instalarObservadorFalso, mudarAba, MOVIMENTO_REDUZIDO, responderMidia } from '@/test/observador'
import { PASSO_DO_PERCURSO_MS } from './percursoDaChamada'

/* As ilustrações animadas são decoração: o texto ao lado já diz o que elas
   mostram. E o movimento segue as regras do site: só transform e opacity,
   e só com a ilustração na tela. O olho desenhado saiu (não é da identidade
   visual): nenhuma ilustração o exporta mais. */

const AQUI = dirname(fileURLToPath(import.meta.url))

describe('ilustrações animadas', () => {
  it('o olho desenhado não existe mais', () => {
    // O computador da privacidade e a tela da calibração (chamada final).
    expect(Object.keys(ilustracoes).sort()).toEqual(['AlvosDeCalibracao', 'CofreDoComputador', 'posicoesDaCalibracao'])
  })

  it('a tela da calibração tem os 13 alvos na posição do app, com o do centro aceso', () => {
    // A geometria do perfil padrão (src/calibration.ts, alvosDeCalibracao) na
    // tela de referência: a grade 3 × 3 em 17,1/50/82,9 % × 5/50/83,75 % e os
    // quatro cantos a 5 %. Até 20/10/2026 o desenho trazia a grade do Modo
    // Computador, com alvos nas diagonais (0,275 e 0,725), que saíram.
    const p = posicoesDaCalibracao()
    expect(p).toHaveLength(13)
    expect(p).toContainEqual({ x: 0.05, y: 0.05 })
    expect(p).toContainEqual({ x: 0.5, y: 0.5 })
    expect(p).toContainEqual({ x: 0.95, y: 0.95 })
    expect(p).toContainEqual({ x: 0.171, y: 0.8375 })
    expect(p).not.toContainEqual({ x: 0.275, y: 0.275 })
    // O desenho de repouso (movimento reduzido): o do centro aceso. Com
    // movimento, quem acende cada ponto é o anel que percorre os 13 (abaixo).
    const restaurar = responderMidia(MOVIMENTO_REDUZIDO)
    try {
      const { container } = render(<AlvosDeCalibracao />)
      expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
      expect(container.querySelectorAll('.alvos__alvo')).toHaveLength(13)
      expect(container.querySelectorAll('.alvos__alvo--fixado')).toHaveLength(1)
    } finally {
      restaurar()
    }
  })

  it('o computador: fora do leitor de tela e do foco; sem IntersectionObserver, roda', () => {
    const { container } = render(<CofreDoComputador />)
    const palco = container.firstElementChild as HTMLElement
    expect(palco).toHaveAttribute('aria-hidden', 'true')
    expect(palco.querySelector('svg')).toHaveAttribute('focusable', 'false')
    // Sem IntersectionObserver (jsdom), o `useInView` considera a peça na tela.
    expect(palco).toHaveClass('is-rodando')
  })

  it('com IntersectionObserver, anima só enquanto está na tela', () => {
    const avisos: Array<(e: Partial<IntersectionObserverEntry>[]) => void> = []
    class ObservadorFalso {
      constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) {
        avisos.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', ObservadorFalso)
    try {
      const { container } = render(<CofreDoComputador />)
      const palco = container.firstElementChild as HTMLElement
      expect(palco).not.toHaveClass('is-rodando')
      const entrada = (dentro: boolean) =>
        act(() => avisos.forEach((cb) => cb([{ isIntersecting: dentro, intersectionRatio: dentro ? 1 : 0, boundingClientRect: { height: 87 } as DOMRectReadOnly, rootBounds: null }])))
      entrada(true)
      expect(palco).toHaveClass('is-rodando')
      entrada(false)
      expect(palco).not.toHaveClass('is-rodando')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('duas no mesmo documento não dividem ids de recorte nem de gradiente', () => {
    const { container } = render(
      <>
        <CofreDoComputador />
        <CofreDoComputador />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('[id]')).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => !id.includes(':'))).toBe(true)
  })

  it('o CSS só anima transform, opacity e o traço do anel (stroke-dashoffset)', () => {
    // As ilustrações animam (o computador da privacidade e o anel da chamada
    // final); os aparelhos, desde o redesenho de 19/10/2026, não têm animação
    // própria — se voltarem a ter, a mesma regra vale para eles.
    for (const [arquivo, temAnimacao] of [
      ['ilustracoes.css', true],
      ['../home/aparelhos.css', false],
    ] as const) {
      const css = readFileSync(resolve(AQUI, arquivo), 'utf8')
      const blocos = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
      if (temAnimacao) expect(blocos.length).toBeGreaterThan(0)
      for (const bloco of blocos) {
        const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
        expect(props.every((p) => p === 'transform' || p === 'opacity' || p === 'stroke-dashoffset')).toBe(true)
      }
    }
  })
})

/* A chamada final (rodada 3, 21/10/2026): o anel de fixação percorre os 13
   pontos da figura da calibração, na ordem do app, devagar, enquanto a seção
   está na tela — e pausa fora dela e com a aba escondida. Com movimento
   reduzido, a figura parada de sempre (o do centro aceso). */
describe('o anel que percorre os 13 pontos da chamada final', () => {
  let restaurarMidia = () => {}
  beforeEach(() => {
    vi.useFakeTimers()
    mudarAba('visible')
  })
  afterEach(() => {
    restaurarMidia()
    restaurarMidia = () => {}
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const anel = (c: HTMLElement) => c.querySelector<SVGGElement>('.alvos__anel')
  const pontoDoAnel = (c: HTMLElement) => {
    const el = anel(c)
    return el && !el.classList.contains('is-completo') ? Number(el.dataset.ponto) : null
  }
  const feitos = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<SVGGElement>('.alvos__alvo'))
      .map((g, i) => (g.classList.contains('alvos__alvo--feito') ? i : -1))
      .filter((i) => i >= 0)
  const avancar = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

  it('começa no centro, e a cada passo vai ao próximo ponto da ordem da calibração', () => {
    const { container } = render(<AlvosDeCalibracao />)
    expect(pontoDoAnel(container)).toBe(ORDEM_DA_CALIBRACAO[0])
    expect(pontoDoAnel(container)).toBe(4)
    const visitados = [pontoDoAnel(container)]
    for (let k = 1; k < 13; k++) {
      avancar(PASSO_DO_PERCURSO_MS)
      visitados.push(pontoDoAnel(container))
    }
    expect(visitados).toEqual([...ORDEM_DA_CALIBRACAO])
  })

  it('o ponto que o anel deixa fica marcado; no fim estão os 13, e então recomeça', () => {
    const { container } = render(<AlvosDeCalibracao />)
    expect(feitos(container)).toEqual([])
    avancar(PASSO_DO_PERCURSO_MS * 3)
    expect(feitos(container).sort((a, b) => a - b)).toEqual([...ORDEM_DA_CALIBRACAO.slice(0, 3)].sort((a, b) => a - b))
    avancar(PASSO_DO_PERCURSO_MS * 10)
    expect(feitos(container)).toHaveLength(13)
    expect(anel(container)).toHaveClass('is-completo')
    avancar(PASSO_DO_PERCURSO_MS)
    expect(feitos(container)).toEqual([])
    expect(pontoDoAnel(container)).toBe(4)
  })

  it('com a figura animada, nenhum ponto fica aceso à parte: quem acende é o anel', () => {
    const { container } = render(<AlvosDeCalibracao />)
    expect(container.querySelectorAll('.alvos__alvo--fixado')).toHaveLength(0)
    expect(container.querySelectorAll('.alvos__alvo')).toHaveLength(13)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('fora da tela: o anel para onde está e não sobra temporizador; ao voltar, continua', () => {
    const obs = instalarObservadorFalso()
    const { container } = render(<AlvosDeCalibracao />)
    expect(vi.getTimerCount()).toBe(0)
    obs.avisar(true)
    avancar(PASSO_DO_PERCURSO_MS * 2)
    const parado = pontoDoAnel(container)
    expect(parado).toBe(ORDEM_DA_CALIBRACAO[2])

    obs.avisar(false)
    expect(vi.getTimerCount()).toBe(0)
    avancar(PASSO_DO_PERCURSO_MS * 20)
    expect(pontoDoAnel(container)).toBe(parado)

    obs.avisar(true)
    avancar(PASSO_DO_PERCURSO_MS)
    expect(pontoDoAnel(container)).toBe(ORDEM_DA_CALIBRACAO[3])
  })

  it('com a aba escondida: para, desfaz o temporizador; ao voltar, continua', () => {
    const { container } = render(<AlvosDeCalibracao />)
    avancar(PASSO_DO_PERCURSO_MS)
    expect(pontoDoAnel(container)).toBe(ORDEM_DA_CALIBRACAO[1])
    mudarAba('hidden')
    expect(vi.getTimerCount()).toBe(0)
    avancar(PASSO_DO_PERCURSO_MS * 10)
    expect(pontoDoAnel(container)).toBe(ORDEM_DA_CALIBRACAO[1])
    mudarAba('visible')
    avancar(PASSO_DO_PERCURSO_MS)
    expect(pontoDoAnel(container)).toBe(ORDEM_DA_CALIBRACAO[2])
  })

  it('movimento reduzido: a figura parada de sempre — o do centro aceso, sem anel e sem temporizador', () => {
    restaurarMidia = responderMidia(MOVIMENTO_REDUZIDO)
    const { container } = render(<AlvosDeCalibracao />)
    expect(anel(container)).toBeNull()
    expect(container.querySelectorAll('.alvos__alvo--fixado')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    avancar(60000)
    expect(feitos(container)).toEqual([])
  })

  it('ao desmontar nada fica rodando', () => {
    const { unmount } = render(<AlvosDeCalibracao />)
    avancar(PASSO_DO_PERCURSO_MS)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('o CSS: o anel viaja por transform, enche por stroke-dashoffset, e o movimento reduzido o esconde', () => {
    const css = readFileSync(resolve(AQUI, 'ilustracoes.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toMatch(/\.alvos__anel\s*\{[^}]*transition:\s*transform/)
    expect(css).toMatch(/@keyframes alvo-fixa\s*\{[^}]*stroke-dashoffset/)
    const reduzido = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)![0]
    expect(reduzido).toMatch(/\.alvos__anel\s*\{[^}]*display:\s*none/)
  })
})
