import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ArcoDeCondicoes } from './ArcoDeCondicoes'
import { geometriaDoArco, type Medida } from './geometriaDoArco'
import { CONDICOES_NO_ARCO, PARA_QUEM_O_OLHAR } from '@/data/home'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* "Para quem" (v3, 21/10/2026): as condições numa linha curva (um fio, sem
   brilho), a borda de uma íris. Cada uma é um link para o trecho que fala dela.

   Revisão de 21/10/2026 (I1): o raio e a posição saem da largura real da caixa
   e do tamanho real dos itens. O jsdom não faz layout, então os testes
   simulam as medidas (clientWidth da caixa, offsetWidth/offsetHeight dos
   itens) e conferem o que o componente aplica no DOM; a conta em si (cabe ou
   não, em todas as larguras) é testada em geometriaDoArco.test.ts. */

function montar() {
  return render(
    <MemoryRouter future={FUTURO_DO_ROTEADOR}>
      <ArcoDeCondicoes condicoes={CONDICOES_NO_ARCO} titulo={PARA_QUEM_O_OLHAR.titulo} texto={PARA_QUEM_O_OLHAR.texto} />
    </MemoryRouter>,
  )
}

// O que o Chromium mediu em 1440 px (offsetWidth × offsetHeight de cada <li>) quando é arco.
const NO_ARCO: Medida[] = [
  { largura: 48, altura: 32 },
  { largura: 141, altura: 32 },
  { largura: 150, altura: 53 },
  { largura: 150, altura: 53 },
  { largura: 158, altura: 53 },
  { largura: 100, altura: 32 },
]
// Na lista de pílulas os itens têm outro tamanho (aqui, bem menor): se o
// componente medisse neste modo, enxergaria um arco que cabe em qualquer lugar.
const NA_LISTA: Medida[] = NO_ARCO.map(() => ({ largura: 60, altura: 44 }))

let larguraDaCaixa = 0
let medidasNoArco = NO_ARCO
const observadores: (() => void)[] = []
const ouvintesDeFonte: (() => void)[] = []
const modosVistosNaMedida: (string | null)[] = []

const arcoDe = (el: HTMLElement) => el.closest('.v3-arco') as HTMLElement | null
const originais = {
  clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
}

beforeEach(() => {
  larguraDaCaixa = 0
  medidasNoArco = NO_ARCO
  observadores.length = 0
  ouvintesDeFonte.length = 0
  modosVistosNaMedida.length = 0

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('v3-arco') ? larguraDaCaixa : 0
    },
  })
  const medidaDoItem = (el: HTMLElement): Medida => {
    const arco = arcoDe(el)
    modosVistosNaMedida.push(arco?.getAttribute('data-modo') ?? null)
    const i = Array.from(el.parentElement!.children).indexOf(el)
    return (arco?.getAttribute('data-modo') === 'arco' ? medidasNoArco : NA_LISTA)[i]
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('v3-arco__item') ? medidaDoItem(this).largura : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('v3-arco__item') ? medidaDoItem(this).altura : 0
    },
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(aviso: () => void) {
        observadores.push(aviso)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: Promise.resolve(),
      addEventListener: (_tipo: string, cb: () => void) => ouvintesDeFonte.push(cb),
      removeEventListener: () => {},
    },
  })
})

afterEach(() => {
  for (const nome of ['clientWidth', 'offsetWidth', 'offsetHeight'] as const) {
    const original = originais[nome]
    if (original) Object.defineProperty(HTMLElement.prototype, nome, original)
  }
  Reflect.deleteProperty(document, 'fonts')
  vi.unstubAllGlobals()
})

const caixa = (c: HTMLElement) => c.querySelector<HTMLElement>('.v3-arco')!

