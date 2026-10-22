import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* Auditoria P2-17 (21/10/2026): o relógio do rodapé media 96 px a 1440 e ocupava
   cerca de 180 px de altura em toda página, sem relação com o produto. A decisão
   do coordenador: o relógio de Brasília fica, mas como uma linha pequena. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(AQUI, '../v3/relogio.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function tamanhoDaHora(): string {
  const bloco = css.match(/\.v3-relogio__hora\s*\{([^}]*)\}/)
  expect(bloco, 'regra .v3-relogio__hora').not.toBeNull()
  const tamanho = bloco![1].match(/font-size\s*:\s*([^;]+);/)
  expect(tamanho, 'font-size da hora').not.toBeNull()
  return tamanho![1].trim()
}

describe('relógio do rodapé — uma linha discreta', () => {
  it('a hora não usa tamanho fluido nem passa de 1,25rem (20 px)', () => {
    const t = tamanhoDaHora()
    expect(t).not.toMatch(/clamp|vw|vh/)
    expect(t).toMatch(/rem$/)
    expect(parseFloat(t)).toBeLessThanOrEqual(1.25)
  })

  it('a hora e o rótulo ficam lado a lado, numa linha só', () => {
    const raiz = css.match(/\.v3-relogio\s*\{([^}]*)\}/)
    expect(raiz).not.toBeNull()
    expect(raiz![1]).toMatch(/display\s*:\s*(inline-)?flex/)
    expect(raiz![1]).not.toMatch(/grid/)
  })
})
