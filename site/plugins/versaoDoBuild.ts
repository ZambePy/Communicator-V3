import { execFileSync } from 'node:child_process'
import type { Plugin } from 'vite'

/**
 * /versao.json — qual commit está no ar.
 *
 * O `npm run publicar` (scripts/publicar.mjs, na raiz do repositório) olha
 * esse arquivo depois do envio ao GitHub: quando o `commit` dele é o que
 * acabou de ser enviado, o Cloudflare Pages terminou de publicar. O arquivo
 * sai no build (`dist/versao.json`) e o `public/_headers` o deixa fora do cache.
 *
 * Este arquivo é importado pelo vite.config.ts (tsconfig.node.json) e pelo teste
 * em src/ (tsconfig.app.json, ES2020): só recursos de ES2020.
 */

export interface VersaoDoBuild {
  /** O commit (SHA completo) de que este build saiu, ou "desconhecido". */
  commit: string
  /** Quando o build foi feito (ISO 8601, UTC). */
  construidoEm: string
}

/**
 * O que vai no versao.json. O commit é o que o Cloudflare Pages informa no
 * build (`CF_PAGES_COMMIT_SHA`); sem ele, o do git; sem nenhum dos dois,
 * "desconhecido" — o build nunca quebra por causa disto.
 */
export function conteudoDaVersao(
  env: Record<string, string | undefined>,
  shaDoGit: string | null,
  agora: Date,
): VersaoDoBuild {
  const doCloudflare = env.CF_PAGES_COMMIT_SHA?.trim()
  const doGit = shaDoGit?.trim()
  return {
    commit: doCloudflare || doGit || 'desconhecido',
    construidoEm: agora.toISOString(),
  }
}

export interface OpcoesDaVersao {
  /** As variáveis de ambiente do build. Padrão: process.env. */
  env?: Record<string, string | undefined>
  /** O SHA do commit atual no git, ou null se não der para ler. Padrão: `git rev-parse HEAD` na pasta do projeto. */
  lerShaDoGit?: (pasta: string) => string | null
  /** O relógio. Padrão: a hora de agora. */
  agora?: () => Date
}

/** `git rev-parse HEAD`; null se o git faltar ou a pasta não for um repositório. */
function shaDoGitEm(pasta: string): string | null {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: pasta,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return /^[0-9a-f]{7,64}$/i.test(sha) ? sha : null
  } catch {
    return null
  }
}

/** Grava `versao.json` na raiz do dist. Só age em `vite build`. */
export function versaoDoBuild(opcoes: OpcoesDaVersao = {}): Plugin {
  let pasta = process.cwd()
  return {
    name: 'irisflow-versao-do-build',
    apply: 'build',
    configResolved(config) {
      pasta = config.root
    },
    generateBundle() {
      const { env = process.env, lerShaDoGit = shaDoGitEm, agora = () => new Date() } = opcoes
      let shaDoGit: string | null = null
      try {
        shaDoGit = lerShaDoGit(pasta)
      } catch {
        shaDoGit = null
      }
      this.emitFile({
        type: 'asset',
        fileName: 'versao.json',
        source: `${JSON.stringify(conteudoDaVersao(env, shaDoGit, agora()), null, 2)}\n`,
      })
    },
  }
}
