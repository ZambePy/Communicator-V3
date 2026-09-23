/* ============================================================
   Último release do desktop, pela API pública do GitHub.

   GET https://api.github.com/repos/{VITE_RELEASES_REPO}/releases/latest,
   sem token — o limite é de 60 pedidos por hora por IP, então:
   - a resposta fica 10 minutos no sessionStorage (por aba, some ao fechar);
   - uma falha (rede, limite estourado, 5xx, formato estranho) fica marcada
     por 2 minutos, para a navegação entre páginas não gastar o limite à toa;
   - pedidos simultâneos (dois painéis na mesma página) viram um só.

   Resultado: o retrato do release, NO_RELEASE (404 = nada publicado) ou
   null = "não deu para saber" — aí quem chamou usa a configuração do build
   (VITE_RELEASES_AVAILABLE). Nunca rejeita. Todo acesso ao sessionStorage
   fica em try/catch: modo privado ou armazenamento bloqueado só desligam o
   cache. O pedido vai sem cookies e sem Referer.
   ============================================================ */

import {
  NO_RELEASE,
  isReleaseSnapshot,
  latestReleaseApiUrl,
  normalizeRepo,
  parseLatestRelease,
  type ReleaseSnapshot,
} from './releases'

/** Validade de uma resposta boa (inclusive "nenhum release"). */
export const RELEASE_CACHE_MS = 10 * 60 * 1000
/** Por quanto tempo uma falha evita novas tentativas. */
export const RELEASE_FAILURE_MS = 2 * 60 * 1000
/** Mais que isso sem resposta conta como falha. */
const TIMEOUT_MS = 8000

const cacheKey = (repo: string) => `irisflow:release:${normalizeRepo(repo)}`

type Guardado = { v: 1; at: number; snapshot: ReleaseSnapshot | null }

/**
 * O que está no cache e ainda vale: `{ snapshot }` com o retrato (ou null,
 * se o que ficou guardado foi uma falha recente), ou undefined quando não há
 * nada válido e é preciso perguntar à API.
 */
export function readCachedRelease(
  repo: string,
  now: number = Date.now(),
): { snapshot: ReleaseSnapshot | null } | undefined {
  let bruto: string | null = null
  try {
    bruto = window.sessionStorage.getItem(cacheKey(repo))
  } catch {
    return undefined
  }
  if (!bruto) return undefined

  try {
    const g = JSON.parse(bruto) as Partial<Guardado>
    if (g?.v !== 1 || typeof g.at !== 'number' || g.at > now) return undefined
    if (g.snapshot === null) {
      return now - g.at < RELEASE_FAILURE_MS ? { snapshot: null } : undefined
    }
    if (!isReleaseSnapshot(g.snapshot) || now - g.at >= RELEASE_CACHE_MS) return undefined
    return { snapshot: g.snapshot }
  } catch {
    return undefined
  }
}

function guardar(repo: string, snapshot: ReleaseSnapshot | null, now: number): void {
  try {
    const g: Guardado = { v: 1, at: now, snapshot }
    window.sessionStorage.setItem(cacheKey(repo), JSON.stringify(g))
  } catch {
    /* sem armazenamento: a próxima página pergunta de novo */
  }
}

const emAndamento = new Map<string, Promise<ReleaseSnapshot | null>>()

type Opcoes = {
  /** Troca o fetch (testes). */
  fetchImpl?: typeof fetch
  /** Relógio (testes). */
  now?: () => number
}

async function perguntarAoGitHub(
  chave: string,
  fetchImpl: typeof fetch | undefined,
  now: () => number,
): Promise<ReleaseSnapshot | null> {
  const controle = typeof AbortController === 'function' ? new AbortController() : null
  const relogio = setTimeout(() => controle?.abort(), TIMEOUT_MS)
  try {
    const buscar: typeof fetch = fetchImpl ?? ((url, init) => fetch(url, init))
    const resposta = await buscar(latestReleaseApiUrl(chave), {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controle?.signal,
    })

    // 404: o repositório não tem release publicado (ou não é público).
    // É uma resposta, não uma falha: todos os sistemas ficam "Em breve".
    if (resposta.status === 404) {
      guardar(chave, NO_RELEASE, now())
      return NO_RELEASE
    }
    if (!resposta.ok) {
      // 403/429 = limite de 60/h estourado; 5xx = GitHub fora
      guardar(chave, null, now())
      return null
    }

    const retrato = parseLatestRelease(await resposta.json(), chave)
    guardar(chave, retrato, now())
    return retrato
  } catch {
    // sem rede, sem fetch, tempo esgotado ou JSON inválido
    guardar(chave, null, now())
    return null
  } finally {
    clearTimeout(relogio)
  }
}

export function fetchLatestRelease(
  repo: string,
  { fetchImpl, now = Date.now }: Opcoes = {},
): Promise<ReleaseSnapshot | null> {
  const chave = normalizeRepo(repo)
  const noCache = readCachedRelease(chave, now())
  if (noCache) return Promise.resolve(noCache.snapshot)

  const pendente = emAndamento.get(chave)
  if (pendente) return pendente

  // `.finally` roda sempre depois do `set` abaixo, mesmo que o pedido
  // termine na hora; perguntarAoGitHub nunca rejeita.
  const pedido = perguntarAoGitHub(chave, fetchImpl, now).finally(() => emAndamento.delete(chave))
  emAndamento.set(chave, pedido)
  return pedido
}

/** Só para os testes: esquece os pedidos em andamento. */
export function __resetLatestReleaseForTests(): void {
  emAndamento.clear()
}
