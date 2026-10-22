import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { MOVIMENTO_REDUZIDO, responderMidia } from '@/test/observador'
import { FundoDaPagina, FundoDaPaginaProvider } from './FundoDaPagina'
import { PageHead } from './PageHead'

/* O fundo das páginas internas (rodada 4, 21/10/2026): no topo de cada página
   interna, um motivo discreto dos 13 pontos da calibração, o mesmo sistema da
   abertura da home sem repetir a abertura. A página só diz `<FundoDaPagina />`
   (e a variante); quem desenha é a faixa de abertura (PageHead), por dentro
   dela, para os pontos ficarem entre o fundo da faixa e o texto. */

let restaurarMidia = () => {}
afterEach(() => {
  restaurarMidia()
  restaurarMidia = () => {}
  vi.useRealTimers()
})

const fundo = (c: HTMLElement) => c.querySelector<HTMLElement>('.page-head__fundo')
const pontos = (c: HTMLElement) => c.querySelectorAll('.v3-campo__ponto')

function pagina(variante?: 'padrao' | 'calmo') {
  return (
    <FundoDaPaginaProvider>
      <FundoDaPagina {...(variante ? { variante } : {})} />
      <PageHead title="Planos" lead="O preço, sem rodeio." />
    </FundoDaPaginaProvider>
  )
}

describe('<FundoDaPagina /> e <PageHead />', () => {
  it('sem FundoDaPagina, a abertura não desenha nada atrás do texto', () => {
    const { container } = render(
      <FundoDaPaginaProvider>
        <PageHead title="Planos" />
      </FundoDaPaginaProvider>,
    )
    expect(fundo(container)).toBeNull()
  })

  it('com FundoDaPagina, os 13 pontos da calibração ficam dentro da faixa, decorativos', () => {
    const { container } = render(pagina())
    const f = fundo(container)!
    expect(f).not.toBeNull()
    expect(f.closest('header.page-head')).not.toBeNull()
    expect(f).toHaveAttribute('aria-hidden', 'true')
    expect(pontos(container)).toHaveLength(13)
    expect(f.querySelector('a, button, input, [tabindex], video, canvas')).toBeNull()
    // o fundo vem ANTES do texto no DOM: o texto é pintado por cima
    const texto = container.querySelector('.page-head__inner')!
    expect(f.compareDocumentPosition(texto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('o título e o texto da abertura continuam os mesmos e acessíveis', () => {
    const { getByRole, getByText } = render(pagina())
    expect(getByRole('heading', { level: 1, name: 'Planos' })).toBeInTheDocument()
    expect(getByText('O preço, sem rodeio.')).toBeInTheDocument()
  })

  it('a variante padrão tem o anel de fixação (um aceno, no ponto do centro); a calma, não', () => {
    const padrao = render(pagina('padrao'))
    expect(fundo(padrao.container)!.querySelector('.v3-campo')).toHaveClass('v3-campo--topo', 'v3-campo--padrao')
    expect(padrao.container.querySelectorAll('.v3-campo__fixa')).toHaveLength(1)
    const centro = padrao.container.querySelector('.v3-campo__fixa')!.closest('.v3-campo__ponto') as HTMLElement
    expect(centro.style.getPropertyValue('--x')).toBe('50%')
    expect(centro.style.getPropertyValue('--y')).toBe('50%')
    padrao.unmount()

    const calmo = render(pagina('calmo'))
    expect(fundo(calmo.container)!.querySelector('.v3-campo')).toHaveClass('v3-campo--topo', 'v3-campo--calmo')
    expect(calmo.container.querySelectorAll('.v3-campo__fixa')).toHaveLength(0)
  })

  it('sem variante, vale a padrão', () => {
    const { container } = render(pagina())
    expect(container.querySelector('.v3-campo')).toHaveClass('v3-campo--padrao')
  })

  it('um momento só: depois da entrada não há temporizador nem ponto que respira', () => {
    vi.useFakeTimers()
    const { container } = render(pagina())
    expect(vi.getTimerCount()).toBe(0)
    act(() => void vi.advanceTimersByTime(20_000))
    expect(container.querySelectorAll('.is-respira')).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('com movimento reduzido: os 13 pontos parados, sem anel', () => {
    restaurarMidia = responderMidia(MOVIMENTO_REDUZIDO)
    const { container } = render(pagina('padrao'))
    expect(pontos(container)).toHaveLength(13)
    expect(container.querySelector('.v3-campo')).toHaveClass('is-parado')
    expect(container.querySelectorAll('.v3-campo__fixa')).toHaveLength(0)
  })

  it('a página que sai leva o fundo junto', () => {
    function Rota() {
      const [com, setCom] = useState(true)
      return (
        <FundoDaPaginaProvider>
          {com && <FundoDaPagina />}
          <PageHead title="X" />
          <button type="button" onClick={() => setCom(false)}>tirar</button>
        </FundoDaPaginaProvider>
      )
    }
    const { container, getByRole } = render(<Rota />)
    expect(fundo(container)).not.toBeNull()
    act(() => getByRole('button', { name: 'tirar' }).click())
    expect(fundo(container)).toBeNull()
  })

  it('com a faixa de abertura, não há camada solta: só os pontos de dentro da faixa', () => {
    const { container } = render(pagina())
    expect(container.querySelector('.fundo-da-pagina')).toBeNull()
    expect(container.querySelectorAll('.v3-campo')).toHaveLength(1)
  })

  it('sem faixa de abertura (formulário, fluxo), os pontos vão numa camada solta, decorativa', () => {
    const { container } = render(
      <FundoDaPaginaProvider>
        <FundoDaPagina variante="calmo" />
        <section>
          <h1>Entrar na sua conta</h1>
        </section>
      </FundoDaPaginaProvider>,
    )
    const solta = container.querySelector('.fundo-da-pagina')!
    expect(solta).not.toBeNull()
    expect(solta).toHaveAttribute('aria-hidden', 'true')
    expect(solta.querySelectorAll('.v3-campo__ponto')).toHaveLength(13)
    expect(solta.querySelector('.v3-campo')).toHaveClass('v3-campo--calmo')
    expect(solta.querySelector('a, button, input, [tabindex]')).toBeNull()
    expect(container.querySelector('.page-head__fundo')).toBeNull()
  })

  it('a camada solta some quando a página sai', () => {
    function Rota() {
      const [com, setCom] = useState(true)
      return (
        <FundoDaPaginaProvider>
          {com && <FundoDaPagina />}
          <button type="button" onClick={() => setCom(false)}>tirar</button>
        </FundoDaPaginaProvider>
      )
    }
    const { container, getByRole } = render(<Rota />)
    expect(container.querySelector('.fundo-da-pagina')).not.toBeNull()
    act(() => getByRole('button', { name: 'tirar' }).click())
    expect(container.querySelector('.fundo-da-pagina')).toBeNull()
  })

  it('fora do Layout (sem o provedor), FundoDaPagina não faz nada e não quebra', () => {
    const { container } = render(
      <>
        <FundoDaPagina variante="calmo" />
        <PageHead title="Sozinha" />
      </>,
    )
    expect(fundo(container)).toBeNull()
    expect(container.querySelector('.fundo-da-pagina')).toBeNull()
  })
})
