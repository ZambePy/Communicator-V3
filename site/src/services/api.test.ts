import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BETA, PLANS } from '@/data/content'
import type { Profile } from '@/context/AccountContext'
// O vi.mock abaixo é içado pelo vitest antes deste import, então o api.ts
// já nasce enxergando o cliente falso.
import * as api from './api'

/* ============================================================
   Testes de src/services/api.ts com o cliente do Supabase MOCKADO.

   Nada aqui toca a rede. O que se testa é a camada que fica entre o
   supabase-js e as telas: tradução de erro, classificação de erro de
   autenticação, a reserva dos planos e o cadastro da beta. O teste
   contra o projeto real é o `npm run test:integracao`
   (scripts/check-supabase.mjs).
   ============================================================ */

/**
 * Cliente falso, criado dentro de vi.hoisted porque o vi.mock abaixo é
 * içado para o topo do arquivo e precisa enxergá-lo.
 *
 * `from(tabela).select()` devolve um construtor de consulta mínimo: `eq()`
 * devolve o próprio construtor, que é "thenable" (resolve com
 * `estado.respostaPlans`, como o fetchPlans espera) e tem `maybeSingle()`
 * (resolve com `estado.respostaSingle(tabela)`, como fetchAccount e
 * fetchBetaProgram esperam). `client()` pode ser trocado por um que lança,
 * para simular o .env.local vazio.
 */
const { auth, fake, clientMock, estado } = vi.hoisted(() => {
  type Resposta = Promise<{ data: unknown; error: unknown }>
  const auth = {
    signInWithPassword: vi.fn(),
    getSession: vi.fn(async () => ({ data: { session: null } })),
    signUp: vi.fn(),
    resend: vi.fn(async () => ({ data: { user: null, session: null }, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    verifyOtp: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    })),
  }
  const estado = {
    respostaUpdate: (async () => ({ data: null, error: null })) as () => Resposta,
    respostaPlans: (async () => ({ data: [], error: null })) as () => Resposta,
    respostaSingle: (async (_tabela: string) => ({ data: null, error: null })) as (
      tabela: string,
    ) => Resposta,
  }
  const consulta = (tabela: string) => {
    const q = {
      eq: vi.fn(() => q),
      maybeSingle: vi.fn(() => estado.respostaSingle(tabela)),
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
        estado.respostaPlans().then(ok, falha),
    }
    return q
  }
  const fake = {
    auth,
    rpc: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
    from: vi.fn((tabela: string) => ({
      select: vi.fn(() => consulta(tabela)),
      update: vi.fn(() => ({ eq: vi.fn(() => estado.respostaUpdate()) })),
    })),
  }
  const clientMock = vi.fn(() => fake)
  return { auth, fake, clientMock, estado }
})

vi.mock('../lib/supabase', async (importOriginal) => {
  // mensagemDeErro é a tradução de verdade: é justamente ela que se quer
  // ver aplicada, então só o cliente é substituído.
  const real = await importOriginal<typeof import('../lib/supabase')>()
  return {
    ...real,
    isSupabaseConfigured: true,
    supabase: fake,
    client: () => clientMock(),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  clientMock.mockImplementation(() => fake)
  auth.getSession.mockResolvedValue({ data: { session: null } })
  fake.rpc.mockResolvedValue({ data: null, error: null })
  estado.respostaPlans = async () => ({ data: [], error: null })
  estado.respostaSingle = async () => ({ data: null, error: null })
  estado.respostaUpdate = async () => ({ data: null, error: null })
})

describe('signIn', () => {
  it('normaliza o e-mail e resolve quando o Supabase não devolve erro', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: {} }, error: null })

    await expect(api.signIn('  Maria@Exemplo.com.br ', 'segredo123')).resolves.toBeUndefined()

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'maria@exemplo.com.br',
      password: 'segredo123',
    })
  })

  it('rejeita com a mensagem traduzida, preservando código e status', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' },
    })

    const erro = await api.signIn('maria@exemplo.com.br', 'errada').catch((e) => e)

    expect(erro).toBeInstanceOf(api.ApiError)
    expect(erro.message).toBe('E-mail ou senha incorretos.')
    expect(erro.status).toBe(400)
    expect(erro.code).toBe('invalid_credentials')
  })
})

