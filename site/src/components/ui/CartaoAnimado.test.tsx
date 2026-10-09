import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CartaoAnimado } from './CartaoAnimado'

/* ============================================================
   Cartão 3D da tela de pagamento: acompanha o que se digita, vira para o
   verso no código de segurança e marca o estado da confirmação. O verso
   nunca mostra os dígitos do código, só um ponto por dígito.
   ============================================================ */

const vazio = { numero: '', titular: '', validade: '', digitosCvv: 0, bandeira: 'Visa' }

describe('CartaoAnimado', () => {
  it('mostra os marcadores enquanto nada foi digitado', () => {
    const { container } = render(<CartaoAnimado {...vazio} />)
    expect(container.textContent).toContain('•••• •••• •••• ••••')
    expect(container.textContent).toContain('NOME NO CARTÃO')
    expect(container.textContent).toContain('MM/AA')
    // sem número ainda, a marca IrisFlow fica no lugar da bandeira
    expect(container.querySelector('.cartao3d__bandeira')).toHaveTextContent('IrisFlow')
    expect(container.querySelector('.cartao3d__cvv')).toHaveTextContent('CVV')
  })

  it('acompanha o que foi digitado', () => {
    const { container } = render(
      <CartaoAnimado {...vazio} numero="4111 1111 1111 1111" titular="Maria Souza" validade="12/30" />,
    )
    expect(container.querySelector('.cartao3d__numero')).toHaveTextContent('4111 1111 1111 1111')
    expect(container.querySelector('.cartao3d__bandeira')).toHaveTextContent('Visa')
    expect(container.textContent).toContain('Maria Souza')
    expect(container.textContent).toContain('12/30')
  })

  it('no verso mostra um ponto por dígito do código, nunca os dígitos', () => {
    const { container } = render(<CartaoAnimado {...vazio} digitosCvv={3} />)
    expect(container.querySelector('.cartao3d__cvv')?.textContent).toBe('•••')
  })

  it('vira quando pedido, marca o estado e fica fora do leitor de tela', () => {
    const { container, rerender } = render(<CartaoAnimado {...vazio} />)
    const cartao = container.firstElementChild as HTMLElement
    expect(cartao).not.toHaveClass('is-virado')
    expect(cartao).toHaveClass('cartao3d--parado')
    expect(cartao).toHaveAttribute('aria-hidden', 'true')

    rerender(<CartaoAnimado {...vazio} virado estado="processando" />)
    expect(cartao).toHaveClass('is-virado')
    expect(cartao).toHaveClass('cartao3d--processando')
  })
})
