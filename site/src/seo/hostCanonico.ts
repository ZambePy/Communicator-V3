/* ============================================================
   Endereço do Cloudflare Pages → domínio oficial.

   O site também responde em irisflow-communicator.pages.dev, o endereço
   que o Cloudflare dá ao projeto. Quem chega por lá (link de um instalador
   antigo, favorito, resultado de busca, e-mail antigo) é levado ao MESMO
   caminho no domínio oficial (SITE_URL). Dois endereços para o mesmo site
   confundem: o login fica guardado por domínio, então quem entrou num não
   está logado no outro, e um endereço "pages.dev" parece suspeito para quem
   não é da área.

   Ficam onde estão: o próprio domínio, as prévias de cada deploy
   (<hash>.irisflow-communicator.pages.dev, <ramo>.irisflow-communicator.pages.dev)
   e qualquer build sem domínio próprio configurado (SITE_URL ainda em
   *.pages.dev), para não criar um laço.

   O caminho, a busca (?...) e o fragmento (#...) vão juntos: um link de
   e-mail de conta chega inteiro ao domínio.
   ============================================================ */

/** Endereços do Cloudflare Pages que levam ao domínio oficial (só o host exato). */
export const HOSTS_DO_PAGES = ['irisflow-communicator.pages.dev', 'irisflow.pages.dev']

/** Para onde mandar quem abriu `href`, ou `null` quando já está no lugar certo. */
export function destinoCanonico(href: string, siteUrl: string): string | null {
  let atual: URL
  let oficial: URL
  try {
    atual = new URL(href)
    oficial = new URL(siteUrl)
  } catch {
    return null
  }
  const host = atual.hostname.toLowerCase()
  if (!HOSTS_DO_PAGES.includes(host)) return null
  const hostOficial = oficial.hostname.toLowerCase()
  if (hostOficial === host || hostOficial.endsWith('.pages.dev')) return null
  return `${oficial.origin}${atual.pathname}${atual.search}${atual.hash}`
}

/**
 * Troca o endereço (sem deixar o pages.dev no histórico) quando a página foi
 * aberta num endereço do Pages. Devolve `true` se mandou embora — aí quem
 * chamou não deve montar o app.
 */
export function irParaODominioOficial(siteUrl: string, loc: Location | undefined = globalThis.location): boolean {
  if (!loc) return false
  const destino = destinoCanonico(loc.href, siteUrl)
  if (!destino) return false
  loc.replace(destino)
  return true
}
