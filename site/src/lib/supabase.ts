import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { APELIDO_MINIMO, CONTATO } from '@/utils/validation'

/* ============================================================
   Cliente do Supabase.

   A URL e a chave anônima vêm do .env.local (ver .env.example).
   As duas são públicas e vão embutidas no bundle: quem protege os
   dados é a Row Level Security definida nas migrações de supabase/migrations/.

   Quando as variáveis não estão preenchidas, o cliente não é criado.
   Preferimos isso a criar um cliente inválido, porque assim a falha
   aparece com uma mensagem que diz o que fazer, em vez de um erro de
   rede solto no console.
   ============================================================ */

/**
 * Query e fragmento com que ESTA aba abriu o site, lidos antes de o
 * supabase-js limpar os tokens do endereço. Serve para saber em qual aba o
 * link do e-mail foi aberto: o evento de recuperação de senha é repassado a
 * todas as abas (BroadcastChannel), mas só a do link deve mudar de página.
 */
export const ENDERECO_INICIAL =
  typeof window === 'undefined' ? '' : `${window.location.search}${window.location.hash}`

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/** Falso enquanto o .env.local não tiver URL e chave. */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export const MSG_INDISPONIVEL =
  'O serviço está temporariamente indisponível. Tente de novo em alguns minutos ou escreva para irisflowteam@gmail.com.'

/** Devolve o cliente ou explica o que falta. Use em toda chamada. */
let avisou = false

export function client(): SupabaseClient {
  if (!supabase) {
    if (!avisou) {
      avisou = true
      // A instrução de configuração é para quem desenvolve e só existe no
      // `npm run dev` (o build de produção nem carrega o texto). Publicado
      // sem as variáveis, o site está quebrado de verdade: isso é um erro
      // real e fica registrado, em uma linha, sem detalhe de ambiente.
      // O que chega à tela é sempre MSG_INDISPONIVEL, que a família entende.
      if (import.meta.env.DEV) {
        console.warn(
          '[IrisFlow] Supabase sem configuração. Copie .env.example para .env.local, preencha ' +
            'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY com os valores de ' +
            'Project Settings > API e reinicie o servidor de desenvolvimento.',
        )
      } else {
        console.error('[IrisFlow] Este build foi publicado sem a configuração de contas.')
      }
    }
    throw new Error(MSG_INDISPONIVEL)
  }
  return supabase
}

/* ------------------------------------------------------------
   Mensagens de erro

   O supabase-js devolve texto em inglês, e às vezes nem texto: um 5xx do
   PostgREST pode chegar com o corpo HTML do gateway, e a falha de rede chega
   como "TypeError: Failed to fetch" (ou "Load failed" no Safari). A tela
   recebe SEMPRE português:

   - casos conhecidos, pela mensagem ou pelo código do GoTrue/PostgREST;
   - falha de rede e servidor fora do ar, com o que a pessoa pode fazer;
   - CHECK do banco (23514), pelo nome da constraint;
   - texto próprio do banco (P0001): as funções levantam frases para quem usa
     ("As vagas da beta acabaram…"), que passam como vieram; as técnicas vêm
     prefixadas com o nome da função ("confirmar_codigo: …") e não passam;
   - o resto vira um texto genérico. O detalhe fica no console.
   ------------------------------------------------------------ */
/** Exportada para a tela de acesso reconhecer o caso e oferecer o código de confirmação. */
export const EMAIL_NAO_CONFIRMADO =
  'Este e-mail ainda não foi confirmado. Digite o código de 4 dígitos que enviamos (confira também o spam) ou peça outro.'
/** Falha de rede (sem internet, conexão caiu no meio do envio). */
export const SEM_CONEXAO = 'Sem conexão com o servidor. Confira a internet e tente de novo.'
const JA_CADASTRADO = 'Já existe uma conta com este e-mail. Use a tela de acesso para entrar.'
const LIMITE_DE_EMAIL =
  'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.'
const FALHA_NO_ENVIO =
  'Não conseguimos enviar o e-mail agora. Tente de novo mais tarde ou escreva para irisflowteam@gmail.com.'
