import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RecuperarSenha from './RecuperarSenha'

/* Revisão final (22/10/2026): o botão "Enviar link" ficava desabilitado com o e-mail em branco
   ou mal escrito. Um botão desabilitado não recebe foco, o Enter no campo não envia e ninguém
   é avisado do motivo — o mesmo defeito que o /entrar, a /beta e o /contato já corrigiram
   (P2-10). Aqui o botão fica ativo e, apertado, diz o que falta e leva o foco ao campo. */

const { pedir } = vi.hoisted(() => ({
  pedir: vi.fn(async (_email: string, _url: string) => {}),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, requestPasswordReset: pedir }
})

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RecuperarSenha />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<RecuperarSenha />', () => {
  it('o botão não fica apagado: com o e-mail em branco, diz o que falta e leva o foco ao campo', () => {
    montar()
    const botao = screen.getByRole('button', { name: 'Enviar link' })
    expect(botao).toBeEnabled()

    fireEvent.click(botao)

    expect(screen.getByRole('status')).toHaveTextContent('Para enviar o link, falta preencher ou corrigir: e-mail.')
    expect(screen.getByLabelText('E-mail')).toHaveFocus()
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')
    expect(pedir).not.toHaveBeenCalled()
  })

  it('o Enter no campo vazio também responde (formulário enviado, não botão desabilitado)', () => {
    const { container } = montar()
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    expect(screen.getByRole('status')).toHaveTextContent('falta preencher ou corrigir: e-mail')
    expect(pedir).not.toHaveBeenCalled()
  })

  it('e-mail mal escrito: não envia e aponta o campo', () => {
    montar()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'maria@' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(screen.getByRole('status')).toHaveTextContent('falta preencher ou corrigir: e-mail')
    expect(screen.getByLabelText('E-mail')).toHaveFocus()
    expect(pedir).not.toHaveBeenCalled()
  })

  it('com o e-mail certo, pede o link e mostra a mensagem que não revela se a conta existe', async () => {
    montar()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'maria@exemplo.com.br' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    })
    expect(pedir).toHaveBeenCalledTimes(1)
    expect(pedir.mock.calls[0][0]).toBe('maria@exemplo.com.br')
    expect(pedir.mock.calls[0][1]).toMatch(/\/nova-senha$/)
    expect(screen.getByText(/Se existir uma conta com o e-mail/)).toBeInTheDocument()
  })
})
