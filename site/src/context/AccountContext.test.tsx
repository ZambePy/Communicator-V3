import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AccountProvider, useAccount, type Account, type BetaProfile } from './AccountContext'

/* ============================================================
   O AccountContext precisa distinguir duas falhas ao reler a conta:

   - rede fora / banco fora / 500: a sessão continua valendo, os dados
     que já estavam na tela ficam, e `sessionError` explica o que houve;
   - token recusado (401, 403, PGRST301): a sessão acabou de verdade e
     o usuário volta a ser anônimo.

   Antes as duas caíam no mesmo catch e qualquer oscilação de Wi-Fi
   expulsava o usuário do painel. Estes testes seguram esse contrato.
   ============================================================ */

const { supabaseFake, fetchAccount, signUpBeta } = vi.hoisted(() => {
  const supabaseFake = {
    auth: {
      // sessão sempre presente: quem decide o resto é fetchAccount
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }
  const fetchAccount = vi.fn<() => Promise<Account | null>>()
  const signUpBeta = vi.fn<(p: BetaProfile, senha: string) => Promise<Account>>()
  return { supabaseFake, fetchAccount, signUpBeta }
})

vi.mock('../lib/supabase', async (importOriginal) => {
  // só o cliente é trocado; a tradução de erro é a real
  const real = await importOriginal<typeof import('../lib/supabase')>()
  return { ...real, isSupabaseConfigured: true, supabase: supabaseFake, client: () => supabaseFake }
})

vi.mock('../services/api', async (importOriginal) => {
  // ehErroDeAutenticacao e ApiError são os de verdade: o teste é sobre a
  // classificação real, não sobre um dublê dela.
  const real = await importOriginal<typeof import('../services/api')>()
  return { ...real, fetchAccount, signUpBeta }
})

const conta: Account = {
  id: 'sub-1',
  profile: {
    buyerName: 'Maria Aparecida Souza',
    email: 'maria@exemplo.com.br',
    phone: '',
    document: '',
    userName: 'João',
    relation: 'conjuge',
    condition: 'ela',
    os: 'windows',
    newsletter: true,
  },
  status: 'avaliacao',
  createdAt: '2026-09-01T00:00:00Z',
  trialEndsAt: '2026-09-16T00:00:00Z',
  nextChargeAt: '2026-09-16T00:00:00Z',
  priceBRL: 399,
  planId: 'completo',
}

function wrapper({ children }: { children: ReactNode }) {
  return <AccountProvider>{children}</AccountProvider>
}

async function montarComContaCarregada() {
  fetchAccount.mockResolvedValueOnce(conta)
  const hook = renderHook(() => useAccount(), { wrapper })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  expect(hook.result.current.account).toEqual(conta)
  expect(hook.result.current.authenticated).toBe(true)
  return hook
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AccountContext.refresh', () => {
  it('falha de REDE mantém a sessão e a conta já carregada', async () => {
    const { result } = await montarComContaCarregada()

    // o que o fetch lança quando não há conexão: sem status, sem code
    fetchAccount.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(() => result.current.refresh())

    expect(result.current.authenticated).toBe(true)
    expect(result.current.account).toEqual(conta)
    expect(result.current.sessionError).toBe('Failed to fetch')
  })

  it('erro de servidor (500) também mantém a sessão', async () => {
    const { result } = await montarComContaCarregada()
    const { ApiError } = await import('../services/api')

    fetchAccount.mockRejectedValueOnce(new ApiError({ message: 'boom', status: 500 }))
    await act(() => result.current.refresh())

    expect(result.current.authenticated).toBe(true)
    expect(result.current.account).toEqual(conta)
    expect(result.current.sessionError).toBe('boom')
  })

  it('erro de AUTENTICAÇÃO limpa sessão e conta', async () => {
    const { result } = await montarComContaCarregada()
    const { ApiError } = await import('../services/api')

    fetchAccount.mockRejectedValueOnce(new ApiError({ message: 'JWT expired', status: 401 }))
    await act(() => result.current.refresh())

    expect(result.current.authenticated).toBe(false)
    expect(result.current.account).toBeNull()
    expect(result.current.sessionError).toBeNull()
  })

  it('PGRST301 (JWT inválido) conta como autenticação, mesmo sem status', async () => {
    const { result } = await montarComContaCarregada()
    const { ApiError } = await import('../services/api')

    fetchAccount.mockRejectedValueOnce(new ApiError({ message: 'JWSError', code: 'PGRST301' }))
    await act(() => result.current.refresh())

    expect(result.current.authenticated).toBe(false)
    expect(result.current.account).toBeNull()
  })

  it('uma leitura boa depois da falha limpa o sessionError', async () => {
    const { result } = await montarComContaCarregada()

    fetchAccount.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(() => result.current.refresh())
    expect(result.current.sessionError).not.toBeNull()

    fetchAccount.mockResolvedValueOnce(conta)
    await act(() => result.current.refresh())
    expect(result.current.sessionError).toBeNull()
    expect(result.current.account).toEqual(conta)
  })

  it('sem sessão no supabase-js, não chama o banco e fica anônimo', async () => {
    supabaseFake.auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never)

    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.authenticated).toBe(false)
    expect(result.current.account).toBeNull()
    expect(fetchAccount).not.toHaveBeenCalled()
  })
})

/* ---------------- programa beta ----------------
   `registerBeta` é o `register` da beta: chama `signUpBeta` e deixa a
   conta carregada no contexto, para a própria /beta trocar o formulário
   pelo painel de download sem navegar.
   ------------------------------------------------ */

const contaBeta: Account = {
  ...conta,
  id: 'sub-beta',
  status: 'ativa',
  priceBRL: 0,
  planId: 'beta',
  nextChargeAt: '2027-03-31T23:59:59-03:00',
}

const perfilBeta: BetaProfile = {
  ...conta.profile,
  wantsCaregiverApp: true,
  feedbackConsent: false,
  howFound: 'Indicação',
}

describe('AccountContext.registerBeta', () => {
  it('inscreve, guarda a conta beta e marca a sessão como autenticada', async () => {
    supabaseFake.auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never)
    signUpBeta.mockResolvedValueOnce(contaBeta)

    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.account).toBeNull()

    let devolvida: Account | undefined
    await act(async () => {
      devolvida = await result.current.registerBeta(perfilBeta, 'segredo123')
    })

    expect(signUpBeta).toHaveBeenCalledWith(perfilBeta, 'segredo123')
    expect(devolvida).toEqual(contaBeta)
    expect(result.current.account).toEqual(contaBeta)
    expect(result.current.account?.planId).toBe('beta')
    expect(result.current.authenticated).toBe(true)
  })

  it('propaga a falha sem mexer no estado', async () => {
    supabaseFake.auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never)
    signUpBeta.mockRejectedValueOnce(new Error('As inscrições da beta estão fechadas no momento.'))

    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(() => result.current.registerBeta(perfilBeta, 'segredo123')),
    ).rejects.toThrow('fechadas')

    expect(result.current.account).toBeNull()
    expect(result.current.authenticated).toBe(false)
  })
})
