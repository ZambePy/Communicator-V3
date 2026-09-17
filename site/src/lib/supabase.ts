import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/* ============================================================
   Cliente do Supabase.

   A URL e a chave anônima vêm do .env.local (ver .env.example).
   As duas são públicas e vão embutidas no bundle: quem protege os
   dados é a Row Level Security definida em supabase/schema.sql.

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

const AVISO_SEM_CONFIG =
  'Supabase não configurado. Copie .env.example para .env.local, preencha ' +
  'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY com os valores de ' +
  'Project Settings > API e reinicie o servidor de desenvolvimento.'

/** Devolve o cliente ou explica o que falta. Use em toda chamada. */
export function client(): SupabaseClient {
  if (!supabase) throw new Error(AVISO_SEM_CONFIG)
  return supabase
}

/* ------------------------------------------------------------
   Mensagens de erro

   O supabase-js devolve texto em inglês. Estas traduções cobrem os
   casos que o site realmente encosta; o resto passa direto, porque
   inventar uma mensagem genérica esconderia a causa real.
   ------------------------------------------------------------ */
const TRADUCOES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed':
    'Este e-mail ainda não foi confirmado. Verifique a caixa de entrada, ou desligue ' +
    '"Confirm email" em Authentication > Sign In / Providers > Email no painel do Supabase.',
  'User already registered': 'Já existe uma conta com este e-mail. Use a tela de acesso para entrar.',
  'Password should be at least 6 characters.': 'A senha precisa ter ao menos 6 caracteres.',
  'For security purposes, you can only request this after 60 seconds.':
    'Aguarde um minuto antes de tentar de novo.',
}

export function mensagemDeErro(erro: unknown): string {
  if (!erro) return 'Erro desconhecido.'

  const bruta =
    typeof erro === 'string'
      ? erro
      : erro instanceof Error
        ? erro.message
        : String((erro as { message?: string }).message ?? erro)

  if (TRADUCOES[bruta]) return TRADUCOES[bruta]

  // erros vindos dos CHECKs e das funções do banco chegam prefixados
  if (bruta.includes('duplicate key') && bruta.includes('profiles_document_key')) {
    return 'Este CPF já está cadastrado.'
  }
  if (bruta.includes('duplicate key') && bruta.includes('profiles_email_key')) {
    return 'Este e-mail já está cadastrado.'
  }
  return bruta
}
