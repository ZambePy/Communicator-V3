import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* Auditoria P3-3 (21/10/2026): no celular, os botões dos passos do vídeo (24 px
   de altura) e os links dos cartões (25 px) ficavam abaixo dos 44 px que o
   público (tremor, cansaço) precisa. O respiro é padding, que conta como alvo, e
   a margem o devolve ao fluxo: o desenho não muda. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(AQUI, '../..')
const sem = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const ler = (rel: string) => sem(readFileSync(resolve(SRC, rel), 'utf8'))

function corpo(css: string, seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escapado}\\s*\\{([^}]*)\\}`))
  expect(m, `regra ${seletor}`).not.toBeNull()
  return m![1]
}

describe('alvos de toque de 44 px', () => {
  it('o botão do passo do vídeo tem min-height de 44 px', () => {
    const css = corpo(ler('components/home/capitulos.css'), '.capitulos__botao')
    expect(css).toMatch(/min-height\s*:\s*44px/)
  })

  it('o link do título do cartão ganha 11 px de respiro em cima e embaixo, devolvidos na margem', () => {
    const css = corpo(ler('components/v3/cartoes.css'), '.v3-cartao__titulo a')
    expect(css).toMatch(/padding-block\s*:\s*11px/)
    expect(css).toMatch(/margin-block\s*:\s*-11px/)
    expect(css).toMatch(/display\s*:\s*inline-block/)
  })

  it('existe o utilitário .link-alvo (44 px) para links sozinhos numa linha', () => {
    const css = corpo(ler('styles/global.css'), '.link-alvo')
    expect(css).toMatch(/min-height\s*:\s*44px/)
    expect(css).toMatch(/display\s*:\s*inline-flex/)
  })
})
