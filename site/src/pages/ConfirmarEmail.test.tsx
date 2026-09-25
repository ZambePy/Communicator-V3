import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ConfirmarEmail from './ConfirmarEmail'
import { ApiError, type PerfilBasico } from '@/services/api'

/* ============================================================
   /confirmar-email — o link do e-mail abre a sessão no aparelho do clique
   (token_hash → verifyOtp), agradece e mostra o próximo passo. Link
   vencido explica e oferece entrar ou pedir outro; aberta sem link, diz o
   que fazer.
   ============================================================ */

const perfil: PerfilBasico = {
  buyerName: 'Maria Aparecida Souza',
  email: 'maria@exemplo.com.br',
  phone: '',
  newsletter: true,
  createdAt: '2026-09-24T22:37:43Z',
  emailConfirmedAt: '2026-09-24T22:38:02Z',
}

const { sessao, refresh, apiFake } = vi.hoisted(() => ({
  sessao: { authenticated: false, loading: false, account: null as unknown },
  refresh: vi.fn(async () => {}),
  apiFake: {
    verificar: vi.fn(async (_hash: string, _tipo: string) => {}),
    reenviar: vi.fn(async (_email: string) => {}),
  },
}))

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ ...sessao, refresh }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return {
    ...real,
    verificarLinkDoEmail: apiFake.verificar,
    reenviarConfirmacao: apiFake.reenviar,
    fetchPerfilBasico: async () => perfil,
  }
})

function Endereco() {
  const l = useLocation()
  return <output data-testid="endereco">{l.pathname + l.search}</output>
}

function montar(endereco: string) {
  return render(
    <MemoryRouter initialEntries={[endereco]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="/confirmar-email"
          element={
            <>
              <ConfirmarEmail />
              <Endereco />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(sessao, { authenticated: false, loading: false, account: null })
  window.scrollTo = vi.fn() as never
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('<ConfirmarEmail />', () => {
  it('token_hash: verifica uma vez, relê a sessão, agradece pelo nome e leva à pesquisa', async () => {
    montar('/confirmar-email?token_hash=abc123&type=email')

    expect(await screen.findByRole('heading', { name: 'Obrigado, Maria! Seu e-mail foi confirmado.' })).toBeInTheDocument()
    expect(apiFake.verificar).toHaveBeenCalledTimes(1)
    expect(apiFake.verificar).toHaveBeenCalledWith('abc123', 'email')
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByText(/conectado\(a\) neste aparelho/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Responder a pesquisa rápida' })).toHaveAttribute('href', '/beta')
    expect(screen.getByRole('link', { name: 'Fazer depois e ver meu perfil' })).toHaveAttribute('href', '/perfil')
    // o token sai do endereço: um F5 não tenta verificar de novo
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/confirmar-email$/))
  })

  it('tipo desconhecido no endereço vira "email"', async () => {
    montar('/confirmar-email?token_hash=abc&type=qualquer')
    await screen.findByRole('heading', { name: /Seu e-mail foi confirmado/ })
    expect(apiFake.verificar).toHaveBeenCalledWith('abc', 'email')
  })

  it('inscrição já completa: o próximo passo é o perfil', async () => {
    sessao.account = { id: 'sub-1' }
    montar('/confirmar-email?token_hash=abc&type=email')
    await screen.findByRole('heading', { name: /Seu e-mail foi confirmado/ })
    expect(screen.getByRole('link', { name: 'Ver meu perfil' })).toHaveAttribute('href', '/perfil')
    expect(screen.queryByRole('link', { name: 'Responder a pesquisa rápida' })).not.toBeInTheDocument()
  })

  it('link vencido: explica, oferece entrar e pedir um link novo', async () => {
    apiFake.verificar.mockRejectedValueOnce(
      new ApiError({ message: 'Email link is invalid or has expired', status: 403, code: 'otp_expired' }),
    )
    montar('/confirmar-email?token_hash=velho&type=email')

    expect(await screen.findByRole('heading', { name: 'Este link não vale mais' })).toBeInTheDocument()
    expect(screen.getByText(/O link expirou ou já foi usado\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar na conta' })).toHaveAttribute('href', '/entrar')

    fireEvent.change(screen.getByLabelText('E-mail da conta'), { target: { value: 'maria@exemplo.com.br' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar um link novo' }))
    })
    expect(apiFake.reenviar).toHaveBeenCalledWith('maria@exemplo.com.br')
    expect(await screen.findByText(/um link novo chega em instantes/)).toBeInTheDocument()
  })

  it('link do modelo padrão do Supabase (sessão já lida do endereço): agradece', async () => {
    sessao.authenticated = true
    montar('/confirmar-email')
    expect(await screen.findByRole('heading', { name: /Seu e-mail foi confirmado/ })).toBeInTheDocument()
    expect(apiFake.verificar).not.toHaveBeenCalled()
  })

  it('link vencido no modelo padrão (#error=…), sem sessão: explica', () => {
    window.history.replaceState(null, '', '/confirmar-email#error=access_denied&error_code=otp_expired')
    montar('/confirmar-email')
    expect(screen.getByRole('heading', { name: 'Este link não vale mais' })).toBeInTheDocument()
    expect(screen.getByText(/O link expirou\./)).toBeInTheDocument()
  })

  it('link repetido de quem já está logado: diz que o e-mail já está confirmado', () => {
    sessao.authenticated = true
    window.history.replaceState(null, '', '/confirmar-email#error=access_denied&error_code=otp_expired')
    montar('/confirmar-email')
    expect(screen.getByRole('heading', { name: 'Seu e-mail já está confirmado.' })).toBeInTheDocument()
  })

  it('aberta sem link e sem sessão: diz para abrir o link do e-mail', () => {
    montar('/confirmar-email')
    expect(screen.getByRole('heading', { name: 'Abra o link que enviamos por e-mail' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar na conta' })).toHaveAttribute('href', '/entrar')
  })
})
