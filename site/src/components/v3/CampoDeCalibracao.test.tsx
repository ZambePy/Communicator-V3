import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { ORDEM_DA_CALIBRACAO, PONTOS_DA_CALIBRACAO } from '@/components/produto/calibracao'
import { instalarObservadorFalso, mudarAba, MOVIMENTO_REDUZIDO, responderMidia } from '@/test/observador'
import { CampoDeCalibracao } from './CampoDeCalibracao'
import {
  DURACAO_DA_ENTRADA_MS,
  INTERVALO_DO_RESPIRO_MS,
  VISITAS_DO_ANEL,
  pontoDoRespiro,
  pontosDoAnel,
} from './ritmoDoCampo'

/* O campo de pontos atrás da abertura (rodada 3, 21/10/2026): os 13 pontos da
   calibração, decorativos. Entram na ordem do app, o anel de fixação visita
   os 6 primeiros, o campo se apaga e um ponto respira de tempos em tempos —
   só com a abertura na tela e a aba visível. Com movimento reduzido: parado. */

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

const pontos = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.v3-campo__ponto'))
const respirando = (c: HTMLElement) => pontos(c).filter((p) => p.classList.contains('is-respira')).map((p) => Number(p.dataset.ponto))
const avancar = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('<CampoDeCalibracao />', () => {
  it('os 13 pontos, na geometria do app, decorativos e fora do foco', () => {
    const { container } = render(<CampoDeCalibracao />)
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz).toHaveClass('v3-campo')
    expect(raiz).toHaveAttribute('aria-hidden', 'true')
    expect(raiz.querySelector('a, button, input, [tabindex], video, canvas')).toBeNull()
    for (const svg of Array.from(raiz.querySelectorAll('svg'))) expect(svg).toHaveAttribute('focusable', 'false')

    const lista = pontos(container)
    expect(lista).toHaveLength(13)
    lista.forEach((p, i) => {
      expect(p.dataset.ponto).toBe(String(i))
      expect(p.style.getPropertyValue('--x')).toBe(`${(PONTOS_DA_CALIBRACAO[i].x * 100).toFixed(2).replace(/\.?0+$/, '')}%`)
      expect(p.style.getPropertyValue('--y')).toBe(`${(PONTOS_DA_CALIBRACAO[i].y * 100).toFixed(2).replace(/\.?0+$/, '')}%`)
    })
  })

  it('acendem na ordem da calibração: o centro primeiro, depois a ordem do app', () => {
    const { container } = render(<CampoDeCalibracao />)
    const porAtraso = pontos(container)
      .map((p) => ({ ponto: Number(p.dataset.ponto), atraso: parseFloat(p.style.getPropertyValue('--atraso')) }))
      .sort((a, b) => a.atraso - b.atraso)
      .map((p) => p.ponto)
    expect(porAtraso).toEqual([...ORDEM_DA_CALIBRACAO])
    expect(PONTOS_DA_CALIBRACAO[porAtraso[0]]).toEqual({ x: 0.5, y: 0.5 })
  })

  it('o anel de fixação visita os primeiros da ordem, um por vez, e depois a entrada acaba', () => {
    const { container } = render(<CampoDeCalibracao />)
    const aneis = Array.from(container.querySelectorAll<HTMLElement>('.v3-campo__fixa'))
    expect(aneis).toHaveLength(VISITAS_DO_ANEL)
    const visitados = aneis
      .map((a) => ({ visita: Number(a.style.getPropertyValue('--v')), ponto: Number(a.closest<HTMLElement>('.v3-campo__ponto')!.dataset.ponto) }))
      .sort((a, b) => a.visita - b.visita)
      .map((a) => a.ponto)
    expect(visitados).toEqual(pontosDoAnel())

    const raiz = container.firstElementChild as HTMLElement
    expect(raiz).not.toHaveClass('is-passada')
    avancar(DURACAO_DA_ENTRADA_MS)
    expect(raiz).toHaveClass('is-passada')
    expect(container.querySelector('.v3-campo__fixa')).toBeNull()
  })

  it('depois da entrada, a cada ~4 s um ponto DIFERENTE respira, um de cada vez', () => {
    const { container } = render(<CampoDeCalibracao />)
    avancar(DURACAO_DA_ENTRADA_MS)
    expect(respirando(container)).toEqual([])
    avancar(INTERVALO_DO_RESPIRO_MS)
    expect(respirando(container)).toEqual([pontoDoRespiro(0)])
    avancar(INTERVALO_DO_RESPIRO_MS)
    expect(respirando(container)).toEqual([pontoDoRespiro(1)])
    expect(pontoDoRespiro(1)).not.toBe(pontoDoRespiro(0))
  })

  it('movimento reduzido: tudo parado no estado final — pontos apagados à vista, sem anel, sem respiro, sem temporizador', () => {
    restaurarMidia = responderMidia(MOVIMENTO_REDUZIDO)
    const { container } = render(<CampoDeCalibracao />)
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz).toHaveClass('is-parado')
    expect(pontos(container)).toHaveLength(13)
    expect(container.querySelector('.v3-campo__fixa')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    avancar(60000)
    expect(respirando(container)).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  describe('pausa', () => {
    it('fora da tela o respiro para e não sobra temporizador; ao voltar, retoma', () => {
      const obs = instalarObservadorFalso()
      const { container } = render(<CampoDeCalibracao />)
      obs.avisar(true)
      avancar(DURACAO_DA_ENTRADA_MS)
      avancar(INTERVALO_DO_RESPIRO_MS)
      expect(respirando(container)).toEqual([pontoDoRespiro(0)])

      obs.avisar(false)
      expect(vi.getTimerCount()).toBe(0)
      avancar(60000)
      expect(respirando(container)).toEqual([pontoDoRespiro(0)])

      obs.avisar(true)
      avancar(INTERVALO_DO_RESPIRO_MS)
      expect(respirando(container)).toEqual([pontoDoRespiro(1)])
    })

    it('antes de entrar na tela não respira', () => {
      const obs = instalarObservadorFalso()
      const { container } = render(<CampoDeCalibracao />)
      expect(obs.observados()).toBe(1)
      avancar(DURACAO_DA_ENTRADA_MS + 5 * INTERVALO_DO_RESPIRO_MS)
      expect(respirando(container)).toEqual([])
    })

    it('com a aba escondida o respiro para e o temporizador é desfeito; ao voltar, retoma', () => {
      const { container } = render(<CampoDeCalibracao />)
      avancar(DURACAO_DA_ENTRADA_MS)
      mudarAba('hidden')
      expect(vi.getTimerCount()).toBe(0)
      avancar(60000)
      expect(respirando(container)).toEqual([])
      mudarAba('visible')
      avancar(INTERVALO_DO_RESPIRO_MS)
      expect(respirando(container)).toEqual([pontoDoRespiro(0)])
    })

    it('ao desmontar nada fica rodando', () => {
      const { unmount } = render(<CampoDeCalibracao />)
      avancar(DURACAO_DA_ENTRADA_MS)
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
