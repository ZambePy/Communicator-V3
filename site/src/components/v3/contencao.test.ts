import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* Auditoria P3-5 (21/10/2026): `overflow-x: hidden` no `body` escondia 4 px de
   estouro do campo de calibração (o ponto da direita passava de 390 px) e, de
   quebra, escondia qualquer estouro futuro (e pode desligar `position: sticky`
   em alguns navegadores). A contenção passou para o dono do estouro. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(AQUI, '../..')
const sem = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const global = sem(readFileSync(resolve(SRC, 'styles/global.css'), 'utf8'))
const campo = sem(readFileSync(resolve(AQUI, 'campo-de-calibracao.css'), 'utf8'))

function regra(css: string, seletor: string): string {
  const m = css.match(new RegExp(`(?:^|\\})\\s*${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  expect(m, `regra ${seletor}`).not.toBeNull()
  return m![1]
}

describe('contenção do estouro horizontal', () => {
  it('o body não trava mais a rolagem horizontal (nem overflow-x hidden, nem overflow hidden)', () => {
    expect(regra(global, 'body')).not.toMatch(/overflow(-x)?\s*:\s*hidden/)
  })

  it('o campo de pontos da abertura recorta o que passa da própria caixa', () => {
    expect(regra(campo, '.v3-campo')).toMatch(/overflow\s*:\s*clip/)
  })
})
