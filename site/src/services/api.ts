/* ============================================================
   Integração com o Supabase.

   Este arquivo é a única parte do site que conhece o banco. As páginas
   e o AccountContext falam só com as funções daqui, então trocar de
   provedor um dia não passa deste arquivo.

   O esquema correspondente está nas migrações de ../supabase/migrations/
   (a base é 20260923022346_schema_base.sql; a da beta, 20260923022616_beta.sql).
   ============================================================ */

import { client, mensagemDeErro } from '@/lib/supabase'
import type { Account, BetaProfile, Payment, Profile } from '@/context/AccountContext'
import { BETA, getPlan, PLANS, SITE_URL, type Plan, type PlanId } from '@/data/content'
import { absoluteUrl } from '@/seo/site'
import { phoneDigits } from '@/utils/format'

/** Base de uma API própria, caso existam Edge Functions. Opcional. */
export const API_URL = import.meta.env.VITE_API_URL ?? ''

/**
 * Para onde os links dos e-mails do Supabase Auth levam. A origem é a
 * pública do site (VITE_SITE_URL, padrão em src/seo/site.ts), e não a da
 * aba atual: o link precisa funcionar mesmo aberto em outro aparelho. As
 * duas URLs precisam estar em Authentication > URL Configuration >
 * Redirect URLs no painel — fora da lista, o Supabase ignora o destino e
 * manda para a Site URL.
 */
export const AUTH_REDIRECT = {
  /** Link de confirmação do cadastro: volta para o acesso, já com a sessão aberta. */
  confirmacao: absoluteUrl(SITE_URL, '/entrar'),
  /** Link de redefinição de senha. */
  novaSenha: absoluteUrl(SITE_URL, '/nova-senha'),
}

/**
 * Link do app do cuidador (APK, Expo ou loja), mostrado na página /beta.
 * Vazio = a página diz que o link chega por e-mail.
 */
export const APP_CUIDADOR_URL = import.meta.env.VITE_APP_CUIDADOR_URL ?? ''

/** Erro já traduzido, para as telas exibirem direto. */
export class ApiError extends Error {
  /** Código do PostgREST ou do GoTrue, quando o erro original trouxe um. */
  readonly code?: string
  /** Status HTTP, quando o erro original trouxe um. */
  readonly status?: number

  constructor(causa: unknown) {
    super(mensagemDeErro(causa))
    this.name = 'ApiError'
    const bruto = causa as { code?: unknown; status?: unknown } | null | undefined
    this.code = typeof bruto?.code === 'string' ? bruto.code : undefined
    this.status = typeof bruto?.status === 'number' ? bruto.status : undefined
  }
}

/**
 * Distingue "a sessão não vale mais" de "não deu para falar com o servidor".
 *
 * A diferença importa: só o primeiro caso justifica derrubar a sessão e
 * mandar o usuário para /entrar. Uma falha de rede tratada como logout
 * expulsava o usuário do painel no meio do uso.
 *
 * Falha de rede (`TypeError: Failed to fetch`) não tem nem `code` nem
 * `status`, então cai fora daqui por construção.
 */
export function ehErroDeAutenticacao(erro: unknown): boolean {
  const status = (erro as { status?: unknown })?.status
  const code = (erro as { code?: unknown })?.code
  if (status === 401 || status === 403) return true
  // PGRST301: JWT ausente, expirado ou inválido. PGRST302: sem credencial.
  return code === 'PGRST301' || code === 'PGRST302'
}

function erro(causa: unknown): never {
  throw new ApiError(causa)
}

/**
 * O usuário foi criado, mas o projeto exige confirmar o e-mail ("Confirm
 * email" ligado) e o signUp voltou sem sessão. Não é uma falha: a tela da
 * beta troca o formulário pelo aviso de "confirme o e-mail", e o cadastro
 * pago mostra a mensagem. Depois de confirmar e entrar, a conta sem
 * inscrição é levada de volta a /beta para concluir.
 */
export class ConfirmacaoDeEmailPendente extends Error {
  /** E-mail para onde o link foi (ou seria) enviado, já normalizado. */
  readonly email: string

  constructor(email: string) {
    super(
      'Conta criada. Confirme o e-mail pelo link que enviamos (confira também o spam) e ' +
        'depois entre com o mesmo e-mail e senha para continuar.',
    )
    this.name = 'ConfirmacaoDeEmailPendente'
    this.email = email
  }
}

