import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Entrar from './Entrar'
import { ApiError } from '@/services/api'
import { motivoDoLinkNaUrl } from '@/utils/linkDeEmail'

/* ============================================================
   /entrar também é o destino do link de confirmação do cadastro. Com a
   sessão aberta pela URL, segue para /conta (que leva a conta sem
   inscrição para /beta). Link vencido volta com o motivo na URL, e login
   de e-mail não confirmado oferece o reenvio do link.
   ============================================================ */

const { sessao, signIn, reenviar } = vi.hoisted(() => ({
  sessao: { authenticated: false, loading: false },
  signIn: vi.fn(),
  reenviar: vi.fn(async (_email: string) => {}),
}))

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ ...sessao, signIn }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, reenviarConfirmacao: reenviar }
})

function montar() {
  return render(
    <MemoryRouter initialEntries={['/entrar']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/conta" element={<p>painel da conta</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function preencher(email = 'maria@exemplo.com.br', senha = 'segredo123') {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessao.authenticated = false
  sessao.loading = false
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('<Entrar />', () => {
  it('quem chega já autenticado (link de confirmação) segue direto para o painel', async () => {
    sessao.authenticated = true
    montar()
    expect(await screen.findByText('painel da conta')).toBeInTheDocument()
  })

  it('login certo vai para /conta', async () => {
    signIn.mockResolvedValueOnce(undefined)
    montar()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('painel da conta')).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledWith('maria@exemplo.com.br', 'segredo123')
  })

  it('e-mail não confirmado: mostra o motivo e oferece reenviar o link para o e-mail digitado', async () => {
    signIn.mockRejectedValueOnce(
      new ApiError({ message: 'Email not confirmed', status: 400, code: 'email_not_confirmed' }),
    )
    montar()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText(/ainda não foi confirmado/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reenviar o link de confirmação/ }))

    await waitFor(() => expect(reenviar).toHaveBeenCalledWith('maria@exemplo.com.br'))
    expect(await screen.findByText(/Enviamos um novo link/)).toBeInTheDocument()
  })

  it('senha errada não oferece reenvio', async () => {
    signIn.mockRejectedValueOnce(new ApiError({ message: 'Invalid login credentials', status: 400 }))
    montar()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reenviar/ })).not.toBeInTheDocument()
  })

  it('link de confirmação vencido: diz o motivo acima do formulário', () => {
    window.history.replaceState(
      null,
      '',
      '/entrar#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    )
    montar()

    expect(screen.getByText(/O link expirou\./)).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
  })
})

describe('motivoDoLinkNaUrl', () => {
  it('lê o erro do fragmento ou da query e traduz os casos conhecidos', () => {
    expect(motivoDoLinkNaUrl({ hash: '', search: '' })).toBeNull()
    expect(motivoDoLinkNaUrl({ hash: '#access_token=abc&type=signup', search: '' })).toBeNull()
    expect(
      motivoDoLinkNaUrl({ hash: '#error=access_denied&error_code=otp_expired', search: '' }),
    ).toBe('O link expirou.')
    expect(
      motivoDoLinkNaUrl({
        hash: '',
        search: '?error=access_denied&error_description=Email+link+is+invalid+or+has+expired',
      }),
    ).toBe('O link é inválido ou já expirou.')
    expect(motivoDoLinkNaUrl({ hash: '#error=server_error', search: '' })).toBe('O link não é válido.')
  })
})