describe('ehErroDeAutenticacao', () => {
  it('reconhece 401, 403 e PGRST301 como sessão inválida', () => {
    expect(api.ehErroDeAutenticacao({ status: 401 })).toBe(true)
    expect(api.ehErroDeAutenticacao({ status: 403 })).toBe(true)
    expect(api.ehErroDeAutenticacao({ code: 'PGRST301' })).toBe(true)
    expect(api.ehErroDeAutenticacao({ code: 'PGRST302' })).toBe(true)
    expect(api.ehErroDeAutenticacao(new api.ApiError({ message: 'JWT expired', status: 401 }))).toBe(
      true,
    )
  })

  it('NÃO trata falha de rede nem erro de servidor como logout', () => {
    // é o que o fetch lança quando o Wi-Fi cai: sem status, sem code
    expect(api.ehErroDeAutenticacao(new TypeError('Failed to fetch'))).toBe(false)
    expect(api.ehErroDeAutenticacao({ status: 500, message: 'boom' })).toBe(false)
    expect(api.ehErroDeAutenticacao({ code: '42501' })).toBe(false)
    expect(api.ehErroDeAutenticacao(null)).toBe(false)
    expect(api.ehErroDeAutenticacao(undefined)).toBe(false)
  })
})

describe('fetchPlans', () => {
  it('usa preço e nome do banco e mantém o texto de venda do content.ts', async () => {
    estado.respostaPlans = async () => ({
      data: [
        { id: 'essencial', name: 'Essencial', price_brl: '259.00' }, // numeric como texto
        { id: 'completo', name: 'Completo Plus', price_brl: 419 },
        { id: 'voz', name: 'Voz', price_brl: 649 },
      ],
      error: null,
    })

    const planos = await api.fetchPlans()

    expect(planos).not.toBe(PLANS)
    expect(planos.map((p) => p.id)).toEqual(['essencial', 'completo', 'voz'])
    expect(planos[0].price).toBe(259)
    expect(planos[1].name).toBe('Completo Plus')
    expect(planos[1].price).toBe(419)
    // bullets, tagline e nota continuam sendo os do catálogo
    expect(planos[1].includes).toEqual(PLANS[1].includes)
    expect(planos[1].recommended).toBe(true)
    expect(planos[2].note).toBe(PLANS[2].note)
    expect(fake.from).toHaveBeenCalledWith('plans')
    // sem a coluna purchasable (banco anterior à migração da beta) = pode contratar
    expect(planos[0].purchasable).toBe(true)
  })

  it('lê purchasable do banco: false vira card indisponível', async () => {
    estado.respostaPlans = async () => ({
      data: [
        { id: 'essencial', name: 'Essencial', price_brl: 249, purchasable: false },
        { id: 'completo', name: 'Completo', price_brl: 399, purchasable: true },
      ],
      error: null,
    })

    const planos = await api.fetchPlans()
    expect(planos[0].purchasable).toBe(false)
    expect(planos[1].purchasable).toBe(true)
  })

  it('na reserva, purchasable segue a chave BETA.ativo', () => {
    for (const p of PLANS) expect(p.purchasable).toBe(!BETA.ativo)
  })

  it('esconde o plano que o banco marcou como inativo', async () => {
    estado.respostaPlans = async () => ({
      data: [
        { id: 'essencial', name: 'Essencial', price_brl: 249 },
        { id: 'completo', name: 'Completo', price_brl: 399 },
      ],
      error: null,
    })

    const planos = await api.fetchPlans()
    expect(planos.map((p) => p.id)).toEqual(['essencial', 'completo'])
  })

  it('cai na reserva quando a leitura devolve erro', async () => {
    estado.respostaPlans = async () => ({
      data: null,
      error: { message: 'permission denied for table plans', code: '42501' },
    })

    await expect(api.fetchPlans()).resolves.toBe(PLANS)
  })

  it('cai na reserva quando a rede falha', async () => {
    estado.respostaPlans = () => Promise.reject(new TypeError('Failed to fetch'))

    await expect(api.fetchPlans()).resolves.toBe(PLANS)
  })

  it('cai na reserva quando o cliente não está configurado', async () => {
    clientMock.mockImplementation(() => {
      throw new Error('Supabase não configurado.')
    })

    await expect(api.fetchPlans()).resolves.toBe(PLANS)
  })

  it('cai na reserva quando a tabela está vazia ou sem id conhecido', async () => {
    estado.respostaPlans = async () => ({ data: [], error: null })
    await expect(api.fetchPlans()).resolves.toBe(PLANS)

    estado.respostaPlans = async () => ({
      data: [{ id: 'irisflow-mensal', name: 'Antigo', price_brl: 199 }],
      error: null,
    })
    await expect(api.fetchPlans()).resolves.toBe(PLANS)
  })
})

