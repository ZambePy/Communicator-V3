import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { CursorDeFixacao } from './CursorDeFixacao'

/* O anel de fixação que acompanha o ponteiro (v3, 21/10/2026): só com mouse
   (ponteiro fino), nunca no toque e nunca com movimento reduzido. Ele enche
   sobre o que é clicável — o gesto do clique pelo olhar. A seta do sistema
   continua lá: quem usa um cursor ampliado não pode perdê-lo. */

const matchMediaOriginal = window.matchMedia

function midia({ fino, reduzido }: { fino: boolean; reduzido: boolean }) {
  window.matchMedia = ((q: string) => ({
    matches: (q.includes('pointer: fine') && fino) || (q.includes('reduce') && reduzido),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = matchMediaOriginal
})

const anel = () => document.body.querySelector<HTMLElement>('.v3-cursor')

describe('<CursorDeFixacao />', () => {
  it('no toque (ponteiro grosso), nada', () => {
    midia({ fino: false, reduzido: false })
    render(<CursorDeFixacao />)
    expect(anel()).toBeNull()
  })

  it('com movimento reduzido, nada', () => {
    midia({ fino: true, reduzido: true })
    render(<CursorDeFixacao />)
    expect(anel()).toBeNull()
  })

  it('com mouse: o anel mora no body (por cima do cabeçalho), decorativo, e enche sobre o clicável', () => {
    midia({ fino: true, reduzido: false })
    const { getByRole, getByText } = render(
      <div>
        <CursorDeFixacao />
        <button type="button">Baixar</button>
        <a href="/planos" className="btn btn--chamada">
          Entrar
        </a>
        <p>Texto comum</p>
      </div>,
    )
    const el = anel()!
    expect(el).not.toBeNull()
    expect(el.parentElement).toBe(document.body)
    expect(el).toHaveAttribute('aria-hidden', 'true')

    fireEvent.pointerOver(getByRole('button', { name: 'Baixar' }))
    expect(el).toHaveClass('is-sobre')

    // O botão de chamada já tem o próprio aro: o anel só cresce, sem encher de novo.
    fireEvent.pointerOver(getByText('Entrar'))
    expect(el).not.toHaveClass('is-sobre')
    expect(el).toHaveClass('is-sobre-chamada')

    fireEvent.pointerOver(getByText('Texto comum'))
    expect(el).not.toHaveClass('is-sobre')
    expect(el).not.toHaveClass('is-sobre-chamada')
  })

  it('o toque, mesmo num computador com mouse, esconde o anel', () => {
    midia({ fino: true, reduzido: false })
    render(<CursorDeFixacao />)
    const el = anel()!
    fireEvent.pointerMove(document, { pointerType: 'mouse', clientX: 10, clientY: 10 })
    expect(el).toHaveClass('is-visivel')
    fireEvent.pointerMove(document, { pointerType: 'touch', clientX: 20, clientY: 20 })
    expect(el).not.toHaveClass('is-visivel')
  })
})
