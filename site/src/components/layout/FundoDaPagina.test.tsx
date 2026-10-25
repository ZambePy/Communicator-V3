import { afterEach, describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { MOVIMENTO_REDUZIDO, responderMidia } from '@/test/observador'
import { FundoDaPagina, FundoDaPaginaProvider } from './FundoDaPagina'
import { PageHead } from './PageHead'

/* O fundo vivo do topo das páginas internas. A página só diz
   `<FundoDaPagina />` (e a variante); quem desenha é a faixa de abertura
   (PageHead), por dentro dela, atrás do texto. */

let restaurarMidia = () => {}
afterEach(() => {
  restaurarMidia()
  restaurarMidia = () => {}
})

const fundo = (c: HTMLElement) => c.querySelector<HTMLElement>('.page-head > .atmosfera')

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
    expect(container.querySelector('.atmosfera')).toBeNull()
  })

  it('com FundoDaPagina, o fundo vivo fica dentro da faixa, decorativo e antes do texto', () => {
    const { container } = render(pagina())
    const f = fundo(container)!
    expect(f).not.toBeNull()
    expect(f).toHaveAttribute('aria-hidden', 'true')
    expect(f.querySelector('a, button, input, [tabindex], video, canvas')).toBeNull()
    const texto = container.querySelector('.page-head__inner')!
    expect(f.compareDocumentPosition(texto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('o título e o texto da abertura continuam os mesmos e acessíveis', () => {
    const { getByRole, getByText } = render(pagina())
    expect(getByRole('heading', { level: 1, name: 'Planos' })).toBeInTheDocument()
    expect(getByText('O preço, sem rodeio.')).toBeInTheDocument()
  })

  it('a variante padrão usa o fundo "topo", com partículas; a calma, o "calmo", sem partículas', () => {
    const padrao = render(pagina('padrao'))
    expect(fundo(padrao.container)).toHaveClass('atmosfera--topo')
    expect(padrao.container.querySelectorAll('.atmosfera__particulas span').length).toBeGreaterThan(0)
    padrao.unmount()

    const calmo = render(pagina('calmo'))
    expect(fundo(calmo.container)).toHaveClass('atmosfera--calmo')
    expect(calmo.container.querySelector('.atmosfera__particulas')).toBeNull()
  })

  it('sem variante, vale a padrão', () => {
    const { container } = render(pagina())
    expect(fundo(container)).toHaveClass('atmosfera--topo')
  })

  it('com movimento reduzido: sem partículas', () => {
    restaurarMidia = responderMidia(MOVIMENTO_REDUZIDO)
    const { container } = render(pagina('padrao'))
    expect(fundo(container)).not.toBeNull()
    expect(container.querySelector('.atmosfera__particulas')).toBeNull()
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

  it('com a faixa de abertura, não há camada solta: só o fundo de dentro da faixa', () => {
    const { container } = render(pagina())
    expect(container.querySelector('.fundo-da-pagina')).toBeNull()
    expect(container.querySelectorAll('.atmosfera')).toHaveLength(1)
  })

  it('sem faixa de abertura (formulário, fluxo), o fundo vai numa camada solta, decorativa', () => {
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
    expect(solta.querySelector('.atmosfera')).toHaveClass('atmosfera--calmo')
    expect(solta.querySelector('a, button, input, [tabindex]')).toBeNull()
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
    expect(container.querySelector('.atmosfera')).toBeNull()
  })
})
