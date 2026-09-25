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

   Na beta, "sessão aberta" e "conta" são coisas diferentes: a conta
   (`account`, da view my_account) só existe depois da pesquisa rápida, que
   abre a assinatura 'beta'. Entre criar a conta e responder a pesquisa, a
   pessoa está `authenticated` com `account` nulo — e o site a trata como
   logada (cabeçalho com "Meu perfil", /beta na etapa da pesquisa).
   ============================================================ */

/* A inscrição antiga guardava um rascunho da pesquisa no navegador enquanto o
   e-mail não era confirmado. A pesquisa agora vem depois da confirmação e
   nada fica guardado; esta chave só é apagada, para não sobrar em quem usou
   a versão anterior do site. */
const RASCUNHO_ANTIGO = 'irisflow:rascunho-beta'

function apagarRascunhoAntigo() {
  try {
    window.localStorage.removeItem(RASCUNHO_ANTIGO)
  } catch {
    // modo privado ou armazenamento bloqueado: não havia rascunho
  }
}

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
   * nulo: é o caso de quem criou a conta e ainda não respondeu a pesquisa
   * rápida (acabou de confirmar o e-mail, ou parou no meio). Essa pessoa
   * está logada: vai para /beta responder a pesquisa, não para o login.
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
  /**
   * Beta, etapa 1: cria a conta. 'confirmar' = o link foi para o e-mail;
   * 'sessao' = o projeto não exige confirmação e a pessoa já está logada.
   */
  criarContaBeta: (nova: api.NovaContaBeta) => Promise<api.ResultadoNovaConta>
  /**
   * Beta, etapa 3: grava a pesquisa rápida e abre a assinatura 'beta' (sem
   * cobrança). Também serve para editar as respostas no /perfil.
   */
  responderPesquisa: (respostas: api.RespostasPesquisa) => Promise<Account>
  /** Troca nome, telefone e novidades da conta (seção "Dados da conta" do /perfil). */
  atualizarDadosDaConta: (dados: api.DadosDaConta) => Promise<void>
  /** Guarda a forma de pagamento. A cobrança só ocorre ao fim da avaliação. */
  attachPayment: (payment: Payment) => Promise<void>
  /**
   * Entra com e-mail e senha. Rejeita só quando o login falha (senha errada,
   * e-mail não confirmado); se a leitura da conta falhar depois, a sessão fica
   * de pé e o motivo vai para `sessionError`. Resolve com a conta lida (null
   * = logada, mas sem a pesquisa respondida), para a tela de acesso saber
   * para onde seguir.
   */
  signIn: (email: string, password: string) => Promise<Account | null>
  signOut: () => Promise<void>
  cancel: () => Promise<void>
  reactivate: () => Promise<void>
  /** Relê a conta do banco. */
  refresh: () => Promise<void>
  /**
   * O supabase-js acabou de abrir uma sessão de RECUPERAÇÃO de senha (evento
   * PASSWORD_RECOVERY: a pessoa abriu o link do e-mail). O link pode cair em
   * qualquer página — a Site URL do painel, se o `redirectTo` não estiver na
   * lista de Redirect URLs, ou um pedido feito pelo app do cuidador —, então
   * o `EncaminharRecuperacaoDeSenha` leva para /nova-senha e baixa a marca.
   */
  recuperandoSenha: boolean
  /** Chegou em /nova-senha: a marca de recuperação já cumpriu o papel. */
  concluirRecuperacaoDeSenha: () => void
}

const AccountContext = createContext<Ctx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)
  const concluirRecuperacaoDeSenha = useCallback(() => setRecuperandoSenha(false), [])

  /**
   * Lê a conta da sessão aberta, separando "sessão acabou" de "rede caiu".
   * Devolve o que leu (null também quando a leitura falhou).
   */
  const lerConta = useCallback(async (): Promise<Account | null> => {
    try {
      const conta = await api.fetchAccount()
      setAccount(conta)
      setSessionError(null)
      return conta
    } catch (e) {
      if (api.ehErroDeAutenticacao(e)) {
        // Token recusado pelo servidor: a sessão de fato acabou.
        setAuthenticated(false)
        setAccount(null)
        setSessionError(null)
        return null
      }
      // Rede fora, banco fora, 500: o estado anterior continua valendo. A conta
      // que já estava carregada segue na tela e o aviso explica o que houve.
      setSessionError(
        e instanceof Error ? e.message : 'Não foi possível falar com o servidor agora.',
      )
      return null
    }
  }, [])

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

    await lerConta()
  }, [lerConta])

  // Carrega a sessão de partida e acompanha login e logout, inclusive os
  // que acontecem em outra aba.
  useEffect(() => {
    let vivo = true
    apagarRascunhoAntigo()

    refresh().finally(() => {
      if (vivo) setLoading(false)
    })

    const { data: sub } = supabase?.auth.onAuthStateChange((evento) => {
      if (!vivo) return
      if (evento === 'SIGNED_OUT') {
        setAccount(null)
        setAuthenticated(false)
        setSessionError(null)
        setRecuperandoSenha(false)
        return
      }
      // PASSWORD_RECOVERY: o usuário chegou pelo link do e-mail de
      // redefinição e o supabase-js abriu a sessão a partir da URL. Sem
      // reler aqui, /nova-senha veria `authenticated` falso e diria que o
      // link não vale. A marca faz qualquer página encaminhar para lá.
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
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

  const criarContaBeta = useCallback(
    async (nova: api.NovaContaBeta) => {
      const resultado = await api.criarContaBeta(nova)
      // Sem confirmação de e-mail no projeto, a sessão já veio: relê para a
      // /beta seguir direto para a pesquisa.
      if (resultado === 'sessao') await refresh()
      return resultado
    },
    [refresh],
  )

  const responderPesquisa = useCallback(async (respostas: api.RespostasPesquisa) => {
    const conta = await api.responderPesquisa(respostas)
    setAccount(conta)
    setAuthenticated(true)
    setSessionError(null)
    return conta
  }, [])

  const atualizarDadosDaConta = useCallback(
    async (dados: api.DadosDaConta) => {
      await api.atualizarDadosDaConta(dados)
      await lerConta()
    },
    [lerConta],
  )

  const attachPayment = useCallback(async (payment: Payment) => {
    await api.attachPaymentMethod(payment)
    setAccount(await api.fetchAccount())
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      await api.signIn(email, password)
      // A sessão já existe: marca antes de ler a conta. Sem isto, a tela que
      // vem depois podia ver `authenticated` ainda falso numa conta sem a
      // pesquisa respondida e devolver a pessoa para /entrar, em vez de
      // levá-la à pesquisa. Falha de rede na leitura vira `sessionError`,
      // não "senha errada".
      setAuthenticated(true)
      return lerConta()
    },
    [lerConta],
  )

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
      criarContaBeta,
      responderPesquisa,
      atualizarDadosDaConta,
      attachPayment,
      signIn,
      signOut,
      cancel,
      reactivate,
      refresh,
      recuperandoSenha,
      concluirRecuperacaoDeSenha,
    }),
    [
      account,
      authenticated,
      loading,
      sessionError,
      register,
      criarContaBeta,
      responderPesquisa,
      atualizarDadosDaConta,
      attachPayment,
      signIn,
      signOut,
      cancel,
      reactivate,
      refresh,
      recuperandoSenha,
      concluirRecuperacaoDeSenha,
    ],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccount precisa estar dentro de <AccountProvider>')
  return ctx
}
