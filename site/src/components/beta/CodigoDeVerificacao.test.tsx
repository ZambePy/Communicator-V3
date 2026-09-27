import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CodigoDeVerificacao } from './CodigoDeVerificacao'

/* O campo do código: só dígitos, confere sozinho no quarto, avisa o erro,
   e o reenvio respeita o minuto entre e-mails do Supabase. */

const { conferir } = vi.hoisted(() => ({ conferir: vi.fn() }))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, conferirCodigo: conferir }
})

afterEach(() => {
  vi.useRealTimers()
  conferir.mockReset()
})

describe('<CodigoDeVerificacao />', () => {
  it('ignora letras e só confere com os 4 dígitos', async () => {
    conferir.mockResolvedValue('hash')
    const aoConfirmar = vi.fn(async () => {})
    render(<CodigoDeVerificacao email="maria@exemplo.com" aoConfirmar={aoConfirmar} aoReenviar={vi.fn()} />)
    const campo = screen.getByLabelText('Código de 4 dígitos')
    fireEvent.change(campo, { target: { value: '4a8' } })
    expect(campo).toHaveValue('48')
    expect(conferir).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.change(campo, { target: { value: '48291' } })
    })
    expect(conferir).toHaveBeenCalledWith('maria@exemplo.com', '4829')
    await waitFor(() => expect(aoConfirmar).toHaveBeenCalledWith('hash'), { timeout: 2500 })
  })

  it('bloqueio por tentativas aparece como alerta', async () => {
    conferir.mockRejectedValue(new Error('Muitas tentativas com o código errado.'))
    render(<CodigoDeVerificacao email="maria@exemplo.com" aoConfirmar={vi.fn()} aoReenviar={vi.fn()} />)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Código de 4 dígitos'), { target: { value: '1111' } })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas')
  })

  it('código certo mas a sessão não abre (rede caiu): explica, limpa e a nova tentativa refaz tudo', async () => {
    conferir.mockResolvedValue('hash')
    const aoConfirmar = vi
      .fn(async (_hash: string) => {})
      .mockRejectedValueOnce(new Error('Sem conexão com o servidor. Confira a internet e tente de novo.'))
    render(<CodigoDeVerificacao email="maria@exemplo.com" aoConfirmar={aoConfirmar} aoReenviar={vi.fn()} />)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Código de 4 dígitos'), { target: { value: '4829' } })
    })
    expect(await screen.findByRole('alert', {}, { timeout: 2500 })).toHaveTextContent('Sem conexão')
    // nunca disse "E-mail confirmado" antes de a sessão abrir
    expect(screen.queryByText(/E-mail confirmado/)).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Código de 4 dígitos')).toHaveValue(''))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Código de 4 dígitos'), { target: { value: '4829' } })
    })
    await waitFor(() => expect(aoConfirmar).toHaveBeenCalledTimes(2), { timeout: 2500 })
  })

  it('código vencido: diz que venceu e pede outro, em vez de "link"', async () => {
    const { ApiError } = await import('@/services/api')
    conferir.mockResolvedValue('hash')
    const aoConfirmar = vi.fn(async () => {
      throw new ApiError({ code: 'otp_expired', status: 403, message: 'Email link is invalid or has expired' })
    })
    render(<CodigoDeVerificacao email="maria@exemplo.com" aoConfirmar={aoConfirmar} aoReenviar={vi.fn()} />)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Código de 4 dígitos'), { target: { value: '4829' } })
    })
    expect(await screen.findByRole('alert', {}, { timeout: 2500 })).toHaveTextContent(/Este código venceu/)
  })

  it('código recusado com outro caminho resolvido (confirmado em outro aparelho): sem erro', async () => {
    const { CodigoIncorreto } = await import('@/services/api')
    conferir.mockRejectedValue(new CodigoIncorreto())
    const aoRecusar = vi.fn(async () => true)
    render(
      <CodigoDeVerificacao email="maria@exemplo.com" aoConfirmar={vi.fn()} aoRecusar={aoRecusar} aoReenviar={vi.fn()} />,
    )
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Código de 4 dígitos'), { target: { value: '4829' } })
    })
    await waitFor(() => expect(aoRecusar).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('o reenvio espera 1 minuto e depois manda um código novo, recomeçando a contagem', async () => {
    vi.useFakeTimers()
    const aoReenviar = vi.fn(async () => {})
    render(<CodigoDeVerificacao email="maria@exemplo.com" aoConfirmar={vi.fn()} aoReenviar={aoReenviar} />)
    expect(screen.getByText(/pedir outro em 1:00/)).toBeInTheDocument()
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar outro código' }))
    })
    expect(aoReenviar).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Enviamos um código novo para maria@exemplo.com/)).toBeInTheDocument()
    expect(screen.getByText(/pedir outro em 1:00/)).toBeInTheDocument()
  })
})
