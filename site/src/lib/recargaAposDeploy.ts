/* ============================================================
   Recarga depois de um deploy.

   Cada página chega por import() dinâmico, com o nome do arquivo trocado a
   cada build. Quem está com o site aberto durante um push na main pede um
   pedaço que não existe mais; o Cloudflare Pages responde com o index.html
   (modo SPA) e o import falha ("Failed to fetch dynamically imported
   module"). Sem tratamento, o React desmontava a árvore inteira e a página
   ficava vazia.

   A saída é recarregar o endereço pedido UMA vez: o index.html novo aponta
   para os pedaços novos. Uma marca em sessionStorage (destino + hora) impede
   o laço se o pedaço faltar também no build novo, e sem rede não se recarrega
   (o navegador mostraria a própria página de erro).
   ============================================================ */

const CHAVE = 'irisflow:recarga-apos-deploy'
/** Uma segunda falha no mesmo destino dentro deste intervalo não recarrega de novo. */
export const JANELA_CONTRA_LACO_MS = 30_000

/** O erro é de um pedaço de rota que não carregou (deploy novo)? */
export function ehErroDePedaco(erro: unknown): boolean {
  const texto =
    erro instanceof Error ? `${erro.name}: ${erro.message}` : typeof erro === 'string' ? erro : ''
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading (?:CSS )?chunk \S+ failed/i.test(
    texto,
  )
}

function destinoAtual(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

let recarregouNestaCarga = false

/**
 * Recarrega o endereço atual, no máximo uma vez por destino dentro da janela
 * contra laço. Devolve `true` se pediu a recarga.
 */
export function recarregarUmaVez(agora = Date.now()): boolean {
  if (typeof window === 'undefined') return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  const destino = destinoAtual()
  try {
    const anterior = JSON.parse(window.sessionStorage.getItem(CHAVE) ?? 'null') as {
      destino?: string
      em?: number
    } | null
    if (anterior?.destino === destino && typeof anterior.em === 'number' && agora - anterior.em < JANELA_CONTRA_LACO_MS) {
      return false
    }
    window.sessionStorage.setItem(CHAVE, JSON.stringify({ destino, em: agora }))
  } catch {
    // Sem sessionStorage (modo privado antigo, bloqueio): uma vez por carga.
    if (recarregouNestaCarga) return false
  }
  recarregouNestaCarga = true
  window.location.reload()
  return true
}

/**
 * Liga a recarga ao evento que o Vite dispara quando o pré-carregamento de um
 * pedaço falha. Se a recarga não for feita (laço, sem rede), o erro segue e
 * a fronteira de erro da página mostra o aviso.
 */
export function ouvirFalhaDePreCarregamento(): () => void {
  const aoFalhar = (evento: Event) => {
    if (recarregarUmaVez()) evento.preventDefault()
  }
  window.addEventListener('vite:preloadError', aoFalhar)
  return () => window.removeEventListener('vite:preloadError', aoFalhar)
}
