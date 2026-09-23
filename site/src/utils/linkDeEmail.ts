/* Links dos e-mails do Supabase Auth (confirmação de cadastro e nova senha).

   Quando o link já expirou ou foi usado, o Supabase não abre sessão e volta
   para o site com o motivo no endereço — no fragmento no fluxo padrão
   (#error=access_denied&error_code=otp_expired&error_description=...) ou na
   query. O supabase-js não limpa esse caso da URL, então a tela pode ler
   uma vez e dizer o que houve em vez de um genérico. */

const DESCRICOES: Record<string, string> = {
  'Email link is invalid or has expired': 'O link é inválido ou já expirou.',
  'Token has expired or is invalid': 'O link é inválido ou já expirou.',
}

/** Motivo legível, ou null se o endereço não traz erro de link. */
export function motivoDoLinkNaUrl(
  loc: Pick<Location, 'hash' | 'search'> = window.location,
): string | null {
  for (const parte of [loc.hash.replace(/^#/, ''), loc.search.replace(/^\?/, '')]) {
    if (!parte) continue
    const params = new URLSearchParams(parte)
    if (!params.get('error') && !params.get('error_code')) continue
    if (params.get('error_code') === 'otp_expired') return 'O link expirou.'
    const descricao = params.get('error_description')?.replace(/\+/g, ' ').trim()
    if (!descricao) return 'O link não é válido.'
    return DESCRICOES[descricao] ?? descricao
  }
  return null
}
