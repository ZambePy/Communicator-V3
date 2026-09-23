import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Contato from './Contato'

const { enviar } = vi.hoisted(() => ({ enviar: vi.fn(async () => {}) }))

vi.mock('@/services/api', () => ({ sendContactMessage: enviar }))

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Contato />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  enviar.mockClear()
})

describe('<Contato /> — validação em tempo real', () => {
  it('o botão de enviar fica desabilitado até tudo estar válido', () => {
    montar()
    const enviarBtn = screen.getByRole('button', { name: 'Enviar mensagem' })
    expect(enviarBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria Souza' } })
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'maria@exemplo.com.br' } })
    fireEvent.change(screen.getByLabelText('Você é'), { target: { value: 'familiar' } })
    expect(enviarBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Mensagem'), {
      target: { value: 'Minha mãe tem ELA e queria saber se ela consegue usar.' },
    })
    expect(enviarBtn).toBeEnabled()
  })

  it('mostra o erro ao sair do campo, com aria-invalid e aria-describedby', () => {
    montar()
    const email = screen.getByLabelText('E-mail')
    fireEvent.change(email, { target: { value: 'maria@' } })
    // enquanto digita (antes da pausa), nada de erro piscando
    expect(screen.queryByText(/E-mail inválido/)).not.toBeInTheDocument()

    fireEvent.blur(email)
    const erro = screen.getByText(/E-mail inválido/)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email.getAttribute('aria-describedby')).toContain(erro.id)

    // e some assim que o valor fica certo
    fireEvent.change(email, { target: { value: 'maria@exemplo.com.br' } })
    expect(screen.queryByText(/E-mail inválido/)).not.toBeInTheDocument()
    expect(email).toHaveAttribute('aria-invalid', 'false')
  })

  it('também avisa depois de uma pausa na digitação, sem precisar sair do campo', () => {
    vi.useFakeTimers()
    try {
      montar()
      fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'oi' } })
      act(() => {
        vi.advanceTimersByTime(800)
      })
      expect(screen.getByText('Conte um pouco mais: faltam 13 caracteres.')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('tem link para a política de privacidade junto do envio', () => {
    montar()
    expect(screen.getByRole('link', { name: 'política de privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    )
  })
})
