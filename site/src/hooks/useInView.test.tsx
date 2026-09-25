import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { limiarInalcancavel, useInView } from './useInView'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void

let callback: Callback | null = null
let opcoes: IntersectionObserverInit | undefined

class ObservadorFalso {
  constructor(cb: Callback, o?: IntersectionObserverInit) {
    callback = cb
    opcoes = o
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function Alvo() {
  const { ref, inView } = useInView<HTMLDivElement>()
  return <div ref={ref} data-testid="alvo" data-visivel={inView ? 'sim' : 'nao'} />
}

function entrada(p: { ratio: number; alturaDoElemento: number; alturaObservada: number; cruza?: boolean }) {
  return {
    isIntersecting: p.cruza ?? true,
    intersectionRatio: p.ratio,
    boundingClientRect: { height: p.alturaDoElemento } as DOMRectReadOnly,
    rootBounds: { height: p.alturaObservada } as DOMRectReadOnly,
    target: document.createElement('div'),
  }
}

describe('useInView', () => {
  beforeEach(() => {
    callback = null
    vi.stubGlobal('IntersectionObserver', ObservadorFalso)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observa também o limiar 0, além do limiar pedido', () => {
    render(<Alvo />)
    expect(opcoes?.threshold).toEqual([0, 0.18])
  })

  it('bloco comum: só entra em cena ao passar do limiar', () => {
    const { getByTestId } = render(<Alvo />)
    act(() => callback!([entrada({ ratio: 0.05, alturaDoElemento: 400, alturaObservada: 700 })]))
    expect(getByTestId('alvo').dataset.visivel).toBe('nao')
    act(() => callback!([entrada({ ratio: 0.2, alturaDoElemento: 400, alturaObservada: 700 })]))
    expect(getByTestId('alvo').dataset.visivel).toBe('sim')
  })

  it('bloco mais alto do que o limiar permite (zoom de 400 %): entra em cena ao começar a aparecer', () => {
    const { getByTestId } = render(<Alvo />)
    // 2000 px de formulário numa área de 230 px: a fração nunca passa de 11,5 %.
    act(() => callback!([entrada({ ratio: 0.01, alturaDoElemento: 2000, alturaObservada: 230 })]))
    expect(getByTestId('alvo').dataset.visivel).toBe('sim')
  })

  it('fora da tela continua escondido, por mais alto que seja', () => {
    const { getByTestId } = render(<Alvo />)
    act(() => callback!([entrada({ ratio: 0, alturaDoElemento: 2000, alturaObservada: 230, cruza: false })]))
    expect(getByTestId('alvo').dataset.visivel).toBe('nao')
  })
})

describe('limiarInalcancavel', () => {
  it('compara a fração máxima possível com o limiar', () => {
    expect(limiarInalcancavel(2000, 230, 0.18)).toBe(true)
    expect(limiarInalcancavel(400, 700, 0.18)).toBe(false)
    expect(limiarInalcancavel(0, 700, 0.18)).toBe(false)
    expect(limiarInalcancavel(400, 0, 0.18)).toBe(false)
  })
})