/* ---------------- programa beta ---------------- */

const LINHA_MY_ACCOUNT = {
  subscription_id: 'sub-beta',
  profile_id: 'u1',
  buyer_name: 'Maria Aparecida Souza',
  email: 'maria@exemplo.com.br',
  phone: '(11) 90000-0000',
  document: null,
  newsletter: true,
  user_name: 'João',
  relation: 'conjuge',
  condition: 'ela',
  os: 'windows',
  prescriber_name: null,
  prescriber_role: null,
  status: 'ativa',
  plan_id: 'beta',
  price_brl: '0.00',
  trial_ends_at: '2026-09-15T00:00:00Z',
  next_charge_at: '2027-03-31T23:59:59-03:00',
  canceled_at: null,
  created_at: '2026-09-15T00:00:00Z',
  payment_method: null,
  billing_interval: null,
  card_last4: null,
  card_brand: null,
  holder: null,
}

/** Perfil do cadastro pago (fechado na beta), usado só pelo teste de signUp. */
const perfilPago: Profile = {
  buyerName: 'Maria Aparecida Souza',
  email: '  Maria@Exemplo.com.br ',
  phone: '(11) 90000-0000',
  document: '123.456.789-09',
  userName: 'João',
  relation: 'conjuge',
  condition: 'ela',
  os: 'windows',
  newsletter: true,
}

const respostas: api.RespostasPesquisa = {
  relation: 'conjuge',
  userName: '  João  ',
  condition: 'ela',
  os: 'windows',
  wantsCaregiverApp: true,
  feedbackConsent: true,
  howFound: '  ',
  phone: '(11) 90000-0000',
}

describe('criarContaBeta (etapa 1: só a conta)', () => {
  it('manda nome, novidades e o aceite dos termos datado em options.data, com o link para /confirmar-email', async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1' }, session: null }, error: null })

    await api.criarContaBeta({
      nome: '  Maria   Aparecida Souza ',
      email: '  Maria@Exemplo.com.br ',
      senha: 'segredo123',
      newsletter: false,
    })

    const chamada = auth.signUp.mock.calls[0][0]
    expect(chamada.email).toBe('maria@exemplo.com.br')
    expect(chamada.password).toBe('segredo123')
    expect(chamada.options.emailRedirectTo).toBe('https://irisflow-communicator.pages.dev/confirmar-email')
    expect(chamada.options.data.buyer_name).toBe('Maria Aparecida Souza')
    expect(chamada.options.data.newsletter).toBe(false)
    expect(Number.isNaN(Date.parse(chamada.options.data.terms_accepted_at))).toBe(false)
    // nada de saúde nem de pesquisa no signUp: o que vai aqui viaja no JWT
    expect(Object.keys(chamada.options.data).sort()).toEqual(['buyer_name', 'newsletter', 'terms_accepted_at'])
    // e nenhuma RPC: a pesquisa é outra etapa
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it("devolve 'confirmar' sem sessão (Confirm email ligado) e 'sessao' quando o projeto já entrega a sessão", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1' }, session: null }, error: null })
    await expect(
      api.criarContaBeta({ nome: 'Maria Souza', email: 'maria@exemplo.com.br', senha: 'segredo123', newsletter: true }),
    ).resolves.toBe('confirmar')

    auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1' }, session: { user: { id: 'u1' } } }, error: null })
    await expect(
      api.criarContaBeta({ nome: 'Maria Souza', email: 'maria@exemplo.com.br', senha: 'segredo123', newsletter: true }),
    ).resolves.toBe('sessao')
  })

  it('falha do servidor de e-mail vira a mensagem que a família entende', async () => {
    auth.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Error sending confirmation email', status: 500, code: 'unexpected_failure' },
    })

    const erro = await api
      .criarContaBeta({ nome: 'Maria Souza', email: 'maria@exemplo.com.br', senha: 'segredo123', newsletter: true })
      .catch((e) => e)
    expect(erro).toBeInstanceOf(api.ApiError)
    expect(erro.message).toMatch(/Não conseguimos enviar o e-mail agora/)
  })
})

