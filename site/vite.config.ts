import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { PAGES } from './src/seo/pages'
import { buildRobots, buildSitemap } from './src/seo/sitemap'
import { resolveSiteUrl } from './src/seo/site'

/**
 * SEO no build, sem dependência nova:
 * - troca `__SITE_URL__` no index.html pela origem de VITE_SITE_URL
 *   (og:url, og:image e canonical padrão precisam ser absolutos);
 * - gera sitemap.xml e robots.txt a partir de src/seo/pages.ts, então a
 *   lista de URLs nunca descola das rotas;
 * - no `npm run dev`, serve os dois arquivos do mesmo jeito.
 */
function seoFiles(siteUrl: string): Plugin {
  const today = new Date().toISOString().slice(0, 10)
  const files: Record<string, { type: string; body: () => string }> = {
    '/sitemap.xml': {
      type: 'application/xml; charset=utf-8',
      body: () => buildSitemap(siteUrl, PAGES, today),
    },
    '/robots.txt': {
      type: 'text/plain; charset=utf-8',
      body: () => buildRobots(siteUrl, PAGES),
    },
  }

  return {
    name: 'irisflow-seo-files',
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', siteUrl)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = req.url ? files[req.url.split('?')[0]] : undefined
        if (!file) return next()
        res.setHeader('Content-Type', file.type)
        res.end(file.body())
      })
    },
    generateBundle() {
      for (const [name, file] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: name.slice(1), source: file.body() })
      }
    },
  }
}

/**
 * O site publicado entrega a solução, não o código-fonte. Além do que
 * `build` e `esbuild` fazem logo abaixo (sem source map, JavaScript
 * minificado, sem console de depuração), este plugin tira do que vai para
 * o ar as anotações que sobrariam:
 * - os comentários do index.html (falam de arquivos e decisões internas);
 * - o marcador `/* empty css *\/` que o Vite deixa no lugar de imports de CSS.
 * Os avisos de licença de terceiros (`/** @license … *\/` do React e do React
 * Router) ficam de propósito: a licença MIT exige o aviso em toda cópia, e
 * eles não dizem nada sobre o código da IrisFlow.
 * `enforce: 'post'` põe o generateBundle depois do plugin de CSS do Vite, que
 * é quem escreve o marcador.
 */
function somenteASolucao(): Plugin {
  return {
    name: 'irisflow-somente-a-solucao',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/\n[ \t]*(?=\n)/g, ''),
    },
    generateBundle(_opcoes, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') item.code = item.code.replace(/\/\* empty css\s*\*\//g, '')
      }
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const siteUrl = resolveSiteUrl(env.VITE_SITE_URL)

  return {
    plugins: [react(), seoFiles(siteUrl), somenteASolucao()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // Explícitos, para ninguém ligar sem querer: sem source map o navegador
      // não reconstrói os arquivos .ts/.tsx, e o bundle sai minificado.
      sourcemap: false,
      minify: 'esbuild',
      cssMinify: true,
    },
    // Só no build: `debugger` sai, e chamadas de console.log/info/debug/trace
    // viram código morto e somem (inclusive as de bibliotecas). console.error
    // e console.warn ficam — são os erros e avisos reais. No `npm run dev` e
    // nos testes nada disso se aplica.
    esbuild:
      command === 'build'
        ? {
            drop: ['debugger'],
            pure: ['console.log', 'console.info', 'console.debug', 'console.trace'],
          }
        : undefined,
    server: {
      port: 5173,
      open: true,
      // Escuta em todas as interfaces, e não só em localhost, para que o
      // site possa ser aberto de outro aparelho na mesma rede — o celular,
      // ou a máquina de quem está assistindo à demonstração.
      host: true,
    },
  }
})
