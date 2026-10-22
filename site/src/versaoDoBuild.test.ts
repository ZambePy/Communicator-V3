// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { conteudoDaVersao, versaoDoBuild, type OpcoesDaVersao } from '../plugins/versaoDoBuild'

/* /versao.json: qual commit está no ar. Pedido de 21/10/2026: o `npm run
   publicar` (scripts/publicar.mjs, na raiz do repositório) olha esse arquivo
   depois do envio para saber se o Cloudflare Pages já publicou o commit novo.
   O plugin grava o arquivo no build; o `_headers` o deixa fora do cache. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const SHA_DO_CLOUDFLARE = '1111111111111111111111111111111111111111'
const SHA_DO_GIT = '2222222222222222222222222222222222222222'
const AGORA = new Date('2026-10-21T15:30:00.000Z')

describe('conteudoDaVersao', () => {
  it('usa o commit que o Cloudflare Pages informa (CF_PAGES_COMMIT_SHA), mesmo havendo git', () => {
    expect(conteudoDaVersao({ CF_PAGES_COMMIT_SHA: SHA_DO_CLOUDFLARE }, SHA_DO_GIT, AGORA)).toEqual({
      commit: SHA_DO_CLOUDFLARE,
      construidoEm: '2026-10-21T15:30:00.000Z',
    })
  })

  it('sem a variável do Cloudflare, usa o SHA do git', () => {
    expect(conteudoDaVersao({}, SHA_DO_GIT, AGORA)).toEqual({
      commit: SHA_DO_GIT,
      construidoEm: '2026-10-21T15:30:00.000Z',
    })
  })

  it('sem nenhum dos dois, o commit é "desconhecido" (e o build não quebra)', () => {
    expect(conteudoDaVersao({}, null, AGORA)).toEqual({
      commit: 'desconhecido',
      construidoEm: '2026-10-21T15:30:00.000Z',
    })
  })

  it('variável vazia ou só com espaços é o mesmo que ausente', () => {
    expect(conteudoDaVersao({ CF_PAGES_COMMIT_SHA: '' }, SHA_DO_GIT, AGORA).commit).toBe(SHA_DO_GIT)
    expect(conteudoDaVersao({ CF_PAGES_COMMIT_SHA: '  \n' }, SHA_DO_GIT, AGORA).commit).toBe(SHA_DO_GIT)
    expect(conteudoDaVersao({ CF_PAGES_COMMIT_SHA: undefined }, '', AGORA).commit).toBe('desconhecido')
    expect(conteudoDaVersao({ CF_PAGES_COMMIT_SHA: ' ' }, '   ', AGORA).commit).toBe('desconhecido')
  })

  it('tira espaços e quebra de linha em volta do SHA', () => {
    expect(conteudoDaVersao({ CF_PAGES_COMMIT_SHA: `${SHA_DO_CLOUDFLARE}\n` }, null, AGORA).commit).toBe(SHA_DO_CLOUDFLARE)
    expect(conteudoDaVersao({}, `${SHA_DO_GIT}\n`, AGORA).commit).toBe(SHA_DO_GIT)
  })

  it('construidoEm é a hora do build em ISO 8601 (UTC)', () => {
    const { construidoEm } = conteudoDaVersao({}, null, new Date(Date.UTC(2027, 0, 2, 3, 4, 5, 6)))
    expect(construidoEm).toBe('2027-01-02T03:04:05.006Z')
  })
})

describe('plugin versaoDoBuild (um build de verdade do Vite, sem escrever no disco)', () => {
  let pasta = ''

  beforeAll(() => {
    pasta = mkdtempSync(join(tmpdir(), 'irisflow-versao-'))
    // com efeito colateral: uma entrada que só exporta vira um chunk vazio e o Rollup avisa
    writeFileSync(join(pasta, 'entrada.js'), "console.log('entrada do teste')\n")
  })
  afterAll(() => {
    rmSync(pasta, { recursive: true, force: true })
  })

  /**
   * Roda o build com o plugin e devolve os arquivos gerados: nome → texto.
   * `raiz` é a pasta do projeto do Vite (onde o plugin procura o git).
   */
  async function construir(opcoes?: OpcoesDaVersao, raiz: string = pasta): Promise<Record<string, string>> {
    const resultado = await build({
      configFile: false,
      root: raiz,
      publicDir: false,
      logLevel: 'silent',
      plugins: [versaoDoBuild(opcoes)],
      build: { write: false, minify: false, rollupOptions: { input: join(pasta, 'entrada.js') } },
    })
    const saidas = Array.isArray(resultado) ? resultado : [resultado]
    const arquivos: Record<string, string> = {}
    for (const saida of saidas) {
      if (!('output' in saida)) throw new Error('o build devolveu um observador, não um resultado')
      for (const item of saida.output) {
        arquivos[item.fileName] = item.type === 'asset' ? String(item.source) : item.code
      }
    }
    return arquivos
  }

  it('grava versao.json no bundle, com o commit do Cloudflare e a hora do build', async () => {
    const arquivos = await construir({
      env: { CF_PAGES_COMMIT_SHA: SHA_DO_CLOUDFLARE },
      lerShaDoGit: () => SHA_DO_GIT,
      agora: () => AGORA,
    })
    expect(Object.keys(arquivos)).toContain('versao.json')
    expect(JSON.parse(arquivos['versao.json'])).toEqual({
      commit: SHA_DO_CLOUDFLARE,
      construidoEm: '2026-10-21T15:30:00.000Z',
    })
    // o arquivo é JSON puro e termina com quebra de linha
    expect(arquivos['versao.json'].endsWith('\n')).toBe(true)
  })

  it('sem Cloudflare, o commit é o do git', async () => {
    const arquivos = await construir({ env: {}, lerShaDoGit: () => SHA_DO_GIT, agora: () => AGORA })
    expect(JSON.parse(arquivos['versao.json']).commit).toBe(SHA_DO_GIT)
  })

  it('sem Cloudflare e sem git (git falhando ou fora de um repositório), o build segue e diz "desconhecido"', async () => {
    const semGit = await construir({ env: {}, lerShaDoGit: () => null, agora: () => AGORA })
    expect(JSON.parse(semGit['versao.json']).commit).toBe('desconhecido')
    const gitQueExplode = await construir({
      env: {},
      lerShaDoGit: () => {
        throw new Error('git não encontrado')
      },
      agora: () => AGORA,
    })
    expect(JSON.parse(gitQueExplode['versao.json']).commit).toBe('desconhecido')
  })

  it('por padrão lê o ambiente e o git de verdade deste repositório', async () => {
    let shaReal: string | null = null
    try {
      shaReal = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: AQUI, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      shaReal = null // fora de um repositório (código baixado sem .git): o plugin tem de dizer "desconhecido"
    }
    const antes = process.env.CF_PAGES_COMMIT_SHA
    delete process.env.CF_PAGES_COMMIT_SHA
    try {
      // a raiz do projeto é a pasta do site, dentro do repositório (como no `npm run build`)
      const arquivos = await construir(undefined, resolve(AQUI, '..'))
      const lido = JSON.parse(arquivos['versao.json'])
      expect(lido.commit).toBe(shaReal ?? 'desconhecido')
      expect(Number.isNaN(Date.parse(lido.construidoEm))).toBe(false)
    } finally {
      if (antes !== undefined) process.env.CF_PAGES_COMMIT_SHA = antes
    }
  })

  it('só age no build: no servidor de desenvolvimento e nos testes não faz nada', () => {
    expect(versaoDoBuild().apply).toBe('build')
  })
})