describe('verificarLinkDoEmail (etapa 2: o link abre a sessão no aparelho)', () => {
  it('troca o token_hash do link por uma sessão com verifyOtp', async () => {
    await api.verificarLinkDoEmail('hash-1', 'email')
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'email' })
  })

  it('o mesmo link processado duas vezes (StrictMode, F5) faz uma verificação só', async () => {
    await Promise.all([api.verificarLinkDoEmail('hash-2', 'email'), api.verificarLinkDoEmail('hash-2', 'email')])
    await api.verificarLinkDoEmail('hash-2', 'email')
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1)
  })

  it('link vencido ou já usado vira mensagem em português', async () => {
    auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Email link is invalid or has expired', status: 403, code: 'otp_expired' },
    })
    const erro = await api.verificarLinkDoEmail('hash-3', 'email').catch((e) => e)
    expect(erro).toBeInstanceOf(api.ApiError)
    expect(erro.message).toBe('O link expirou ou já foi usado.')
  })
})

describe('responderPesquisa (etapa 3: abre a assinatura beta)', () => {
  beforeEach(() => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never)
    fake.rpc.mockResolvedValue({
      data: { subscription_id: 'sub-beta', beta_ends_at: LINHA_MY_ACCOUNT.next_charge_at, current_version: '1.0.0-beta.1' },
      error: null,
    })
    let chamadasMyAccount = 0
    estado.respostaSingle = async (tabela) => {
      if (tabela === 'profiles') {
        return {
          data: { buyer_name: 'Maria Souza', email: 'maria@exemplo.com.br', phone: null, newsletter: true, created_at: '2026-09-24T22:37:43Z' },
          error: null,
        }
      }
      if (tabela === 'my_account') {
        // antes da pesquisa não há conta; depois dela, a conta beta
        chamadasMyAccount += 1
        return chamadasMyAccount === 1 ? { data: null, error: null } : { data: LINHA_MY_ACCOUNT, error: null }
      }
      return { data: null, error: null }
    }
  })

  it('grava as respostas com CPF null, telefone só dígitos, nome aparado e as novidades escolhidas ao criar a conta', async () => {
    const conta = await api.responderPesquisa(respostas)

    expect(fake.rpc).toHaveBeenCalledWith('complete_beta_registration', {
      p_phone: '11900000000',
      p_user_name: 'João',
      p_relation: 'conjuge',
      p_condition: 'ela',
      p_os: 'windows',
      p_document: null,
      p_wants_caregiver_app: true,
      p_feedback_consent: true,
      p_how_found: null,
      p_newsletter: true,
      p_prescriber_name: null,
      p_prescriber_role: null,
    })
    expect(fake.rpc).not.toHaveBeenCalledWith('complete_registration', expect.anything())
    expect(conta.planId).toBe('beta')
    expect(conta.priceBRL).toBe(0)
  })

  it('editar as respostas no perfil não apaga o profissional de uma inscrição antiga', async () => {
    estado.respostaSingle = async (tabela) =>
      tabela === 'my_account'
        ? { data: { ...LINHA_MY_ACCOUNT, prescriber_name: 'Dra. Ana', prescriber_role: 'Fonoaudiologia' }, error: null }
        : { data: { buyer_name: 'Maria Souza', email: 'm@x.com', phone: null, newsletter: false, created_at: '' }, error: null }

    await api.responderPesquisa({ ...respostas, phone: '' })

    expect(fake.rpc).toHaveBeenCalledWith(
      'complete_beta_registration',
      expect.objectContaining({
        p_prescriber_name: 'Dra. Ana',
        p_prescriber_role: 'Fonoaudiologia',
        // telefone vazio vai como null: a função mantém o número que existir
        p_phone: null,
        p_newsletter: false,
      }),
    )
  })

  it('rejeita com a mensagem do banco quando as inscrições estão fechadas', async () => {
    fake.rpc.mockResolvedValue({
      data: null,
      error: { message: 'As inscrições da beta estão fechadas no momento.', code: 'P0001' },
    })
    const erro = await api.responderPesquisa(respostas).catch((e) => e)
    expect(erro).toBeInstanceOf(api.ApiError)
    expect(erro.message).toBe('As inscrições da beta estão fechadas no momento.')
  })
})

