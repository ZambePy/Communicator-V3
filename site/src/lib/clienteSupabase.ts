import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/* O único arquivo do site que importa o supabase-js de verdade (216 KB, 57 KB
   comprimido). Quem precisa do cliente passa por obterCliente() em
   lib/supabase.ts, que carrega este arquivo com import() na primeira vez.
   Um teste (carregamentoSobDemanda.test.ts) garante que nenhum outro arquivo
   importa o pacote de forma estática: um import a mais aqui fora devolveria o
   supabase-js ao pedaço de entrada de todas as páginas. */

export function criarCliente(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })
}
