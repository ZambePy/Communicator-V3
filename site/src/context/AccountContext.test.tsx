import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AccountProvider, useAccount, type Account } from './AccountContext'
import type { NovaContaBeta, RespostasPesquisa, ResultadoNovaConta } from '../services/api'

/* ============================================================
   O AccountContext precisa distinguir duas falhas ao reler a conta:

   - rede fora / banco fora / 500: a sessão continua valendo, os dados
     que já estavam na tela ficam, e `sessionError` explica o que houve;
   - token recusado (401, 403, PGRST301): a sessão acabou de verdade e
     o usuário volta a ser anônimo.

   Antes as duas caíam no mesmo catch e qualquer oscilação de Wi-Fi
   expulsava o usuário do painel. Estes testes seguram esse contrato.
   ============================================================ */

const { supabaseFake, fetchAccount, criarContaBeta, responderPesquisa, apiSignIn, apiSignOut } = vi.hoisted(() => {
  const supabaseFake = {
    auth: {
      // sessão sempre presente: quem decide o resto é fetchAccount
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }
  const fetchAccount = vi.fn<() => Promise<Account | null>>()
  const criarContaBeta = vi.fn<(nova: NovaContaBeta) => Promise<ResultadoNovaConta>>()
  const responderPesquisa = vi.fn<(r: RespostasPesquisa) => Promise<Account>>()
  const apiSignIn = vi.fn<(email: string, senha: string) => Promise<void>>()
  const apiSignOut = vi.fn<() => Promise<void>>()
  return { supabaseFake, fetchAccount, criarContaBeta, responderPesquisa, apiSignIn, apiSignOut }
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
  return { ...real, fetchAccount, criarContaBeta, responderPesquisa, signIn: apiSignIn, signOut: apiSignOut }
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
  window.localStorage.clear()
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
   A beta tem duas ações no contexto: `criarContaBeta` (etapa 1, só a
   conta) e `responderPesquisa` (etapa 3, que abre a assinatura 'beta' e
   deixa a conta carregada para a /beta passar ao download sem navegar).
   ------------------------------------------------ */

const contaBeta: Account = {
  ...conta,
  id: 'sub-beta',
  status: 'ativa',
  priceBRL: 0,
  planId: 'beta',
  nextChargeAt: '2027-03-31T23:59:59-03:00',
}

const novaConta: NovaContaBeta = {
  nome: 'Maria Aparecida Souza',
  email: 'maria@exemplo.com.br',
  senha: 'segredo123',
  newsletter: true,
}

const respostas: RespostasPesquisa = {
  relation: 'conjuge',
  userName: 'João',
  condition: 'ela',
  os: 'windows',
  wantsCaregiverApp: true,
  feedbackConsent: false,
  howFound: 'Indicação',
  phone: '',
}

describe('AccountContext.criarContaBeta', () => {
  it("'confirmar': a conta existe, mas sem sessão até o clique no link", async () => {
    supabaseFake.auth.getSession.mockResolvedValue({ data: { session: null } } as never)
    criarContaBeta.mockResolvedValueOnce('confirmar')

    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    let resultado: ResultadoNovaConta | undefined
    await act(async () => {
      resultado = await result.current.criarContaBeta(novaConta)
    })

    expect(criarContaBeta).toHaveBeenCalledWith(novaConta)
    expect(resultado).toBe('confirmar')
    expect(result.current.authenticated).toBe(false)
    expect(result.current.account).toBeNull()
  })

  it("'sessao' (projeto sem confirmação de e-mail): relê a sessão e a pessoa já está logada, ainda sem conta", async () => {
    supabaseFake.auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never)
    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    criarContaBeta.mockResolvedValueOnce('sessao')
    supabaseFake.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    fetchAccount.mockResolvedValueOnce(null)
    await act(async () => {
      await result.current.criarContaBeta(novaConta)
    })

    expect(result.current.authenticated).toBe(true)
    expect(result.current.account).toBeNull()
  })
})

describe('AccountContext.responderPesquisa', () => {
  it('grava a pesquisa, guarda a conta beta e marca a sessão como autenticada', async () => {
    supabaseFake.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    fetchAccount.mockResolvedValueOnce(null) // logada, sem a pesquisa
    responderPesquisa.mockResolvedValueOnce(contaBeta)

    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.account).toBeNull()
    expect(result.current.authenticated).toBe(true)

    let devolvida: Account | undefined
    await act(async () => {
      devolvida = await result.current.responderPesquisa(respostas)
    })

    expect(responderPesquisa).toHaveBeenCalledWith(respostas)
    expect(devolvida).toEqual(contaBeta)
    expect(result.current.account?.planId).toBe('beta')
    expect(result.current.authenticated).toBe(true)
  })

  it('propaga a falha sem mexer no estado', async () => {
    supabaseFake.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    fetchAccount.mockResolvedValueOnce(null)
    responderPesquisa.mockRejectedValueOnce(new Error('As inscrições da beta estão fechadas no momento.'))

    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(act(() => result.current.responderPesquisa(respostas))).rejects.toThrow('fechadas')
    expect(result.current.account).toBeNull()
  })

  it('o rascunho da inscrição antiga (versão anterior do site) é apagado ao abrir', async () => {
    window.localStorage.setItem('irisflow:rascunho-beta', JSON.stringify({ v: 1, email: 'x@y.com' }))
    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(window.localStorage.getItem('irisflow:rascunho-beta')).toBeNull()
  })
})

/* ---------------- entrar e sair ---------------- */

describe('AccountContext.signIn / signOut', () => {
  it('conta sem a pesquisa respondida: a sessão fica marcada e signIn resolve com null (a tela leva à pesquisa)', async () => {
    supabaseFake.auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never)
    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authenticated).toBe(false)

    apiSignIn.mockResolvedValueOnce()
    fetchAccount.mockResolvedValueOnce(null) // sem assinatura: acabou de confirmar o e-mail
    let lida: Account | null | undefined
    await act(async () => {
      lida = await result.current.signIn('maria@exemplo.com.br', 'segredo123')
    })

    expect(lida).toBeNull()
    expect(apiSignIn).toHaveBeenCalledWith('maria@exemplo.com.br', 'segredo123')
    expect(result.current.authenticated).toBe(true)
    expect(result.current.account).toBeNull()
    expect(result.current.sessionError).toBeNull()
  })

  it('falha de rede logo depois do login não vira "senha errada": a sessão fica e o motivo vai para sessionError', async () => {
    supabaseFake.auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never)
    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    apiSignIn.mockResolvedValueOnce()
    fetchAccount.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(() => result.current.signIn('maria@exemplo.com.br', 'segredo123'))

    expect(result.current.authenticated).toBe(true)
    expect(result.current.sessionError).toBe('Failed to fetch')
  })

  it('login recusado propaga o erro e não marca sessão', async () => {
    supabaseFake.auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never)
    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    apiSignIn.mockRejectedValueOnce(new Error('E-mail ou senha incorretos.'))
    await expect(act(() => result.current.signIn('maria@exemplo.com.br', 'errada'))).rejects.toThrow(
      'incorretos',
    )
    expect(result.current.authenticated).toBe(false)
    expect(fetchAccount).not.toHaveBeenCalled()
  })

  it('conta completa: signIn resolve com a conta lida (a tela leva ao perfil)', async () => {
    supabaseFake.auth.getSession.mockResolvedValueOnce({ data: { session: null } } as never)
    const { result } = renderHook(() => useAccount(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    apiSignIn.mockResolvedValueOnce()
    fetchAccount.mockResolvedValueOnce(contaBeta)
    let lida: Account | null | undefined
    await act(async () => {
      lida = await result.current.signIn('maria@exemplo.com.br', 'segredo123')
    })
    expect(lida).toEqual(contaBeta)
  })

  it('sair zera a conta e a sessão', async () => {
    const { result } = await montarComContaCarregada()

    apiSignOut.mockResolvedValueOnce()
    await act(() => result.current.signOut())

    expect(result.current.authenticated).toBe(false)
    expect(result.current.account).toBeNull()
  })
})
