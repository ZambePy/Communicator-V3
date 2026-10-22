import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { mudarAba, MOVIMENTO_REDUZIDO, PONTEIRO_FINO, responderMidia } from '@/test/observador'
import { LuzDoOlhar } from './LuzDoOlhar'

/* A luz do olhar (rodada 3, 21/10/2026): no fundo da página, uma luz suave no
   azul da marca segue o ponteiro com atraso, como o ponto de olhar segue o
   olhar. Só com ponteiro fino (mouse); some no toque, no teclado e com
   movimento reduzido; atrás de tudo e sem pegar clique; e não gasta nada com a
   aba escondida. */

let restaurarMidia = () => {}
let fila: Map<number, FrameRequestCallback>
let proximo = 1
let cancelados: number[]

beforeEach(() => {
  fila = new Map()
  proximo = 1
  cancelados = []
  mudarAba('visible')
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = proximo++
    fila.set(id, cb)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    cancelados.push(id)
    fila.delete(id)
  })
})
afterEach(() => {
  restaurarMidia()
  restaurarMidia = () => {}
  vi.restoreAllMocks()
})

/** Roda os quadros pedidos, um por vez, 16 ms depois do anterior. */
let relogio = 0
function quadros(n: number) {
  for (let k = 0; k < n; k++) {
    const pendentes = Array.from(fila.entries())
    fila.clear()
    relogio += 16
    act(() => pendentes.forEach(([, cb]) => cb(relogio)))
  }
}

const luz = () => document.body.querySelector<HTMLElement>('.v3-luz')
const posicao = () => {
  const m = luz()!.style.transform.match(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/)!
  return { x: Number(m[1]), y: Number(m[2]) }
}
const mouse = (x: number, y: number) => fireEvent.pointerMove(document, { pointerType: 'mouse', clientX: x, clientY: y })

describe('<LuzDoOlhar />', () => {
  it('no toque (sem ponteiro fino): nada', () => {
    restaurarMidia = responderMidia()
    render(<LuzDoOlhar />)
    expect(luz()).toBeNull()
  })

  it('com movimento reduzido: nada, mesmo com mouse', () => {
    restaurarMidia = responderMidia(PONTEIRO_FINO, MOVIMENTO_REDUZIDO)
    render(<LuzDoOlhar />)
    expect(luz()).toBeNull()
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('com mouse: mora no body, decorativa e invisível até o ponteiro se mexer', () => {
    restaurarMidia = responderMidia(PONTEIRO_FINO)
    render(<LuzDoOlhar />)
    const el = luz()!
    expect(el.parentElement).toBe(document.body)
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el).not.toHaveClass('is-visivel')
    mouse(300, 200)
    expect(el).toHaveClass('is-visivel')
  })

  it('aparece já no lugar do ponteiro (sem vir deslizando do canto) e depois o segue com atraso, sem pular', () => {
    restaurarMidia = responderMidia(PONTEIRO_FINO)
    render(<LuzDoOlhar />)
    mouse(1000, 500)
    quadros(1)
    expect(posicao()).toEqual({ x: 1000, y: 500 })

    mouse(200, 100)
    quadros(1)
    const p1 = posicao()
    // Andou um pedaço do caminho, não tudo de uma vez.
    expect(p1.x).toBeLessThan(1000)
    expect(p1.x).toBeGreaterThan(200)
    quadros(1)
    const p2 = posicao()
    expect(p2.x).toBeLessThan(p1.x)
    expect(p2.x).toBeGreaterThan(200)
    // A cada quadro o passo encolhe (a luz freia ao chegar).
    expect(p1.x - p2.x).toBeLessThan(1000 - p1.x)

    // Chega e para: o laço não fica pedindo quadros com o ponteiro parado.
    quadros(600)
    expect(posicao().x).toBeCloseTo(200, 0)
    expect(posicao().y).toBeCloseTo(100, 0)
    expect(fila.size).toBe(0)
  })

  it('o toque esconde a luz, mesmo num computador com mouse', () => {
    restaurarMidia = responderMidia(PONTEIRO_FINO)
    render(<LuzDoOlhar />)
    mouse(10, 10)
    expect(luz()).toHaveClass('is-visivel')
    fireEvent.pointerMove(document, { pointerType: 'touch', clientX: 20, clientY: 20 })
    expect(luz()).not.toHaveClass('is-visivel')
  })

  it('o teclado esconde a luz; o mouse a traz de volta', () => {
    restaurarMidia = responderMidia(PONTEIRO_FINO)
    render(<LuzDoOlhar />)
    mouse(10, 10)
    expect(luz()).toHaveClass('is-visivel')
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(luz()).not.toHaveClass('is-visivel')
    mouse(30, 30)
    expect(luz()).toHaveClass('is-visivel')
  })

  it('o ponteiro sair da janela esconde a luz', () => {
    restaurarMidia = responderMidia(PONTEIRO_FINO)
    render(<LuzDoOlhar />)
    mouse(10, 10)
    fireEvent.pointerOut(document, { relatedTarget: null })
    expect(luz()).not.toHaveClass('is-visivel')
  })

  describe('pausa', () => {
    it('com a aba escondida o laço é cancelado e nenhum quadro novo é pedido; ao voltar, retoma', () => {
      restaurarMidia = responderMidia(PONTEIRO_FINO)
      render(<LuzDoOlhar />)
      mouse(1000, 500)
      quadros(1)
      mouse(100, 50)
      expect(fila.size).toBe(1)

      mudarAba('hidden')
      expect(fila.size).toBe(0)
      expect(cancelados.length).toBeGreaterThan(0)
      // Ponteiro mexendo com a aba escondida (raro, mas possível): não pede quadro.
      mouse(120, 60)
      expect(fila.size).toBe(0)

      mudarAba('visible')
      expect(fila.size).toBe(1)
      quadros(1)
      expect(posicao().x).toBeLessThan(1000)
    })

    it('ao desmontar nada fica pendente e os ouvintes saem', () => {
      restaurarMidia = responderMidia(PONTEIRO_FINO)
      const { unmount } = render(<LuzDoOlhar />)
      mouse(1000, 500)
      quadros(1)
      mouse(100, 50)
      expect(fila.size).toBe(1)
      unmount()
      expect(fila.size).toBe(0)
      expect(luz()).toBeNull()
      mouse(5, 5)
      expect(fila.size).toBe(0)
    })
  })

  describe('o CSS', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'luz-do-olhar.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const regra = css.match(/\.v3-luz\s*\{[^}]*\}/)![0]

    it('não pega clique, não mexe no layout e fica abaixo do cabeçalho', () => {
      expect(regra).toMatch(/position:\s*fixed/)
      expect(regra).toMatch(/pointer-events:\s*none/)
      expect(Number(regra.match(/z-index:\s*(\d+)/)![1])).toBeLessThan(100)
    })

    it('é só luz: azul da marca, de baixa opacidade, e o texto não é afetado (mistura "lighten")', () => {
      expect(regra).toMatch(/radial-gradient/)
      expect(regra).toMatch(/mix-blend-mode:\s*lighten/)
      const alfas = Array.from(regra.matchAll(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*(0?\.\d+)\s*\)/g)).map((m) => Number(m[1]))
      expect(alfas.length).toBeGreaterThan(0)
      expect(Math.max(...alfas)).toBeLessThanOrEqual(0.12)
      expect(Math.max(...alfas)).toBeGreaterThanOrEqual(0.08)
    })
  })
})
