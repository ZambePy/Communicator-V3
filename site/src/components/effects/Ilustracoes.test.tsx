import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CofreDoComputador, OlharQueFala, OlhoQuePisca } from './Ilustracoes'

/* As ilustrações animadas são decoração: o texto ao lado já diz o que elas
   mostram. E o movimento segue as regras do site: só transform e opacity,
   e só com a ilustração na tela. */

const AQUI = dirname(fileURLToPath(import.meta.url))

describe('ilustrações animadas', () => {
  it.each([
    ['o olho', OlhoQuePisca],
    ['o computador', CofreDoComputador],
    ['o olhar que fala', OlharQueFala],
  ])('%s: fora do leitor de tela e do foco; sem IntersectionObserver, roda', (_nome, Ilustracao) => {
    const { container } = render(<Ilustracao />)
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
        <OlhoQuePisca />
        <OlharQueFala />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('[id]')).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => !id.includes(':'))).toBe(true)
  })

  it('o CSS só anima transform e opacity', () => {
    for (const arquivo of ['ilustracoes.css', '../home/aparelhos.css']) {
      const css = readFileSync(resolve(AQUI, arquivo), 'utf8')
      const blocos = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
      expect(blocos.length).toBeGreaterThan(0)
      for (const bloco of blocos) {
        const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
        expect(props.every((p) => p === 'transform' || p === 'opacity')).toBe(true)
      }
    }
  })
})
