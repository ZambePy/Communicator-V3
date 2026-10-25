import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MOVIMENTO_REDUZIDO, responderMidia } from '@/test/observador'
import { FRASES_DA_VOZ, VozQueSai } from './VozQueSai'

let restaurar = () => {}
afterEach(() => {
  restaurar()
  restaurar = () => {}
})

describe('<VozQueSai />', () => {
  it('é decoração (a frase de verdade está na chamada) e começa pela primeira frase', () => {
    const { container } = render(<VozQueSai />)
    const voz = container.querySelector('.voz')!
    expect(voz).toHaveAttribute('aria-hidden', 'true')
    expect(voz.querySelector('.voz__frase')).toHaveTextContent(FRASES_DA_VOZ[0])
    expect(voz.querySelector('a, button, input, [tabindex]')).toBeNull()
  })

  it('com movimento reduzido fica parada', () => {
    restaurar = responderMidia(MOVIMENTO_REDUZIDO)
    const { container } = render(<VozQueSai />)
    expect(container.querySelector('.voz')).toHaveClass('is-parada')
  })
})
