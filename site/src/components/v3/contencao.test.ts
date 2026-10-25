import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* `overflow-x: hidden` no `body` esconderia qualquer estouro futuro (e pode
   desligar `position: sticky` em alguns navegadores). Quem pode estourar
   recorta a si mesmo: o fundo vivo (manchas maiores que a caixa). */

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(AQUI, '../..')
const sem = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const global = sem(readFileSync(resolve(SRC, 'styles/global.css'), 'utf8'))
const atmosfera = sem(readFileSync(resolve(SRC, 'components/fundo/atmosfera.css'), 'utf8'))

function regra(css: string, seletor: string): string {
  const m = css.match(new RegExp(`(?:^|\\})\\s*${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  expect(m, `regra ${seletor}`).not.toBeNull()
  return m![1]
}

describe('contenção do estouro horizontal', () => {
  it('o body não trava mais a rolagem horizontal (nem overflow-x hidden, nem overflow hidden)', () => {
    expect(regra(global, 'body')).not.toMatch(/overflow(-x)?\s*:\s*hidden/)
  })

  it('o fundo vivo recorta o que passa da própria caixa', () => {
    expect(regra(atmosfera, '.atmosfera')).toMatch(/overflow\s*:\s*hidden/)
  })
})