const LINK_VENCIDO = 'O link expirou ou já foi usado.'
const SESSAO_ENCERRADA = 'Sua sessão terminou. Entre de novo para continuar.'
const DADO_RECUSADO = 'Algum dado não passou na conferência do servidor. Confira os campos e tente de novo.'
const ERRO_INESPERADO =
  'Não foi possível concluir agora. Tente de novo em alguns minutos ou escreva para irisflowteam@gmail.com.'
const EMAIL_INVALIDO = 'E-mail inválido. Confira se tem “@” e o domínio (ex.: voce@exemplo.com.br).'

const TRADUCOES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': EMAIL_NAO_CONFIRMADO,
  'User already registered': JA_CADASTRADO,
  'Password should be at least 6 characters.': 'A senha precisa ter ao menos 8 caracteres.',
  'Password should be at least 8 characters.': 'A senha precisa ter ao menos 8 caracteres.',
  'For security purposes, you can only request this after 60 seconds.':
    'Aguarde um minuto antes de tentar de novo.',
  'Email rate limit exceeded': LIMITE_DE_EMAIL,
  'email rate limit exceeded': LIMITE_DE_EMAIL,
  'Error sending confirmation email': FALHA_NO_ENVIO,
  'Error sending recovery email': FALHA_NO_ENVIO,
  // links de e-mail verificados na página (verifyOtp com token_hash)
  'Email link is invalid or has expired': LINK_VENCIDO,
  'Token has expired or is invalid': LINK_VENCIDO,
  'New password should be different from the old password.': 'A nova senha precisa ser diferente da atual.',
  'Auth session missing!': SESSAO_ENCERRADA,
}

/* Os mesmos casos pelo código do GoTrue, que é estável entre versões (o texto
   em inglês às vezes muda). Os dois de envio aparecem com "Confirm email"
   ligado: o servidor de e-mail padrão do Supabase tem limite baixo e, sem
   SMTP próprio, só entrega para endereços da equipe do projeto. */
const TRADUCOES_POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: EMAIL_NAO_CONFIRMADO,
  user_already_exists: JA_CADASTRADO,
  over_email_send_rate_limit: LIMITE_DE_EMAIL,
  over_request_rate_limit: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  otp_expired: LINK_VENCIDO,
  flow_state_expired: LINK_VENCIDO,
  flow_state_not_found: LINK_VENCIDO,
  email_address_not_authorized: FALHA_NO_ENVIO,
  email_address_invalid: EMAIL_INVALIDO,
  validation_failed: DADO_RECUSADO,
  // Mínimo de 8 caracteres também no servidor (Auth → Email, desde 24/09/2026),
  // o mesmo do SENHA_MINIMA do site; sem exigência de tipos de caractere.
  weak_password: 'A senha precisa ter ao menos 8 caracteres.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  reauthentication_needed: 'Por segurança, entre de novo na conta antes de trocar a senha.',
  session_not_found: SESSAO_ENCERRADA,
  session_expired: SESSAO_ENCERRADA,
  bad_jwt: SESSAO_ENCERRADA,
  user_not_found: SESSAO_ENCERRADA,
  // PostgREST: token ausente, vencido ou inválido
  PGRST301: SESSAO_ENCERRADA,
  PGRST302: SESSAO_ENCERRADA,
  PGRST303: SESSAO_ENCERRADA,
  // funções do banco: "é preciso estar autenticado"
  '28000': SESSAO_ENCERRADA,
}

/** CHECKs do banco (código 23514), pelo nome da constraint. */
const CONSTRAINTS: Record<string, string> = {
  beneficiaries_user_name_check: `O nome de quem vai usar precisa ter ao menos ${APELIDO_MINIMO} letras.`,
  profiles_phone_check: 'Informe o telefone com DDD (10 ou 11 dígitos) ou deixe em branco.',
  contact_messages_name_check: `O nome precisa ter de ${CONTATO.nomeMinimo} a ${CONTATO.nomeMaximo} caracteres.`,
  contact_messages_message_check: `A mensagem precisa ter de ${CONTATO.mensagemMinima} a ${CONTATO.mensagemMaxima.toLocaleString('pt-BR')} caracteres.`,
  contact_messages_email_check: EMAIL_INVALIDO,
}