describe('onde o plugin está ligado e como o arquivo é servido', () => {
  const lerDoSite = (relativo: string) => readFileSync(resolve(AQUI, '..', relativo), 'utf8')

  it('o vite.config.ts põe o plugin na lista de plugins do build', () => {
    const config = lerDoSite('vite.config.ts')
    expect(config).toMatch(/import\s*\{\s*versaoDoBuild\s*\}\s*from\s*'\.\/plugins\/versaoDoBuild'/)
    expect(config).toMatch(/plugins:\s*\[[^\]]*\bversaoDoBuild\(\)[^\]]*\]/)
  })

  /** As regras do `_headers`: caminho → linhas de cabeçalho (sem comentários). */
  function regras(): Map<string, string[]> {
    const mapa = new Map<string, string[]>()
    let atual: string[] | null = null
    for (const linha of lerDoSite('public/_headers').split(/\r?\n/)) {
      if (linha.trim() === '' || linha.trim().startsWith('#')) {
        if (linha.trim() === '') atual = null
        continue
      }
      if (/^\S/.test(linha)) {
        atual = []
        mapa.set(linha.trim(), atual)
      } else if (atual) {
        atual.push(linha.trim())
      }
    }
    return mapa
  }

  it('/versao.json nunca fica em cache (Cache-Control: no-store)', () => {
    const regra = regras().get('/versao.json')
    expect(regra, 'o _headers tem uma regra para /versao.json').toBeDefined()
    expect(regra).toEqual(['Cache-Control: no-store'])
  })

  it('as outras regras de cache continuam como estavam', () => {
    const mapa = regras()
    expect(mapa.get('/assets/*')).toEqual(['Cache-Control: public, max-age=31536000, immutable'])
    expect(mapa.get('/fonts/*')).toEqual(['Cache-Control: public, max-age=31536000, immutable'])
    expect(mapa.get('/sitemap.xml')).toEqual(['Cache-Control: public, max-age=3600'])
    expect(mapa.get('/robots.txt')).toEqual(['Cache-Control: public, max-age=3600'])
    // a regra geral não ganhou Cache-Control: o Pages soma os valores das regras que casam juntas
    expect(mapa.get('/*')?.some((linha) => /^Cache-Control:/i.test(linha))).toBe(false)
  })
})
