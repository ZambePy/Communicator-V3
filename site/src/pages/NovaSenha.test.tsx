import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import NovaSenha from './NovaSenha'
import { ApiError } from '@/services/api'

/* /nova-senha com o link novo (token_hash): a sessão de recuperação nasce
   aqui, no aparelho do clique; salvar leva ao perfil. */

const { sessao, refresh, apiFake } = vi.hoisted(() => ({
  sessao: { authenticated: false, loading: false },
  refresh: vi.fn(async () => {}),
  apiFake: {
    verificar: vi.fn(async (_hash: string, _tipo: string) => {}),
    trocar: vi.fn(async (_senha: string) => {}),
  },
}))

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ ...sessao, refresh }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, verificarLinkDoEmail: apiFake.verificar, updatePassword: apiFake.trocar }
})

function montar(endereco: string) {
  return render(
    <MemoryRouter initialEntries={[endereco]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/nova-senha" element={<NovaSenha />} />
        <Route path="/perfil" element={<p>meu perfil</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(sessao, { authenticated: false, loading: false })
})

describe('<NovaSenha /> com token_hash', () => {
  it('verifica o link de recuperação, mostra o formulário e, ao salvar, vai para o perfil', async () => {
    // a verificação abre a sessão (o contexto passa a dizer "autenticado")
    apiFake.verificar.mockImplementationOnce(async () => {
      sessao.authenticated = true
    })
    montar('/nova-senha?token_hash=rec123&type=recovery')

    const campo = await screen.findByLabelText('Nova senha')
    expect(apiFake.verificar).toHaveBeenCalledWith('rec123', 'recovery')
    expect(refresh).toHaveBeenCalled()

    fireEvent.change(campo, { target: { value: 'senhanova99' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'senhanova99' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
    })
    expect(apiFake.trocar).toHaveBeenCalledWith('senhanova99')
    expect(await screen.findByText('meu perfil')).toBeInTheDocument()
  })

  it('link de recuperação vencido: diz o motivo e oferece pedir outro', async () => {
    apiFake.verificar.mockRejectedValueOnce(
      new ApiError({ message: 'Email link is invalid or has expired', status: 403, code: 'otp_expired' }),
    )
    montar('/nova-senha?token_hash=velho&type=recovery')
    expect(await screen.findByText(/O link expirou ou já foi usado\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir outro link' })).toHaveAttribute('href', '/recuperar-senha')
  })

  it('sem token no endereço, não tenta verificar nada', () => {
    montar('/nova-senha')
    expect(apiFake.verificar).not.toHaveBeenCalled()
  })
})