describe('fetchInscricaoBeta', () => {
  it('lê a própria linha de beta_registrations', async () => {
    estado.respostaSingle = async (tabela) =>
      tabela === 'beta_registrations'
        ? {
            data: {
              wants_caregiver_app: true,
              feedback_consent: false,
              how_found: null,
              registered_at: '2026-09-25T10:00:00Z',
              downloaded_at: null,
            },
            error: null,
          }
        : { data: null, error: null }

    await expect(api.fetchInscricaoBeta()).resolves.toEqual({
      wantsCaregiverApp: true,
      feedbackConsent: false,
      howFound: '',
      registeredAt: '2026-09-25T10:00:00Z',
      downloadedAt: null,
    })
    expect(fake.from).toHaveBeenCalledWith('beta_registrations')
  })

  it('sem linha, com erro ou sem cliente, devolve null', async () => {
    await expect(api.fetchInscricaoBeta()).resolves.toBeNull()
    estado.respostaSingle = async () => ({ data: null, error: { message: 'boom' } })
    await expect(api.fetchInscricaoBeta()).resolves.toBeNull()
    clientMock.mockImplementation(() => {
      throw new Error('sem cliente')
    })
    await expect(api.fetchInscricaoBeta()).resolves.toBeNull()
  })
})

describe('atualizarDadosDaConta', () => {
  it('grava nome aparado, telefone só com dígitos (vazio apaga) e novidades na própria linha de profiles', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never)

    await api.atualizarDadosDaConta({ nome: ' Maria  Souza ', telefone: '', newsletter: false })

    expect(fake.from).toHaveBeenCalledWith('profiles')
    const tabela = fake.from.mock.results.at(-1)!.value
    expect(tabela.update).toHaveBeenCalledWith({ buyer_name: 'Maria Souza', phone: null, newsletter: false })
    expect(tabela.update.mock.results[0].value.eq).toHaveBeenCalledWith('id', 'u1')
  })

  it('sem sessão, pede para entrar de novo; erro do banco chega traduzido', async () => {
    const semSessao = await api
      .atualizarDadosDaConta({ nome: 'Maria Souza', telefone: '', newsletter: true })
      .catch((e) => e)
    expect(semSessao.message).toMatch(/Entre de novo/)

    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never)
    estado.respostaUpdate = async () => ({ data: null, error: { message: 'new row violates check constraint', code: '23514' } })
    const erro = await api
      .atualizarDadosDaConta({ nome: 'Maria Souza', telefone: '(11) 9000', newsletter: true })
      .catch((e) => e)
    expect(erro).toBeInstanceOf(api.ApiError)
  })
})