/* ------------------------------------------------------------
   A view my_account devolve perfil, beneficiário, assinatura e forma
   de pagamento numa linha só. Aqui ela volta ao formato Account que
   as páginas já usam, para que nenhuma tela precise ser reescrita.
   ------------------------------------------------------------ */

type MyAccountRow = {
  subscription_id: string
  profile_id: string
  buyer_name: string
  email: string
  phone: string | null
  document: string | null
  newsletter: boolean
  user_name: string | null
  relation: string | null
  condition: string | null
  os: string | null
  prescriber_name: string | null
  prescriber_role: string | null
  status: Account['status']
  plan_id: string | null
  price_brl: number | string
  trial_ends_at: string
  next_charge_at: string
  canceled_at: string | null
  created_at: string
  payment_method: Payment['method'] | null
  billing_interval: 'mensal' | 'anual' | null
  card_last4: string | null
  card_brand: string | null
  holder: string | null
}

const COLUNAS = `
  subscription_id, profile_id, buyer_name, email, phone, document, newsletter,
  user_name, relation, condition, os, prescriber_name, prescriber_role,
  status, plan_id, price_brl, trial_ends_at, next_charge_at, canceled_at, created_at,
  payment_method, billing_interval, card_last4, card_brand, holder
`

function paraAccount(row: MyAccountRow): Account {
  return {
    id: row.subscription_id,
    profile: {
      buyerName: row.buyer_name,
      email: row.email,
      phone: row.phone ?? '',
      document: row.document ?? '',
      userName: row.user_name ?? '',
      relation: row.relation ?? '',
      condition: row.condition ?? '',
      os: row.os ?? '',
      prescriberName: row.prescriber_name ?? undefined,
      prescriberRole: row.prescriber_role ?? undefined,
      newsletter: row.newsletter,
    },
    payment: row.payment_method
      ? {
          method: row.payment_method,
          cardLast4: row.card_last4 ?? undefined,
          cardBrand: row.card_brand ?? undefined,
          holder: row.holder ?? undefined,
          // o checkout usa 1 para mensal e 12 para anual
          installments: row.billing_interval === 'anual' ? 12 : 1,
        }
      : undefined,
    status: row.status,
    createdAt: row.created_at,
    trialEndsAt: row.trial_ends_at,
    nextChargeAt: row.next_charge_at,
    // numeric pode chegar como texto, dependendo da versão do PostgREST
    priceBRL: Number(row.price_brl),
    // getPlan cai no plano recomendado quando row.plan_id vem null (assinaturas
    // antigas, criadas antes da migração para três planos)
    planId: getPlan(row.plan_id).id,
  }
}

/* ---------------- sessão ---------------- */

/**
 * Cria o usuário no Supabase Auth, se ainda não houver sessão aberta.
 *
 * Uma tentativa anterior pode ter criado o usuário e falhado adiante.
 * Nesse caso a sessão já existe, e repetir o signUp só daria
 * "User already registered", travando o cadastro. Então só criamos o
 * usuário quando ainda não há sessão aberta. Compartilhado pelo cadastro
 * pago (`signUp`) e pelo da beta (`signUpBeta`).
 */
async function criarUsuarioSeNecessario(profile: Profile, password: string): Promise<void> {
  const sb = client()
  const { data: sessaoAtual } = await sb.auth.getSession()
  if (sessaoAtual.session) return

  const email = profile.email.trim().toLowerCase()
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { buyer_name: profile.buyerName, newsletter: profile.newsletter },
      // Só é usado com "Confirm email" ligado: o link do e-mail abre /entrar
      // já autenticado, e de lá a conta sem inscrição volta para concluir.
      emailRedirectTo: AUTH_REDIRECT.confirmacao,
    },
  })
  if (error) erro(error)

  // Sem sessão aqui significa "Confirm email" ligado no painel: o usuário
  // existe, mas ainda não está autenticado, e a RPC seguinte seria negada.
  // Com um e-mail que já tinha conta, o Supabase responde igual (sem sessão
  // e sem erro) de propósito, para não revelar quem é cliente — por isso o
  // aviso da tela é o mesmo nos dois casos.
  if (!data.session) throw new ConfirmacaoDeEmailPendente(email)
}

/**
 * Reenvia o link de confirmação do cadastro. Resolve em silêncio também
 * para e-mail sem conta (o Supabase não diz a diferença); o único erro que
 * costuma chegar é o de intervalo mínimo entre envios, já traduzido.
 */