describe('<ArcoDeCondicoes />', () => {
  it('as seis condições aprovadas, na ordem, cada uma levando à explicação', () => {
    montar()
    expect(CONDICOES_NO_ARCO.map((c) => c.nome)).toEqual([
      'ELA',
      'AVC de tronco',
      'Lesão medular alta',
      'Paralisia cerebral',
      'Síndrome do encarceramento',
      'Distrofias',
    ])
    const lista = screen.getByRole('list')
    const links = within(lista).getAllByRole('link')
    expect(links).toHaveLength(6)
    links.forEach((a, i) => {
      expect(a).toHaveTextContent(CONDICOES_NO_ARCO[i].nome)
      expect(a.getAttribute('href')).toBe(CONDICOES_NO_ARCO[i].to)
      expect(CONDICOES_NO_ARCO[i].to).toMatch(/^\/como-funciona#para-/)
    })
  })

  it('a curva é decoração', () => {
    const { container } = montar()
    const curva = container.querySelector('.v3-arco__linha')!
    expect(curva).not.toBeNull()
    expect(curva.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('sem medida (caixa de largura zero), fica na lista de pílulas: o pior caso não corta', () => {
    const { container } = montar()
    expect(caixa(container)).toHaveAttribute('data-modo', 'lista')
    expect(caixa(container).style.getPropertyValue('--raio')).toBe('')
  })

  it('com largura de computador, aplica o raio, o topo e a altura que a conta devolve', () => {
    larguraDaCaixa = 1200
    const { container } = montar()
    const esperado = geometriaDoArco(1200, NO_ARCO)
    if (esperado.modo !== 'arco') throw new Error('1200 px devia caber o arco')
    expect(caixa(container)).toHaveAttribute('data-modo', 'arco')
    expect(caixa(container).style.getPropertyValue('--raio')).toBe(`${esperado.raio}px`)
    expect(caixa(container).style.getPropertyValue('--topo')).toBe(`${esperado.topo}px`)
    expect(caixa(container).style.getPropertyValue('--altura')).toBe(`${esperado.altura}px`)
    // Cada item continua com o ângulo dele.
    const itens = container.querySelectorAll<HTMLElement>('.v3-arco__item')
    expect(itens[0].style.getPropertyValue('--a')).toBe('-30deg')
    expect(itens[5].style.getPropertyValue('--a')).toBe('30deg')
  })

  it('mede os itens com o tamanho do arco (não o da lista) e devolve o atributo como estava', () => {
    larguraDaCaixa = 1200
    const { container } = montar()
    // Todas as leituras de tamanho foram feitas com o modo arco ligado...
    expect(modosVistosNaMedida.length).toBeGreaterThan(0)
    expect(new Set(modosVistosNaMedida)).toEqual(new Set(['arco']))
    // ...e, numa largura em que o arco não cabe, o modo que sobra é a lista.
    larguraDaCaixa = 500
    act(() => observadores.forEach((cb) => cb()))
    return waitFor(() => expect(caixa(container)).toHaveAttribute('data-modo', 'lista'))
  })

  it('a largura muda: o raio acompanha, e quando o arco deixa de caber volta a lista (e o contrário)', async () => {
    larguraDaCaixa = 1200
    const { container } = montar()
    const raio1200 = caixa(container).style.getPropertyValue('--raio')

    larguraDaCaixa = 1000
    act(() => observadores.forEach((cb) => cb()))
    await waitFor(() => expect(caixa(container).style.getPropertyValue('--raio')).not.toBe(raio1200))
    const esperado = geometriaDoArco(1000, NO_ARCO)
    if (esperado.modo !== 'arco') throw new Error('1000 px devia caber o arco')
    expect(caixa(container).style.getPropertyValue('--raio')).toBe(`${esperado.raio}px`)

    larguraDaCaixa = 707
    act(() => observadores.forEach((cb) => cb()))
    await waitFor(() => expect(caixa(container)).toHaveAttribute('data-modo', 'lista'))
    expect(caixa(container).style.getPropertyValue('--raio')).toBe('')

    larguraDaCaixa = 1116
    act(() => observadores.forEach((cb) => cb()))
    await waitFor(() => expect(caixa(container)).toHaveAttribute('data-modo', 'arco'))
    expect(caixa(container).style.getPropertyValue('--raio')).toBe(`${(geometriaDoArco(1116, NO_ARCO) as { raio: number }).raio}px`)
  })

  it('quando as fontes terminam de carregar os itens mudam de largura, e o arco é refeito', async () => {
    larguraDaCaixa = 1000
    const { container } = montar()
    expect(caixa(container)).toHaveAttribute('data-modo', 'arco')
    // A fonte de reserva era estreita; a Sora, larga: "Síndrome do encarceramento" passa a 330 px.
    medidasNoArco = NO_ARCO.map((m, i) => (i === 4 ? { largura: 330, altura: 53 } : m))
    expect(ouvintesDeFonte.length).toBeGreaterThan(0)
    act(() => ouvintesDeFonte.forEach((cb) => cb()))
    await waitFor(() => expect(caixa(container)).toHaveAttribute('data-modo', 'lista'))
  })
})