/** Mensagens-código levantadas pelas funções e gatilhos do banco (P0001). */
const MENSAGENS_DO_BANCO: Record<string, string> = {
  // gatilho de contact_messages: envio em lote ou muitos envios em pouco tempo
  limite_de_contato:
    'Recebemos muitas mensagens em pouco tempo. Aguarde alguns minutos e tente de novo, ou escreva direto para irisflowteam@gmail.com.',
}

/** Erros que o próprio site cria, já em português (services/api.ts). */
const ERROS_DO_SITE = new Set(['ApiError', 'CodigoIncorreto', 'ConfirmacaoDeEmailPendente'])

/** A requisição nem chegou ao servidor (ou a resposta não voltou). */
function ehFalhaDeRede(erro: unknown, bruta: string): boolean {
  const e = erro as { name?: unknown; status?: unknown } | null
  if (e?.name === 'AuthRetryableFetchError' && !(typeof e.status === 'number' && e.status >= 500)) return true
  if (e?.name === 'AbortError') return true
  return /^(?:\w*Error: )?(?:Failed to fetch|NetworkError when attempting to fetch resource|Load failed|Network request failed|The Internet connection appears to be offline|The network connection was lost)/i.test(
    bruta,
  )
}

/** O servidor respondeu com falha dele (5xx, gateway, banco sem conexão). */
function ehServidorFora(erro: unknown, codigo: string): boolean {
  const status = (erro as { status?: unknown } | null)?.status
  if (typeof status === 'number' && status >= 500) return true
  // PGRST000–PGRST003: o PostgREST sem conexão com o banco ou sem o cache do esquema
  return /^PGRST00\d$/.test(codigo)
}

export function mensagemDeErro(erro: unknown): string {
  if (!erro) return ERRO_INESPERADO

  // O detalhe técnico do erro original vai para o console, para quem depura;
  // a tela recebe só o texto traduzido.
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    console.debug('[IrisFlow] erro original:', erro)
  }

  // Texto escrito pelo próprio site (erro('…') em services/api.ts).
  if (typeof erro === 'string') return TRADUCOES[erro] ?? erro

  const nome = (erro as { name?: unknown }).name
  const bruta =
    erro instanceof Error ? erro.message : String((erro as { message?: unknown }).message ?? '')
  if (typeof nome === 'string' && ERROS_DO_SITE.has(nome) && bruta) return bruta
  if (bruta === MSG_INDISPONIVEL) return bruta

  if (TRADUCOES[bruta]) return TRADUCOES[bruta]

  // o intervalo mínimo entre dois e-mails vem com o número de segundos, que
  // diz mais do que a tradução genérica do código
  const espera = bruta.match(/only request this after (\d+) seconds?/)
  if (espera) return `Aguarde ${espera[1]} segundos antes de tentar de novo.`

  const bruto = (erro as { code?: unknown }).code
  const codigo = typeof bruto === 'string' ? bruto : ''
  if (codigo && TRADUCOES_POR_CODIGO[codigo]) return TRADUCOES_POR_CODIGO[codigo]

  if (ehFalhaDeRede(erro, bruta)) return SEM_CONEXAO
  if (ehServidorFora(erro, codigo)) return MSG_INDISPONIVEL
  if (nome === 'AuthSessionMissingError') return SESSAO_ENCERRADA

  // CHECK do banco: "new row for relation … violates check constraint "x""
  if (codigo === '23514') {
    const constraint = bruta.match(/check constraint "([^"]+)"/)?.[1] ?? ''
    return CONSTRAINTS[constraint] ?? DADO_RECUSADO
  }
  if (codigo === '23505') {
    if (bruta.includes('profiles_document_key')) return 'Este CPF já está cadastrado.'
    if (bruta.includes('profiles_email_key')) return 'Este e-mail já está cadastrado.'
    return DADO_RECUSADO
  }
  if (codigo === 'P0001') {
    if (MENSAGENS_DO_BANCO[bruta]) return MENSAGENS_DO_BANCO[bruta]
    // frase para quem usa (sem o prefixo "funcao: " das mensagens técnicas)
    if (bruta && !/^[a-z_]+:\s/.test(bruta)) return bruta
  }

  if (import.meta.env.MODE !== 'test') console.warn('[IrisFlow] erro sem tradução:', erro)
  return ERRO_INESPERADO
}