export async function reenviarConfirmacao(email: string): Promise<void> {
  const { error } = await client().auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: AUTH_REDIRECT.confirmacao },
  })
  if (error) erro(error)
}

/**
 * Cria a conta e abre o período de avaliação.
 *
 * São dois passos porque os dados sensíveis não podem ir no signUp: o
 * que se manda em `options.data` vira raw_user_meta_data, é escrito
 * pelo próprio cliente e viaja dentro do JWT. CPF e condição de saúde
 * entram depois, pela função complete_registration, que roda no banco.
 */
export async function signUp(profile: Profile, password: string, planId: PlanId): Promise<Account> {
  const sb = client()
  await criarUsuarioSeNecessario(profile, password)

  const { error: erroRpc } = await sb.rpc('complete_registration', {
    // só dígitos (ou null): o CHECK de profiles.phone aceita 10–11 dígitos
    p_phone: phoneDigits(profile.phone),
    p_document: profile.document,
    p_user_name: profile.userName,
    p_relation: profile.relation,
    p_condition: profile.condition,
    p_os: profile.os,
    p_prescriber_name: profile.prescriberName ?? null,
    p_prescriber_role: profile.prescriberRole ?? null,
    p_newsletter: profile.newsletter,
    p_plan_id: planId,
  })
  if (erroRpc) erro(erroRpc)

  const conta = await fetchAccount()
  if (!conta) erro('A conta foi criada, mas não foi possível carregá-la.')
  return conta
}

/* ---------------- programa beta ----------------
   Contrato no README da raiz (seções "Conta IrisFlow e nuvem" e "Site
   (site/)"); banco em ../supabase/migrations/20260923022616_beta.sql.
   Mesmo desenho do cadastro pago, com três diferenças: o CPF é opcional,
   não há plano a escolher (é sempre 'beta', sem cobrança) e a inscrição
   grava a linha de beta_registrations.
   ------------------------------------------------ */

/**
 * Cria a conta da beta: `auth.signUp` (se ainda não há sessão) seguido de
 * `complete_beta_registration`. CPF e telefone são opcionais: vazios viram
 * null, que o banco aceita. O telefone vai só com os dígitos — nunca a
 * máscara nem uma string fora do formato —, e null mantém o número que a
 * conta já tiver (migração 20260923022800_telefone_opcional.sql).
 *
 * Com uma sessão já aberta (conta criada numa tentativa anterior, ou que
 * acabou de confirmar o e-mail), o signUp é pulado e a senha não é usada.
 */
export async function signUpBeta(profile: BetaProfile, password: string): Promise<Account> {
  const sb = client()
  await criarUsuarioSeNecessario(profile, password)

  const { error: erroRpc } = await sb.rpc('complete_beta_registration', {
    p_phone: phoneDigits(profile.phone),
    p_user_name: profile.userName,
    p_relation: profile.relation,
    p_condition: profile.condition,
    p_os: profile.os,
    p_document: profile.document.trim() || null,
    p_wants_caregiver_app: profile.wantsCaregiverApp,
    p_feedback_consent: profile.feedbackConsent,
    p_how_found: profile.howFound?.trim() || null,
    p_newsletter: profile.newsletter,
    p_prescriber_name: profile.prescriberName ?? null,
    p_prescriber_role: profile.prescriberRole ?? null,
  })
  if (erroRpc) erro(erroRpc)

  const conta = await fetchAccount()
  if (!conta) erro('A inscrição foi feita, mas não foi possível carregar a conta.')
  return conta
}

/** Estado do programa beta, lido de `beta_program` (uma linha, pública). */
export type BetaProgram = {
  /** Aceita inscrições? */
  open: boolean
  /** Fim do acesso de quem se inscreve (ISO). */
  endsAt: string
  /** Versão do instalador exibida na página /beta. */
  currentVersion: string
  /** Limite de inscrições, ou null para sem limite. */
  maxRegistrations: number | null
}

/** Usado enquanto a consulta não volta, e em qualquer falha. */
export const BETA_PROGRAM_RESERVA: BetaProgram = {
  open: true,
  endsAt: BETA.fimReserva,
  currentVersion: BETA.versaoReserva,
  maxRegistrations: null,
}

type BetaProgramRow = {
  open: boolean
  ends_at: string
  current_version: string | null
  max_registrations: number | null
}

