/* ============================================================
   sitemap.xml e robots.txt, gerados a partir de PAGES.

   Funções puras: o plugin do vite.config.ts as chama no build (e no
   servidor de desenvolvimento), e os testes as chamam direto. Sem
   imports do app e sem `@/`.
   ============================================================ */

import type { PageMeta } from './pages'
import { absoluteUrl } from './site'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Só as páginas com `index: true`, na ordem da lista. `lastmod` (AAAA-MM-DD)
 * é opcional: o build passa a data do dia.
 */
export function buildSitemap(origin: string, pages: PageMeta[], lastmod?: string): string {
  const urls = pages
    .filter((p) => p.index)
    .map((p) => {
      const parts = [`    <loc>${escapeXml(absoluteUrl(origin, p.path))}</loc>`]
      if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`)
      if (p.changefreq) parts.push(`    <changefreq>${p.changefreq}</changefreq>`)
      if (p.priority != null) parts.push(`    <priority>${p.priority.toFixed(1)}</priority>`)
      return `  <url>\n${parts.join('\n')}\n  </url>`
    })
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  )
}

/** Libera tudo, fecha as telas de conta e aponta o sitemap absoluto. */
export function buildRobots(origin: string, pages: PageMeta[]): string {
  const blocked = pages.filter((p) => !p.index).map((p) => `Disallow: ${p.path}`)
  return [
    'User-agent: *',
    'Allow: /',
    ...blocked,
    '',
    `Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}`,
    '',
  ].join('\n')
}
