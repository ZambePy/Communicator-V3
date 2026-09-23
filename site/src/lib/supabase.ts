import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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

   O supabase-js devolve texto em inglês. Estas traduções cobrem os
   casos que o site realmente encosta; o resto passa direto, porque
   inventar uma mensagem genérica esconderia a causa real.
   ------------------------------------------------------------ */
/** Exportada para a tela de acesso reconhecer o caso e oferecer o reenvio do link. */
export const EMAIL_NAO_CONFIRMADO =
  'Este e-mail ainda não foi confirmado. Verifique a caixa de entrada (e o spam) e clique no link de confirmação.'
const JA_CADASTRADO = 'Já existe uma conta com este e-mail. Use a tela de acesso para entrar.'
const LIMITE_DE_EMAIL =
  'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.'
const FALHA_NO_ENVIO =
  'Não conseguimos enviar o e-mail agora. Tente de novo mais tarde ou escreva para irisflowteam@gmail.com.'

const TRADUCOES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': EMAIL_NAO_CONFIRMADO,
  'User already registered': JA_CADASTRADO,
  'Password should be at least 6 characters.': 'A senha precisa ter ao menos 8 caracteres.',
  'For security purposes, you can only request this after 60 seconds.':
    'Aguarde um minuto antes de tentar de novo.',
  'Email rate limit exceeded': LIMITE_DE_EMAIL,
  'email rate limit exceeded': LIMITE_DE_EMAIL,
  'Error sending confirmation email': FALHA_NO_ENVIO,
  'Error sending recovery email': FALHA_NO_ENVIO,
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
  email_address_not_authorized: FALHA_NO_ENVIO,
}

export function mensagemDeErro(erro: unknown): string {
  if (!erro) return 'Erro desconhecido.'

  // O detalhe técnico do erro original vai para o console, para quem depura;
  // a tela recebe só o texto traduzido.
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    console.debug('[IrisFlow] erro original:', erro)
  }

  const bruta =
    typeof erro === 'string'
      ? erro
      : erro instanceof Error
        ? erro.message
        : String((erro as { message?: string }).message ?? erro)

  if (TRADUCOES[bruta]) return TRADUCOES[bruta]

  // o intervalo mínimo entre dois e-mails vem com o número de segundos, que
  // diz mais do que a tradução genérica do código
  const espera = bruta.match(/only request this after (\d+) seconds?/)
  if (espera) return `Aguarde ${espera[1]} segundos antes de tentar de novo.`

  const codigo = (erro as { code?: unknown } | null)?.code
  if (typeof codigo === 'string' && TRADUCOES_POR_CODIGO[codigo]) {
    return TRADUCOES_POR_CODIGO[codigo]
  }

  // erros vindos dos CHECKs e das funções do banco chegam prefixados
  if (bruta.includes('duplicate key') && bruta.includes('profiles_document_key')) {
    return 'Este CPF já está cadastrado.'
  }
  if (bruta.includes('duplicate key') && bruta.includes('profiles_email_key')) {
    return 'Este e-mail já está cadastrado.'
  }
  return bruta
}