/**
 * Nunca rejeita: em qualquer falha (sem rede, sem .env.local, migração não
 * aplicada) devolve a reserva, para a página /beta continuar aparecendo.
 */
export async function fetchBetaProgram(): Promise<BetaProgram> {
  try {
    const { data, error } = await client()
      .from('beta_program')
      .select('open, ends_at, current_version, max_registrations')
      .eq('id', 1)
      .maybeSingle()

    if (error || !data) return BETA_PROGRAM_RESERVA
    const row = data as BetaProgramRow
    return {
      open: Boolean(row.open),
      endsAt: row.ends_at || BETA.fimReserva,
      currentVersion: row.current_version || BETA.versaoReserva,
      maxRegistrations: typeof row.max_registrations === 'number' ? row.max_registrations : null,
    }
  } catch {
    return BETA_PROGRAM_RESERVA
  }
}

/**
 * Registra o primeiro clique em "baixar" (métrica da beta). Erros são
 * engolidos de propósito: uma falha aqui não pode atrapalhar o download.
 */
export async function markBetaDownload(os: 'windows' | 'macos' | 'linux'): Promise<void> {
  try {
    await client().rpc('mark_beta_download', { p_os: os })
  } catch {
    // métrica, não fluxo
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) erro(error)
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut()
  if (error) erro(error)
}

/* ---------------- recuperação de senha ----------------
   Dois passos, os dois no Supabase Auth:

   1. requestPasswordReset manda o e-mail com o link. O link aponta para
      /nova-senha do site público (AUTH_REDIRECT.novaSenha), e por isso a
      URL precisa estar cadastrada em Authentication > URL Configuration >
      Redirect URLs no painel — sem isso o Supabase ignora o redirectTo e
      manda para a Site URL.
   2. updatePassword troca a senha. Só funciona com sessão aberta, que é
      a que o link do e-mail abre ao chegar em /nova-senha.
   ------------------------------------------------------ */

/**
 * Pede o e-mail de redefinição. Resolve sem erro tanto quando o e-mail
 * existe quanto quando não existe: o GoTrue responde 200 nos dois casos,
 * e a tela deve manter a mensagem neutra — confirmar que "esse e-mail
 * tem conta" entregaria a lista de clientes a quem testasse endereços.
 * O único erro que chega aqui é o de limite de envio (60 s), traduzido.
 */
export async function requestPasswordReset(
  email: string,
  redirectTo: string = AUTH_REDIRECT.novaSenha,
): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  })
  if (error) erro(error)
}

/** Troca a senha do usuário da sessão atual (a de recuperação, ou a normal). */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password })
  if (error) erro(error)
}

/** Conta do usuário logado, ou null se não houver sessão. */
export async function fetchAccount(): Promise<Account | null> {
  const sb = client()

  const { data: sessao } = await sb.auth.getSession()
  if (!sessao.session) return null

  // maybeSingle: quem se autenticou mas ainda não concluiu o cadastro
  // não tem assinatura, e isso não é erro.
  const { data, error } = await sb.from('my_account').select(COLUNAS).maybeSingle()
  if (error) erro(error)

  return data ? paraAccount(data as MyAccountRow) : null
}

/** O que a conta já tem antes de concluir a inscrição (nome e e-mail do signUp). */
export type PerfilBasico = {
  buyerName: string
  email: string
  /** Só dígitos; vazio quando não informado (a coluna aceita NULL). */
  phone: string
  newsletter: boolean
}

/**
 * Perfil da sessão atual, lido de `profiles` (a RLS só deixa ver o próprio).
 * Existe desde o signUp, pelo gatilho on_auth_user_created, mesmo quando a
 * inscrição não foi concluída — é o que a /beta usa para não pedir de novo
 * nome e e-mail a quem voltou depois de confirmar o endereço. Nunca rejeita:
 * sem sessão, sem rede ou sem linha, devolve null e o formulário segue vazio.
 */
export async function fetchPerfilBasico(): Promise<PerfilBasico | null> {
  try {
    const sb = client()
    const { data: sessao } = await sb.auth.getSession()
    const uid = sessao.session?.user.id
    if (!uid) return null

    const { data, error } = await sb
      .from('profiles')
      .select('buyer_name, email, phone, newsletter')
      .eq('id', uid)
      .maybeSingle()
    if (error || !data) return null

    const row = data as { buyer_name: string; email: string; phone: string | null; newsletter: boolean }
    return {
      buyerName: row.buyer_name ?? '',
      email: row.email ?? '',
      phone: phoneDigits(row.phone) ?? '',
      newsletter: Boolean(row.newsletter),
    }
  } catch {
    return null
  }
}

