import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RELEASE_CACHE_MS,
  RELEASE_FAILURE_MS,
  __resetLatestReleaseForTests,
  fetchLatestRelease,
  readCachedRelease,
} from './latestRelease'
import { NO_RELEASE } from './releases'

/* Consulta ao último release (GitHub, sem token: 60 pedidos/h por IP).
   O que importa aqui: um pedido só por vez, cache de 10 min na aba,
   falha marcada por 2 min, e nunca rejeitar — quem chama cai no
   comportamento estático quando o resultado é null. */

const REPO = 'dono/repo'
const T0 = Date.UTC(2026, 8, 23, 12, 0, 0)

const RELEASE = {
  tag_name: 'v1.0.0-beta.3',
  assets: [
    {
      name: 'IrisFlow-Setup.exe',
      state: 'uploaded',
      browser_download_url: 'https://github.com/dono/repo/releases/download/v1.0.0-beta.3/IrisFlow-Setup.exe',
    },
  ],
}

/** Resposta mínima do fetch, sem depender do Response do ambiente. */
function resposta(status: number, corpo: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (corpo instanceof Error) throw corpo
      return corpo
    },
  } as unknown as Response
}

beforeEach(() => {
  window.sessionStorage.clear()
  __resetLatestReleaseForTests()
  vi.restoreAllMocks()
})

describe('fetchLatestRelease', () => {
  it('pergunta à API pública sem cookies e sem Referer, e devolve o retrato do release', async () => {
    const fetchImpl = vi.fn(async () => resposta(200, RELEASE))

    const snap = await fetchLatestRelease(REPO, { fetchImpl, now: () => T0 })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/dono/repo/releases/latest')
    expect(init).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/vnd.github+json' },
    })
    expect(snap?.tag).toBe('v1.0.0-beta.3')
    expect(snap?.files.map((f) => f.name)).toEqual(['IrisFlow-Setup.exe'])
  })

  it('guarda a resposta por 10 minutos: a página seguinte não gasta o limite', async () => {
    const fetchImpl = vi.fn(async () => resposta(200, RELEASE))

    await fetchLatestRelease(REPO, { fetchImpl, now: () => T0 })
    await fetchLatestRelease(REPO, { fetchImpl, now: () => T0 + RELEASE_CACHE_MS - 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(readCachedRelease(REPO, T0 + 1000)?.snapshot?.tag).toBe('v1.0.0-beta.3')

    await fetchLatestRelease(REPO, { fetchImpl, now: () => T0 + RELEASE_CACHE_MS })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('dois painéis na mesma página dividem um único pedido', async () => {
    let soltar: (r: Response) => void = () => {}
    const fetchImpl = vi.fn(() => new Promise<Response>((ok) => (soltar = ok)))

    const a = fetchLatestRelease(REPO, { fetchImpl, now: () => T0 })
    const b = fetchLatestRelease(REPO, { fetchImpl, now: () => T0 })
    soltar(resposta(200, RELEASE))

    const [ra, rb] = await Promise.all([a, b])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(ra).toEqual(rb)
  })

  it('404 = nenhum release publicado: todos "Em breve", e isso também fica em cache', async () => {
    const fetchImpl = vi.fn(async () => resposta(404, { message: 'Not Found' }))

    await expect(fetchLatestRelease(REPO, { fetchImpl, now: () => T0 })).resolves.toEqual(NO_RELEASE)
    await fetchLatestRelease(REPO, { fetchImpl, now: () => T0 + 60_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('limite estourado (403/429) ou GitHub fora devolve null, e a falha segura novas tentativas por 2 min', async () => {
    const fetchImpl = vi.fn(async () => resposta(403, { message: 'API rate limit exceeded' }))

    await expect(fetchLatestRelease(REPO, { fetchImpl, now: () => T0 })).resolves.toBeNull()
    await expect(fetchLatestRelease(REPO, { fetchImpl, now: () => T0 + 30_000 })).resolves.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    fetchImpl.mockImplementationOnce(async () => resposta(200, RELEASE))
    const depois = await fetchLatestRelease(REPO, { fetchImpl, now: () => T0 + RELEASE_FAILURE_MS })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(depois?.tag).toBe('v1.0.0-beta.3')
  })

  it('sem rede, JSON inválido ou formato inesperado: null, sem rejeitar', async () => {
    const semRede = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(fetchLatestRelease('a/rede', { fetchImpl: semRede, now: () => T0 })).resolves.toBeNull()

    const jsonRuim = vi.fn(async () => resposta(200, new SyntaxError('Unexpected token')))
    await expect(fetchLatestRelease('b/json', { fetchImpl: jsonRuim, now: () => T0 })).resolves.toBeNull()

    const formato = vi.fn(async () => resposta(200, { message: 'oi' }))
    await expect(fetchLatestRelease('c/formato', { fetchImpl: formato, now: () => T0 })).resolves.toBeNull()
  })

  it('sessionStorage bloqueado (modo privado) só desliga o cache', async () => {
    const bloqueado = () => {
      throw new DOMException('bloqueado', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(bloqueado)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(bloqueado)
    const fetchImpl = vi.fn(async () => resposta(200, RELEASE))

    const snap = await fetchLatestRelease(REPO, { fetchImpl, now: () => T0 })
    expect(snap?.tag).toBe('v1.0.0-beta.3')
    expect(readCachedRelease(REPO, T0)).toBeUndefined()
  })

  it('cache adulterado (link fora do GitHub) é ignorado e a API é consultada de novo', async () => {
    window.sessionStorage.setItem(
      'irisflow:release:dono/repo',
      JSON.stringify({
        v: 1,
        at: T0,
        snapshot: { tag: 'v9', files: [{ name: 'IrisFlow-Setup.exe', url: 'https://evil.example/x.exe' }] },
      }),
    )
    expect(readCachedRelease(REPO, T0 + 1)).toBeUndefined()

    const fetchImpl = vi.fn(async () => resposta(200, RELEASE))
    await fetchLatestRelease(REPO, { fetchImpl, now: () => T0 + 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
