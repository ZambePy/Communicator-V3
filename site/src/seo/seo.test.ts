import { describe, expect, it } from 'vitest'
import { DEFAULT_TITLE, NOT_FOUND_META, PAGES, fullTitle, metaForPath, normalizePath } from './pages'
import { buildRobots, buildSitemap } from './sitemap'
import { DEFAULT_SITE_URL, absoluteUrl, resolveSiteUrl } from './site'
import { ROUTE_LOADERS } from '@/routes'

describe('origem do site (VITE_SITE_URL)', () => {
  it('usa o padrão quando vazia ou inválida', () => {
    expect(resolveSiteUrl('')).toBe(DEFAULT_SITE_URL)
    expect(resolveSiteUrl(undefined)).toBe(DEFAULT_SITE_URL)
    expect(resolveSiteUrl('http://')).toBe(DEFAULT_SITE_URL)
  })

  it('normaliza esquema e barra final', () => {
    expect(resolveSiteUrl('irisflow.tech')).toBe('https://irisflow.tech')
    expect(resolveSiteUrl(' https://irisflow.tech/ ')).toBe('https://irisflow.tech')
    expect(absoluteUrl('https://irisflow.tech/', '/planos')).toBe('https://irisflow.tech/planos')
  })
})

describe('tabela de metadados por rota', () => {
  it('toda rota do App tem título e descrição próprios', () => {
    for (const path of Object.keys(ROUTE_LOADERS)) {
      const meta = metaForPath(path)
      expect(meta.path, path).toBe(path)
      expect(meta.title.length, path).toBeGreaterThan(5)
      expect(meta.description.length, path).toBeGreaterThan(40)
      expect(meta.description.length, path).toBeLessThanOrEqual(170)
    }
  })

  it('títulos e caminhos não se repetem', () => {
    const titles = PAGES.map((p) => p.title)
    const paths = PAGES.map((p) => p.path)
    expect(new Set(titles).size).toBe(titles.length)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('rota desconhecida cai na 404, que não é indexada', () => {
    expect(metaForPath('/nao-existe')).toBe(NOT_FOUND_META)
    expect(NOT_FOUND_META.index).toBe(false)
  })

  it('normaliza barra final, query e âncora', () => {
    expect(normalizePath('/planos/?x=1#y')).toBe('/planos')
    expect(metaForPath('/planos/').path).toBe('/planos')
    expect(normalizePath('/')).toBe('/')
  })

  it('o sufixo da marca entra uma vez só', () => {
    expect(fullTitle(DEFAULT_TITLE)).toBe(`${DEFAULT_TITLE} | IrisFlow`)
    expect(fullTitle(`${DEFAULT_TITLE} | IrisFlow`)).toBe(`${DEFAULT_TITLE} | IrisFlow`)
  })
})

describe('sitemap.xml e robots.txt', () => {
  const origin = 'https://irisflow.tech'

  it('lista só as páginas indexáveis, com URL absoluta', () => {
    const xml = buildSitemap(origin, PAGES, '2026-09-22')
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    const indexaveis = PAGES.filter((p) => p.index).map((p) => origin + p.path)
    expect(locs).toEqual(indexaveis)
    expect(xml).toContain('<lastmod>2026-09-22</lastmod>')
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    expect(locs).not.toContain(`${origin}/conta`)
    expect(locs).toContain(`${origin}/privacidade`)
  })

  it('escapa caracteres especiais do XML', () => {
    const xml = buildSitemap('https://a.b', [
      { path: '/x?a=1&b=2', title: 't', description: 'd', index: true },
    ])
    expect(xml).toContain('<loc>https://a.b/x?a=1&amp;b=2</loc>')
  })

  it('robots aponta o sitemap absoluto e fecha as telas de conta', () => {
    const txt = buildRobots(origin, PAGES)
    expect(txt).toContain('User-agent: *')
    expect(txt).toContain(`Sitemap: ${origin}/sitemap.xml`)
    expect(txt).toContain('Disallow: /conta')
    expect(txt).not.toContain('Disallow: /planos')
  })
})