/* ---------------- assinatura ---------------- */

export async function attachPaymentMethod(payment: Payment): Promise<void> {
  const { error } = await client().rpc('attach_payment_method', {
    p_method: payment.method,
    p_billing_interval: payment.installments === 12 ? 'anual' : 'mensal',
    p_card_last4: payment.cardLast4 ?? null,
    p_card_brand: payment.cardBrand ?? null,
    p_holder: payment.holder ?? null,
    p_gateway_token: null, // preencher quando o gateway entrar
  })
  if (error) erro(error)
}

export async function cancelSubscription(): Promise<void> {
  const { error } = await client().rpc('request_cancellation')
  if (error) erro(error)
}

export async function reactivateSubscription(): Promise<void> {
  const { error } = await client().rpc('reactivate_subscription')
  if (error) erro(error)
}

/* ---------------- contato ---------------- */

export async function sendContactMessage(input: {
  name: string
  email: string
  role: string
  message: string
}): Promise<void> {
  const { error } = await client()
    .from('contact_messages')
    .insert({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      message: input.message.trim(),
    })
  if (error) erro(error)
}

/* ---------------- instaladores ----------------
   Os links de download não passam pelo banco: vêm do GitHub Releases,
   montados em src/lib/releases.ts a partir de VITE_RELEASES_REPO e
   VITE_RELEASES_AVAILABLE. A tabela app_releases do esquema base ficou no
   banco, mas ninguém a lê — nem o site nem o desktop, que se atualiza pelo
   próprio GitHub Releases.
   ------------------------------------------------ */

/* ---------------- planos ----------------
   O preço de verdade mora em public.plans: é o que complete_registration
   grava na assinatura e o que a cobrança vai usar. A cópia em
   src/data/content.ts é RESERVA, usada enquanto a consulta não volta e
   quando ela falha (sem rede, sem .env.local, política RLS trocada).

   A tabela tem id, name, price_brl, trial_days, active e purchasable. Não
   há coluna de limite de dispositivos nem de suporte, então esses textos,
   os bullets e as notas continuam vindo do content.ts, casados pelo id.

   `purchasable` (migração 20260923022616_beta.sql) diz se o plano pode ser
   contratado: durante a beta todos ficam false e o card aparece como
   indisponível. Na reserva (`PLANS`), quem decide é `BETA.ativo`, já no
   content.ts — a identidade do array é preservada porque usePlans a usa
   para distinguir "veio do banco" de "reserva".
   ---------------------------------------- */

type PlanRow = {
  id: string
  name: string
  price_brl: number | string
  /** Ausente em bancos anteriores à migração da beta: vale true. */
  purchasable?: boolean | null
}

/**
 * Casa as linhas do banco com o texto de venda, pelo id.
 *
 * A ordem é a do content.ts, porque é lá que se decide a posição de cada
 * cartão. Um plano que o banco marcou como inativo some do site, que é
 * exatamente o que se espera de "fonte da verdade"; um plano que existe
 * só no banco, sem texto de venda, não tem como ser exibido e fica de
 * fora até alguém escrever o card. Se nada sobrar (tabela vazia, ids
 * todos diferentes), volta a reserva inteira em vez de uma grade vazia.
 */
function mesclarPlanos(linhas: PlanRow[]): Plan[] {
  const doBanco = new Map(linhas.map((r) => [r.id, r]))

  const planos = PLANS.flatMap<Plan>((base) => {
    const linha = doBanco.get(base.id)
    if (!linha) return []
    // numeric chega como texto em algumas versões do PostgREST
    const price = Number(linha.price_brl)
    if (!Number.isFinite(price)) return []
    return [
      {
        ...base,
        name: linha.name || base.name,
        price,
        // coluna ausente (banco antigo) ou null = pode contratar
        purchasable: linha.purchasable !== false,
      },
    ]
  })

  return planos.length > 0 ? planos : PLANS
}

/**
 * Planos à venda. Nunca rejeita: em qualquer falha devolve `PLANS`, o
 * mesmo array (por identidade) do content.ts, para quem chamou saber
 * que está olhando para a reserva e não para o banco.
 */
