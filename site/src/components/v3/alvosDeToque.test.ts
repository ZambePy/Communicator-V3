import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* Auditoria P3-3 (21/10/2026): no celular, os botões dos passos do vídeo (24 px
   de altura) e os links dos cartões (25 px) ficavam abaixo dos 44 px que o
   público (tremor, cansaço) precisa. O respiro é padding, que conta como alvo, e
   a margem o devolve ao fluxo: o desenho não muda. Os cartões numerados
   saíram da home em 31/10/2026; as condições, que viraram uma lista de links,
   entram no lugar deles. */

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

  it('cada aba das condições da home é um alvo grande: 64 px de altura, 52 px no celular', () => {
    const css = ler('components/home/condicoes.css')
    // Desde 01/11/2026 (segunda volta) as condições são abas cheias.
    expect(corpo(css, '.para-quem__aba')).toMatch(/min-height\s*:\s*64px/)
    const celular = css.slice(css.indexOf('@media (max-width: 760px)'))
    expect(celular).toMatch(/\.para-quem__aba\s*\{[^}]*min-height\s*:\s*52px/)
  })

  it('existe o utilitário .link-alvo (44 px) para links sozinhos numa linha', () => {
    const css = corpo(ler('styles/global.css'), '.link-alvo')
    expect(css).toMatch(/min-height\s*:\s*44px/)
    expect(css).toMatch(/display\s*:\s*inline-flex/)
  })
})
