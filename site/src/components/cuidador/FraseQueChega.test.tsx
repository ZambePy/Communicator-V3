import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FraseQueChega } from './FraseQueChega'

/* A frase que chega ao celular: toca uma vez quando a cena entra na tela, e
   com movimento reduzido fica no fim, parada. Só transform e opacity animam. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const original = window.matchMedia

afterEach(() => {
  window.matchMedia = original
  vi.unstubAllGlobals()
})

function observadorFalso() {
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
  return (ratio: number) => act(() => avisos.forEach((cb) => cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio }])))
}

describe('<FraseQueChega />', () => {
  it('espera a cena entrar na tela; com metade dela à vista, toca — uma vez', () => {
    const entrar = observadorFalso()
    const { container } = render(<FraseQueChega />)
    const cena = () => container.querySelector('.chega__cena')!
    expect(cena()).toHaveClass('is-espera')
    entrar(0.2)
    expect(cena()).toHaveClass('is-espera')
    entrar(0.6)
    expect(cena()).toHaveClass('is-tocando')
    // Ver de novo: a cena é montada de novo e toca outra vez.
    fireEvent.click(screen.getByRole('button', { name: 'Ver de novo a frase chegando ao celular' }))
    expect(cena()).toHaveClass('is-tocando')
  })

  it('com movimento reduzido: o fim da conversa, parado, sem botão', () => {
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
    const { container } = render(<FraseQueChega />)
    expect(container.querySelector('.chega__cena')).toHaveClass('is-final')
    expect(container.querySelector('.chega__cena')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('.chega__bolha--sua')).toHaveTextContent('Já estou indo')
    expect(screen.getByText(/A resposta é falada na tela dela/)).toBeInTheDocument()
  })

  it('o CSS só anima transform e opacity', () => {
    const css = readFileSync(resolve(AQUI, 'frase-que-chega.css'), 'utf8')
    const blocos = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
    expect(blocos.length).toBeGreaterThan(5)
    for (const bloco of blocos) {
      const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
      expect(props.every((p) => p === 'transform' || p === 'opacity' || p === 'animation-timing-function')).toBe(true)
    }
  })
})