export async function fetchPlans(): Promise<Plan[]> {
  try {
    const { data, error } = await client()
      .from('plans')
      .select('id, name, price_brl, purchasable')
      .eq('active', true)

    if (error || !data) return PLANS
    return mesclarPlanos(data as PlanRow[])
  } catch {
    // client() lança quando o .env.local está vazio; a grade continua
    // aparecendo com os valores da reserva.
    return PLANS
  }
}

/* ---------------- pagamento ----------------
   Continua fora do banco de propósito. Dados de cartão nunca devem
   trafegar pelo servidor da aplicação: o SDK do gateway tokeniza no
   navegador e só o token vai para attachPaymentMethod.
   ------------------------------------------ */

export async function tokenizeCard(_card: {
  number: string
  holder: string
  expiry: string
  cvv: string
}): Promise<{ token: string; last4: string; brand: string }> {
  // Stripe:        stripe.createPaymentMethod({ type: 'card', card })
  // Mercado Pago:  mp.createCardToken({ ... })
  // Pagar.me:      pagarme.client.cards.create({ ... })
  throw new Error('tokenizeCard: integrar com o SDK do gateway')
}

export async function createPixCharge(_accountId: string): Promise<{
  qrCode: string
  copyPaste: string
  expiresAt: string
}> {
  throw new Error('createPixCharge: integrar com o gateway')
}

export async function createBoleto(_accountId: string): Promise<{
  barcode: string
  pdfUrl: string
  dueAt: string
}> {
  throw new Error('createBoleto: integrar com o gateway')
}

/* ---------------- ecossistema: desktop e app do cuidador ----------------
   O e-mail e a senha desta conta também abrem o aplicativo desktop e o app
   do cuidador. As funções abaixo leem o que a migração
   supabase/migrations/20260923022507_integracao_ecossistema.sql acrescentou.
   ------------------------------------------------------------------------ */

/** Resposta de `desktop_license()` — a MESMA regra que o desktop consulta ao entrar. */
export type AppLicense = {
  allowed: boolean
  reason:
    | 'beta'
    | 'beta_encerrada'
    | 'avaliacao'
    | 'avaliacao_encerrada'
    | 'ativa'
    | 'inadimplente'
    | 'cancelada'
    | 'sem_assinatura'
    | string
  status: string | null
  plan_id: string | null
  plan_name: string | null
  access_until: string | null
  checked_at: string
  beneficiary: { id: string; user_name: string } | null
  features: {
    relatorios: boolean
    multiplos_dispositivos: boolean
    assistente: boolean
    voz: boolean
  }
}

export async function fetchAppLicense(): Promise<AppLicense> {
  const { data, error } = await client().rpc('desktop_license')
  if (error) erro(error)
  return data as AppLicense
}

/** Computador com a IrisFlow instalada, vinculado ao beneficiário desta conta. */
export type LinkedDevice = {
  id: string
  name: string
  os: 'windows' | 'macos' | 'linux'
  appVersion: string
  hostname: string | null
  pairedAt: string
  lastSeenAt: string
  revokedAt: string | null
  /** heartbeat do desktop a cada 30 s: visto há menos de 90 s = online */
  online: boolean
  cameraOk: boolean
  trackerOk: boolean
  calibrated: boolean
}

export async function fetchDevices(): Promise<LinkedDevice[]> {
  const { data, error } = await client()
    .from('devices')
    .select(
      'id, name, os, app_version, hostname, paired_at, last_seen_at, revoked_at, camera_ok, tracker_ok, calibrated',
    )
    .order('paired_at', { ascending: false })
  if (error) erro(error)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) || 'Computador',
    os: r.os as LinkedDevice['os'],
    appVersion: (r.app_version as string) ?? '',
    hostname: (r.hostname as string | null) ?? null,
    pairedAt: r.paired_at as string,
    lastSeenAt: r.last_seen_at as string,
    revokedAt: (r.revoked_at as string | null) ?? null,
    online: !r.revoked_at && Date.now() - new Date(r.last_seen_at as string).getTime() < 90_000,
    cameraOk: Boolean(r.camera_ok),
    trackerOk: Boolean(r.tracker_ok),
    calibrated: Boolean(r.calibrated),
  }))
}

/** Desvincula um computador. A partir daí o desktop volta a pedir e-mail e senha. */
export async function revokeDevice(deviceId: string): Promise<void> {
  const { error } = await client().rpc('revoke_device', { p_device_id: deviceId })
  if (error) erro(error)
}
