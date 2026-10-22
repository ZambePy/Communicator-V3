import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

/* O AccountProvider abre o site sem baixar o supabase-js quando não há sessão
   guardada (auditoria de 21/10/2026, P2-3). Aqui o lib/supabase é o de
   verdade; só o pedaço do cliente é trocado por um contador. */

const { criarCliente } = vi.hoisted(() => ({
  criarCliente: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  })),
}))

vi.mock('../lib/clienteSupabase', () => ({ criarCliente }))
vi.mock('../services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/api')>()
  return { ...real, fetchAccount: vi.fn(async () => null) }
})

async function carregarContexto() {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon')
  const { AccountProvider, useAccount } = await import('./AccountContext')
  const wrapper = ({ children }: { children: ReactNode }) => <AccountProvider>{children}</AccountProvider>
  return renderHook(() => useAccount(), { wrapper })
}

beforeEach(() => {
  criarCliente.mockClear()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('AccountProvider e o supabase-js sob demanda', () => {
  it('visitante sem sessão guardada: a página resolve como "não entrou" sem criar o cliente', async () => {
    const { result } = await carregarContexto()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authenticated).toBe(false)
    expect(criarCliente).not.toHaveBeenCalled()
  })

  it('com a sessão guardada, o cliente é criado e a sessão é restaurada', async () => {
    window.localStorage.setItem('sb-abc-auth-token', '{"access_token":"x"}')
    const { result } = await carregarContexto()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(criarCliente).toHaveBeenCalledTimes(1)
    expect(result.current.authenticated).toBe(true)
  })

  it('a sessão aberta em outra aba (evento storage) é percebida sem recarregar', async () => {
    const { result } = await carregarContexto()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authenticated).toBe(false)

    window.localStorage.setItem('sb-abc-auth-token', '{"access_token":"x"}')
    window.dispatchEvent(new StorageEvent('storage', { key: 'sb-abc-auth-token' }))

    await waitFor(() => expect(result.current.authenticated).toBe(true))
    expect(criarCliente).toHaveBeenCalledTimes(1)
  })
})
