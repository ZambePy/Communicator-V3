import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Reveal } from './Reveal'

describe('<Reveal />', () => {
  it('marca o bloco para a entrada ao rolar, com o tipo e o atraso', () => {
    const { container } = render(
      <Reveal as="li" anim="zoom" delay={120} className="x" id="a">
        oi
      </Reveal>,
    )
    const el = container.querySelector('li')!
    expect(el).toHaveClass('reveal', 'x')
    expect(el).toHaveAttribute('data-reveal', 'zoom')
    expect(el).toHaveAttribute('id', 'a')
    expect(el.style.getPropertyValue('--reveal-atraso')).toBe('120ms')
  })

  it('sem o observador (sem IntersectionObserver), o conteúdo nunca fica escondido', () => {
    expect(document.documentElement).not.toHaveClass('js-reveal')
  })
})
