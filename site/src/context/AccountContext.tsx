import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import * as api from '@/services/api'
import type { PlanId } from '@/data/content'

/* ============================================================
   Estado de conta e assinatura.

   A fonte da verdade é o Supabase. Este contexto guarda em memória a
   conta do usuário logado e a mantém em dia com a sessão: ao entrar,
   ao sair e ao recarregar a página.

   Nada aqui grava em localStorage. Quem persiste a sessão é o próprio
   supabase-js; a conta é sempre relida do banco.
   ============================================================ */

export type Profile = {
  /** Quem paga: familiar responsável ou cuidador principal. */
  buyerName: string
  email: string
  phone: string
  document: string
  /** Quem usa: a pessoa com restrição motora severa. */
  userName: string
  relation: string
  condition: string
  os: string
  /** Profissional que acompanha o caso, opcional. */
  prescriberName?: string
  prescriberRole?: string
  newsletter: boolean
}

/**
 * Inscrição no programa beta (docs/BETA.md). Mesmos dados do Profile, com
 * o CPF opcional (string vazia = não informado) e o que é só da beta.
 */
export type BetaProfile = Profile & {
  /** Quer o app do cuidador no celular além do desktop? */
  wantsCaregiverApp: boolean
  /** Aceita ser contatado(a) para dar retorno sobre a beta. */
  feedbackConsent: boolean
  /** Como soube da IrisFlow (texto livre, opcional). */
  howFound?: string
}

export type Payment = {
  method: 'cartao' | 'pix' | 'boleto'
  /** Somente os quatro últimos dígitos trafegam e são guardados. */
  cardLast4?: string
  cardBrand?: string
  holder?: string
  /** 1 para cobrança mensal, 12 para anual. */
  installments?: number
}

export type Account = {
  id: string
  profile: Profile
  payment?: Payment
  /** 'inadimplente' vem do gateway; as outras nascem no próprio site. */
  status: 'avaliacao' | 'ativa' | 'cancelada' | 'inadimplente'
  createdAt: string
  trialEndsAt: string
  nextChargeAt: string
  /** Fotografia do preço no momento da contratação. */
  priceBRL: number
  /** Plano contratado. Casa com o id em `PLANS` e com `public.plans.id`. */
  planId: PlanId
}

type Ctx = {
  account: Account | null
  /**
   * Há sessão do Supabase aberta. Pode ser verdadeiro com `account`
   * nulo: é o caso de quem criou o usuário mas abandonou o cadastro
   * antes de concluir, e precisa voltar para /cadastro, não para o
   * login.
   */
  authenticated: boolean
  /**
   * Verdadeiro enquanto a sessão inicial está sendo lida. As telas de
   * fluxo precisam esperar isso antes de redirecionar, senão um F5 no
   * /conta joga o usuário para o login antes da sessão carregar.
   */
  loading: boolean
  /**
   * Última falha ao reler a conta que NÃO era de autenticação (rede fora,
   * banco fora, 500). A sessão continua de pé e os dados na tela são os da
   * última leitura boa; isto existe para a tela poder dizer isso ao usuário.
   * Volta a null assim que uma leitura dá certo.
   */
  sessionError: string | null
  /** Cria a conta, autentica e abre o período de avaliação no plano escolhido. */
  register: (profile: Profile, password: string, planId: PlanId) => Promise<Account>
  /** Inscreve no programa beta: cria a conta e a assinatura 'beta', sem cobrança. */
  registerBeta: (profile: BetaProfile, password: string) => Promise<Account>
  /** Guarda a forma de pagamento. A cobrança só ocorre ao fim da avaliação. */
  attachPayment: (payment: Payment) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  cancel: () => Promise<void>
  reactivate: () => Promise<void>
  /** Relê a conta do banco. */
  refresh: () => Promise<void>
}

