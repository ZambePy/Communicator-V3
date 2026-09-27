import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { AnimatedHeadline } from './AnimatedHeadline'

/* O título animado sobe palavra por palavra, mas o texto continua sendo o
   título: com espaços, para copiar, buscar, traduzir e ler em voz alta. */

describe('<AnimatedHeadline />', () => {
  it('o texto do título mantém os espaços entre as palavras', () => {
    const { container } = render(<AnimatedHeadline as="h1" text="Política de privacidade" />)
    expect(container.querySelector('h1')!.textContent).toBe('Política de privacidade')
  })

  it('a palavra destacada continua marcada', () => {
    const { container } = render(<AnimatedHeadline text="Fale com quem construiu" highlight={['construiu']} />)
    expect(container.querySelector('.gradient-text')!.textContent).toBe('construiu')
  })
})