describe('fetchBetaProgram', () => {
  it('lê a linha de beta_program, com a data do lançamento', async () => {
    estado.respostaSingle = async (tabela) =>
      tabela === 'beta_program'
        ? {
            data: {
              open: false,
              ends_at: '2027-06-30T23:59:59-03:00',
              current_version: '1.0.0-beta.2',
              max_registrations: 50,
              launch_at: '2026-11-10T03:00:00+00:00',
            },
            error: null,
          }
        : { data: null, error: null }

    await expect(api.fetchBetaProgram()).resolves.toEqual({
      open: false,
      endsAt: '2027-06-30T23:59:59-03:00',
      currentVersion: '1.0.0-beta.2',
      maxRegistrations: 50,
      launchAt: '2026-11-10T03:00:00+00:00',
    })
    expect(fake.from).toHaveBeenCalledWith('beta_program')
  })

  it('banco sem a coluna launch_at (migração não aplicada): a data vem da reserva', async () => {
    estado.respostaSingle = async () => ({
      data: { open: true, ends_at: '2027-03-31T23:59:59-03:00', current_version: '1.0.0-beta.1', max_registrations: null },
      error: null,
    })
    await expect(api.fetchBetaProgram()).resolves.toMatchObject({ launchAt: BETA.lancamentoReserva })
  })

  it('cai na reserva (aberta) em erro, sem linha e sem cliente', async () => {
    estado.respostaSingle = async () => ({ data: null, error: { message: 'relation does not exist' } })
    await expect(api.fetchBetaProgram()).resolves.toBe(api.BETA_PROGRAM_RESERVA)

    estado.respostaSingle = async () => ({ data: null, error: null })
    await expect(api.fetchBetaProgram()).resolves.toBe(api.BETA_PROGRAM_RESERVA)

    clientMock.mockImplementation(() => {
      throw new Error('Supabase não configurado.')
    })
    await expect(api.fetchBetaProgram()).resolves.toBe(api.BETA_PROGRAM_RESERVA)
    expect(api.BETA_PROGRAM_RESERVA.open).toBe(true)
    expect(api.BETA_PROGRAM_RESERVA.endsAt).toBe(BETA.fimReserva)
    expect(api.BETA_PROGRAM_RESERVA.launchAt).toBe(BETA.lancamentoReserva)
  })
})

describe('e-mails de conta (confirmação e nova senha)', () => {
  it('reenviarConfirmacao reenvia o link do cadastro com o mesmo destino /confirmar-email', async () => {
    await api.reenviarConfirmacao('  Maria@Exemplo.com.br ')

    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'maria@exemplo.com.br',
      options: { emailRedirectTo: 'https://irisflow-communicator.pages.dev/confirmar-email' },
    })
  })

  it('reenviarConfirmacao traduz o intervalo mínimo entre envios', async () => {
    auth.resend.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: {
        message: 'For security purposes, you can only request this after 42 seconds.',
        status: 429,
        code: 'over_email_send_rate_limit',
      },
    } as never)

    const erro = await api.reenviarConfirmacao('maria@exemplo.com.br').catch((e) => e)
    expect(erro).toBeInstanceOf(api.ApiError)
    expect(erro.message).toBe('Aguarde 42 segundos antes de tentar de novo.')
  })

  it('requestPasswordReset usa /nova-senha do site público por padrão', async () => {
    await api.requestPasswordReset('maria@exemplo.com.br')

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('maria@exemplo.com.br', {
      redirectTo: 'https://irisflow-communicator.pages.dev/nova-senha',
    })
    expect(api.AUTH_REDIRECT).toEqual({
      confirmacao: 'https://irisflow-communicator.pages.dev/confirmar-email',
      novaSenha: 'https://irisflow-communicator.pages.dev/nova-senha',
    })
  })

  it('com VITE_SITE_URL no build, o link de nova senha vai para /nova-senha desse domínio', async () => {
    vi.stubEnv('VITE_SITE_URL', 'https://www.irisflow.com.br/')
    vi.resetModules()
    try {
      const apiComDominio = await import('./api')
      expect(apiComDominio.AUTH_REDIRECT.novaSenha).toBe('https://www.irisflow.com.br/nova-senha')
      expect(apiComDominio.AUTH_REDIRECT.confirmacao).toBe('https://www.irisflow.com.br/confirmar-email')

      await apiComDominio.requestPasswordReset('Maria@Exemplo.com.br')
      expect(auth.resetPasswordForEmail).toHaveBeenLastCalledWith('maria@exemplo.com.br', {
        redirectTo: 'https://www.irisflow.com.br/nova-senha',
      })
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})

describe('signUp (fluxo pago, fechado na beta)', () => {
  it('manda o telefone só com dígitos para complete_registration', async () => {
    auth.getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never)
    auth.signUp.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
    estado.respostaSingle = async (tabela) =>
      tabela === 'my_account'
        ? { data: { ...LINHA_MY_ACCOUNT, plan_id: 'completo', status: 'avaliacao' }, error: null }
        : { data: null, error: null }

    await api.signUp(perfilPago, 'segredo123', 'completo')

    expect(fake.rpc).toHaveBeenCalledWith(
      'complete_registration',
      expect.objectContaining({ p_phone: '11900000000', p_plan_id: 'completo' }),
    )
  })

  it('"Confirm email" ligado: signUp sem sessão vira ConfirmacaoDeEmailPendente e a RPC não roda', async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1' }, session: null }, error: null })

    const erro = await api.signUp(perfilPago, 'segredo123', 'completo').catch((e) => e)

    expect(erro).toBeInstanceOf(api.ConfirmacaoDeEmailPendente)
    expect(erro.email).toBe('maria@exemplo.com.br')
    expect(fake.rpc).not.toHaveBeenCalled()
  })
})

