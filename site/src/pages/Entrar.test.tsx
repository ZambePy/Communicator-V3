import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Entrar from './Entrar'
import { ApiError } from '@/services/api'
import { motivoDoLinkNaUrl } from '@/utils/linkDeEmail'

/* ============================================================
   /entrar leva cada um à etapa em que está: sem a pesquisa da beta
   respondida → /beta (a pesquisa); com ela → /perfil. `?email=` preenche o
   e-mail (botão "Já confirmei, continuar aqui"). Links de confirmação
   antigos ainda caem aqui: com sessão, seguem; vencidos, mostram o motivo.
   Login de e-mail não confirmado oferece o reenvio do link.
   ============================================================ */

const { sessao, signIn, reenviar } = vi.hoisted(() => ({
  sessao: { authenticated: false, loading: false, account: null as unknown },
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

function montar(endereco = '/entrar') {
  return render(
    <MemoryRouter initialEntries={[endereco]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/perfil" element={<p>meu perfil</p>} />
        <Route path="/beta" element={<p>pesquisa da beta</p>} />
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
  sessao.account = null
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('<Entrar />', () => {
  it('já autenticado sem a pesquisa (link antigo de confirmação) segue para a pesquisa da beta', async () => {
    sessao.authenticated = true
    montar()
    expect(await screen.findByText('pesquisa da beta')).toBeInTheDocument()
  })

  it('já autenticado com a inscrição completa segue para o perfil', async () => {
    sessao.authenticated = true
    sessao.account = { id: 'sub-1' }
    montar()
    expect(await screen.findByText('meu perfil')).toBeInTheDocument()
  })

  it('login de quem já respondeu a pesquisa vai para /perfil', async () => {
    signIn.mockResolvedValueOnce({ id: 'sub-1' })
    montar()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('meu perfil')).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledWith('maria@exemplo.com.br', 'segredo123')
  })

  it('login de quem ainda não respondeu a pesquisa vai para /beta', async () => {
    signIn.mockResolvedValueOnce(null)
    montar()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('pesquisa da beta')).toBeInTheDocument()
  })

  it('?email= preenche o e-mail (vindo do "Já confirmei, continuar aqui")', () => {
    montar('/entrar?email=maria%40exemplo.com.br')
    expect(screen.getByLabelText('E-mail')).toHaveValue('maria@exemplo.com.br')
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
