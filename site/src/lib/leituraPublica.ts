/* ============================================================
   Leituras públicas do banco, direto no endpoint REST.

   O programa beta (beta_program) e os planos (plans) são tabelas de leitura
   pública (políticas beta_program_public_read e plans_public_read): bastam a
   URL e a chave anônima, que já vão no bundle. Um `fetch` de poucas linhas
   atende, e o cabeçalho (que lê o programa beta em toda página) deixa de
   puxar o supabase-js inteiro (auditoria de 21/10/2026, P2-3).

   Tempo limite de 4 s: o banco pendurado não pode deixar a página esperando
   (auditoria de 21/10/2026, P2-1: os preços ficavam em esqueleto). Quem chama
   já tem uma reserva pronta e a mostra na hora.
   ============================================================ */

const TEMPO_LIMITE_MS = 4000

/**
 * Linhas de uma tabela pública. Rejeita em qualquer falha (build sem
 * configuração, rede, tempo esgotado, resposta de erro, corpo que não é uma
 * lista); quem chama decide a reserva.
 */
export async function lerLinhasPublicas<T>(
  tabela: string,
  consulta: Record<string, string>,
  tempoLimiteMs: number = TEMPO_LIMITE_MS,
): Promise<T[]> {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !chave) throw new Error('Supabase sem configuração.')

  const controle = new AbortController()
  const relogio = window.setTimeout(() => controle.abort(), tempoLimiteMs)
  try {
    const resposta = await fetch(`${url}/rest/v1/${tabela}?${new URLSearchParams(consulta)}`, {
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, Accept: 'application/json' },
      signal: controle.signal,
    })
    if (!resposta.ok) throw new Error(`Leitura de ${tabela} recusada (${resposta.status}).`)
    const corpo: unknown = await resposta.json()
    if (!Array.isArray(corpo)) throw new Error(`Resposta inesperada de ${tabela}.`)
    return corpo as T[]
  } finally {
    window.clearTimeout(relogio)
  }
}