describe('fetchPerfilBasico', () => {
  it('lê nome, e-mail, telefone (só dígitos), newsletter e datas do próprio perfil', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email_confirmed_at: '2026-09-24T22:38:02Z' } } },
    } as never)
    estado.respostaSingle = async (tabela) =>
      tabela === 'profiles'
        ? {
            data: {
              buyer_name: 'Maria Souza',
              email: 'maria@exemplo.com.br',
              phone: '(11) 90000-0000',
              newsletter: false,
              created_at: '2026-09-24T22:37:43Z',
            },
            error: null,
          }
        : { data: null, error: null }

    await expect(api.fetchPerfilBasico()).resolves.toEqual({
      buyerName: 'Maria Souza',
      email: 'maria@exemplo.com.br',
      phone: '11900000000',
      newsletter: false,
      createdAt: '2026-09-24T22:37:43Z',
      emailConfirmedAt: '2026-09-24T22:38:02Z',
    })
    expect(fake.from).toHaveBeenCalledWith('profiles')
  })

  it('telefone NULL no banco vira string vazia; e-mail não confirmado vira null', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never)
    estado.respostaSingle = async () => ({
      data: { buyer_name: 'Maria Souza', email: 'maria@exemplo.com.br', phone: null, newsletter: true, created_at: '' },
      error: null,
    })

    await expect(api.fetchPerfilBasico()).resolves.toMatchObject({ phone: '', emailConfirmedAt: null })
  })

  it('sem sessão, com erro ou sem cliente, devolve null em vez de rejeitar', async () => {
    await expect(api.fetchPerfilBasico()).resolves.toBeNull()

    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } } as never)
    estado.respostaSingle = async () => ({ data: null, error: { message: 'boom' } })
    await expect(api.fetchPerfilBasico()).resolves.toBeNull()

    clientMock.mockImplementation(() => {
      throw new Error('sem cliente')
    })
    await expect(api.fetchPerfilBasico()).resolves.toBeNull()
  })
})

describe('markBetaDownload', () => {
  it('chama o RPC e engole erros: é métrica, não fluxo', async () => {
    await api.markBetaDownload('linux')
    expect(fake.rpc).toHaveBeenCalledWith('mark_beta_download', { p_os: 'linux' })

    fake.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api.markBetaDownload('windows')).resolves.toBeUndefined()

    clientMock.mockImplementation(() => {
      throw new Error('Supabase não configurado.')
    })
    await expect(api.markBetaDownload('macos')).resolves.toBeUndefined()
  })
})