const AccountContext = createContext<Ctx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    // Quem decide se há sessão é getSession, que lê o que o supabase-js guarda
    // localmente e responde sem rede. A leitura da conta vem depois, em outro
    // try: antes as duas dividiam o mesmo catch, e qualquer falha de rede na
    // segunda zerava a sessão — o usuário era jogado para /entrar no meio do
    // uso só porque o Wi-Fi oscilou.
    let temSessao = false
    try {
      const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
      temSessao = Boolean(data.session)
    } catch {
      // Sem cliente configurado, ou storage do navegador bloqueado: não existe
      // sessão utilizável, e aqui deslogar é o comportamento correto.
      setAuthenticated(false)
      setAccount(null)
      setSessionError(null)
      return
    }

    setAuthenticated(temSessao)

    if (!temSessao) {
      setAccount(null)
      setSessionError(null)
      return
    }

    try {
      setAccount(await api.fetchAccount())
      setSessionError(null)
    } catch (e) {
      if (api.ehErroDeAutenticacao(e)) {
        // Token recusado pelo servidor: a sessão de fato acabou.
        setAuthenticated(false)
        setAccount(null)
        setSessionError(null)
        return
      }
      // Rede fora, banco fora, 500: o estado anterior continua valendo. A conta
      // que já estava carregada segue na tela e o aviso explica o que houve.
      setSessionError(
        e instanceof Error ? e.message : 'Não foi possível falar com o servidor agora.',
      )
    }
  }, [])

  // Carrega a sessão de partida e acompanha login e logout, inclusive os
  // que acontecem em outra aba.
  useEffect(() => {
    let vivo = true

    refresh().finally(() => {
      if (vivo) setLoading(false)
    })

    const { data: sub } = supabase?.auth.onAuthStateChange((evento) => {
      if (!vivo) return
      if (evento === 'SIGNED_OUT') {
        setAccount(null)
        setAuthenticated(false)
        setSessionError(null)
        return
      }
      // PASSWORD_RECOVERY: o usuário chegou pelo link do e-mail de
      // redefinição e o supabase-js abriu a sessão a partir da URL. Sem
      // reler aqui, /nova-senha veria `authenticated` falso e diria que o
      // link não vale.
      if (
        evento === 'SIGNED_IN' ||
        evento === 'TOKEN_REFRESHED' ||
        evento === 'PASSWORD_RECOVERY'
      ) {
        void refresh()
      }
    }) ?? { data: { subscription: null } }

    return () => {
      vivo = false
      sub.subscription?.unsubscribe()
    }
  }, [refresh])

  const register = useCallback(async (profile: Profile, password: string, planId: PlanId) => {
    const nova = await api.signUp(profile, password, planId)
    setAccount(nova)
    setAuthenticated(true)
    return nova
  }, [])

  const registerBeta = useCallback(async (profile: BetaProfile, password: string) => {
    const nova = await api.signUpBeta(profile, password)
    setAccount(nova)
    setAuthenticated(true)
    return nova
  }, [])

  const attachPayment = useCallback(async (payment: Payment) => {
    await api.attachPaymentMethod(payment)
    setAccount(await api.fetchAccount())
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    await api.signIn(email, password)
    setAccount(await api.fetchAccount())
  }, [])

  const signOut = useCallback(async () => {
    await api.signOut()
    setAccount(null)
    setAuthenticated(false)
    setSessionError(null)
  }, [])

  const cancel = useCallback(async () => {
    await api.cancelSubscription()
    setAccount(await api.fetchAccount())
  }, [])

  const reactivate = useCallback(async () => {
    await api.reactivateSubscription()
    setAccount(await api.fetchAccount())
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      account,
      authenticated,
      loading,
      sessionError,
      register,
      registerBeta,
      attachPayment,
      signIn,
      signOut,
      cancel,
      reactivate,
      refresh,
    }),
    [
      account,
      authenticated,
      loading,
      sessionError,
      register,
      registerBeta,
      attachPayment,
      signIn,
      signOut,
      cancel,
      reactivate,
      refresh,
    ],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccount precisa estar dentro de <AccountProvider>')
  return ctx
}
