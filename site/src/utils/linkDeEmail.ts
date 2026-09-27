/* Links dos e-mails do Supabase Auth (confirmação de cadastro e nova senha).

   Quando o link já expirou ou foi usado, o Supabase não abre sessão e volta
   para o site com o motivo no endereço — no fragmento no fluxo padrão
   (#error=access_denied&error_code=otp_expired&error_description=...) ou na
   query. O supabase-js não limpa esse caso da URL, então a tela pode ler
   uma vez e dizer o que houve em vez de um genérico. */

const POR_CODIGO: Record<string, string> = {
  otp_expired: 'O link expirou.',
  flow_state_expired: 'O link expirou.',
  flow_state_not_found: 'O link não é válido.',
}

const DESCRICOES: Record<string, string> = {
  'Email link is invalid or has expired': 'O link é inválido ou já expirou.',
  'Token has expired or is invalid': 'O link é inválido ou já expirou.',
}

/**
 * Motivo legível, ou null se o endereço não traz erro de link.
 *
 * Só textos conhecidos. A descrição que vem no endereço NUNCA é mostrada
 * como veio: qualquer pessoa pode escrever uma frase ali ("sua conta será
 * bloqueada, pague…") e mandar o link — o aviso sairia com cara de oficial,
 * no domínio da IrisFlow.
 */
export function motivoDoLinkNaUrl(
  loc: Pick<Location, 'hash' | 'search'> = window.location,
): string | null {
  for (const parte of [loc.hash.replace(/^#/, ''), loc.search.replace(/^\?/, '')]) {
    if (!parte) continue
    const params = new URLSearchParams(parte)
    if (!params.get('error') && !params.get('error_code')) continue
    const codigo = params.get('error_code') ?? ''
    if (POR_CODIGO[codigo]) return POR_CODIGO[codigo]
    const descricao = params.get('error_description')?.replace(/\+/g, ' ').trim() ?? ''
    if (DESCRICOES[descricao]) return DESCRICOES[descricao]
    return params.get('error') === 'access_denied'
      ? 'O link não é válido ou já foi usado.'
      : 'O link não é válido.'
  }
  return null
}
