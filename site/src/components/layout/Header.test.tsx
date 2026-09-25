import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'

/* O menu: a aba Beta leva a etiqueta vermelha do lançamento até o dia e o
   selo "novo" depois; quem tem sessão vê "Meu perfil" — também antes de
   responder a pesquisa, quando ainda não há conta completa. */

const { sessao, apiFake } = vi.hoisted(() => ({
  sessao: { authenticated: false, loading: false, account: null as unknown },
  apiFake: { programa: null as BetaProgram | null },
}))

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => sessao,
}))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA }
})

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  esquecerBetaProgram()
  Object.assign(sessao, { authenticated: false, loading: false, account: null })
  apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
})

describe('<Header />', () => {
  it('antes do lançamento: a aba Beta leva a etiqueta vermelha com o dia, lida por extenso', async () => {
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    const beta = within(nav).getByRole('link', { name: /Beta/ })
    await within(beta).findByText('10/11')
    expect(beta.querySelector('.etiqueta-lancamento')).not.toBeNull()
    expect(within(beta).getByText('Lançamento em 10 de novembro')).toHaveClass('sr-only')
    expect(within(beta).queryByText('novo')).not.toBeInTheDocument()
  })

  it('depois do lançamento: volta o selo "novo"', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(await within(nav).findByText('novo')).toBeInTheDocument()
    expect(nav.querySelector('.etiqueta-lancamento')).toBeNull()
  })

  it('sem sessão: "Entrar" e "Entrar na beta"', () => {
    montar()
    expect(screen.getAllByRole('link', { name: 'Entrar' })[0]).toHaveAttribute('href', '/entrar')
    expect(screen.getAllByRole('link', { name: 'Entrar na beta' })[0]).toHaveAttribute('href', '/beta')
    expect(screen.queryByRole('link', { name: 'Meu perfil' })).not.toBeInTheDocument()
  })

  it('com sessão, mesmo antes da pesquisa (sem conta): "Meu perfil" no lugar de "Entrar"', () => {
    sessao.authenticated = true
    montar()
    expect(screen.getAllByRole('link', { name: 'Meu perfil' })[0]).toHaveAttribute('href', '/perfil')
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
  })

  it('enquanto a sessão carrega, nenhum dos dois', () => {
    sessao.loading = true
    montar()
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Meu perfil' })).not.toBeInTheDocument()
  })
})
