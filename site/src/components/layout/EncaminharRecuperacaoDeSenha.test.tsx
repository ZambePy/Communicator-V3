import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AccountProvider } from '@/context/AccountContext'
import { EncaminharRecuperacaoDeSenha } from './EncaminharRecuperacaoDeSenha'

/* ============================================================
   O link do e-mail de nova senha pode cair em qualquer página (a Site
   URL do painel, quando o redirectTo não está nas Redirect URLs). O
   evento PASSWORD_RECOVERY tem de levar a pessoa a /nova-senha, e só
   uma vez: depois de chegar lá, navegar para outra página é livre.
   ============================================================ */

type Ouvinte = (evento: string) => void

const { supabaseFake, ouvintes, fetchAccount } = vi.hoisted(() => {
  const ouvintes: Array<(evento: string) => void> = []
  const supabaseFake = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
      onAuthStateChange: vi.fn((cb: (evento: string) => void) => {
        ouvintes.push(cb)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
  }
  const fetchAccount = vi.fn(async () => null)
  return { supabaseFake, ouvintes, fetchAccount }
})

vi.mock('@/lib/supabase', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/supabase')>()
  return { ...real, isSupabaseConfigured: true, supabase: supabaseFake, client: () => supabaseFake }
})

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchAccount }
})

function Onde() {
  return <span data-testid="rota">{useLocation().pathname}</span>
}

function montar(inicial: string) {
  return render(
    <AccountProvider>
      <MemoryRouter initialEntries={[inicial]}>
        <EncaminharRecuperacaoDeSenha />
        <Onde />
        <Routes>
          <Route path="/" element={<Link to="/conta">ir para a conta</Link>} />
          <Route path="/nova-senha" element={<Link to="/conta">ir para a conta</Link>} />
          <Route path="/conta" element={<p>conta</p>} />
          <Route path="/planos" element={<p>planos</p>} />
        </Routes>
      </MemoryRouter>
    </AccountProvider>,
  )
}

/** Emite o evento e deixa a releitura da sessão (assíncrona) terminar dentro do act. */
const emitir = (evento: string) =>
  act(async () => {
    for (const o of ouvintes as Ouvinte[]) o(evento)
    await new Promise((r) => setTimeout(r, 0))
  })

const rota = () => screen.getByTestId('rota').textContent

beforeEach(() => {
  vi.clearAllMocks()
  ouvintes.length = 0
})

describe('EncaminharRecuperacaoDeSenha', () => {
  it('PASSWORD_RECOVERY na página inicial (Site URL) leva a /nova-senha', async () => {
    montar('/')
    await waitFor(() => expect(ouvintes.length).toBeGreaterThan(0))
    expect(rota()).toBe('/')

    await emitir('PASSWORD_RECOVERY')

    await waitFor(() => expect(rota()).toBe('/nova-senha'))
  })

  it('de qualquer outra página também', async () => {
    montar('/planos')
    await waitFor(() => expect(ouvintes.length).toBeGreaterThan(0))

    await emitir('PASSWORD_RECOVERY')

    await waitFor(() => expect(rota()).toBe('/nova-senha'))
  })

  it('encaminha uma vez só: depois de chegar, sair de /nova-senha é livre', async () => {
    montar('/')
    await waitFor(() => expect(ouvintes.length).toBeGreaterThan(0))
    await emitir('PASSWORD_RECOVERY')
    await waitFor(() => expect(rota()).toBe('/nova-senha'))

    act(() => screen.getByText('ir para a conta').click())

    await waitFor(() => expect(rota()).toBe('/conta'))
    // e continua lá (a marca de recuperação já baixou)
    await new Promise((r) => setTimeout(r, 20))
    expect(rota()).toBe('/conta')
  })

  it('link que já cai em /nova-senha fica lá', async () => {
    montar('/nova-senha')
    await waitFor(() => expect(ouvintes.length).toBeGreaterThan(0))

    await emitir('PASSWORD_RECOVERY')
    act(() => screen.getByText('ir para a conta').click())

    await waitFor(() => expect(rota()).toBe('/conta'))
  })

  it('login comum (SIGNED_IN) e renovação de token não mexem na rota', async () => {
    montar('/planos')
    await waitFor(() => expect(ouvintes.length).toBeGreaterThan(0))

    await emitir('SIGNED_IN')
    await emitir('TOKEN_REFRESHED')
    await new Promise((r) => setTimeout(r, 20))

    expect(rota()).toBe('/planos')
  })

  it('a sessão de recuperação é relida (para /nova-senha ver a sessão aberta)', async () => {
    montar('/')
    await waitFor(() => expect(ouvintes.length).toBeGreaterThan(0))
    const leiturasAntes = supabaseFake.auth.getSession.mock.calls.length

    await emitir('PASSWORD_RECOVERY')

    await waitFor(() =>
      expect(supabaseFake.auth.getSession.mock.calls.length).toBeGreaterThan(leiturasAntes),
    )
  })
})
