import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* Listas que deslizam de lado no celular "sangram" até a borda da tela com uma
   margem negativa igual ao recuo do .container. Relato de 19/10/2026: o
   recuo do contêiner passou a ser o --gutter (16 px num celular de 360 px), e
   quatro listas ainda usavam 24 px fixos — passavam 8 px da tela, e a página
   inteira rolava de lado em /solucao, /como-funciona e /cuidador. Este teste
   segura isso: toda margem lateral negativa feita de variável é o --gutter. */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function arquivosCss(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return arquivosCss(caminho)
    return nome.endsWith('.css') ? [caminho] : []
  })
}

/** Separa os valores de `margin` no nível de cima (o calc() tem espaços dentro). */
function valores(declaracao: string): string[] {
  const partes: string[] = []
  let atual = ''
  let fundo = 0
  for (const c of declaracao.trim()) {
    if (c === '(') fundo++
    if (c === ')') fundo--
    if (c === ' ' && fundo === 0) {
      if (atual) partes.push(atual)
      atual = ''
    } else atual += c
  }
  if (atual) partes.push(atual)
  return partes
}

/** As margens laterais de uma declaração (margin, margin-inline, -left, -right). */
function lateraisDe(propriedade: string, valor: string): string[] {
  const v = valores(valor.replace(/!important/, ''))
  if (propriedade === 'margin-inline') return v
  if (propriedade === 'margin-left' || propriedade === 'margin-right') return v
  if (propriedade === 'margin') {
    if (v.length === 1) return v
    if (v.length <= 3) return [v[1]]
    return [v[1], v[3]]
  }
  return []
}

const NEGATIVA_DE_VARIAVEL = /^calc\(\s*-1\s*\*\s*var\((--[\w-]+)\)\s*\)$|^calc\(\s*var\((--[\w-]+)\)\s*\*\s*-1\s*\)$/

describe('sangria das listas que deslizam de lado', () => {
  it('toda margem lateral negativa feita de variável usa o --gutter do contêiner', () => {
    const erradas: string[] = []
    let achadas = 0
    for (const arquivo of arquivosCss(SRC)) {
      const css = readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of css.matchAll(/(?:^|[;{\s])(margin(?:-inline|-left|-right)?)\s*:\s*([^;{}]+);/g)) {
        for (const lateral of lateraisDe(m[1], m[2])) {
          const variavel = NEGATIVA_DE_VARIAVEL.exec(lateral)
          if (!variavel) continue
          achadas++
          const nome = variavel[1] ?? variavel[2]
          if (nome !== '--gutter') erradas.push(`${relative(SRC, arquivo)}: ${m[1]}: ${m[2].trim()}`)
        }
      }
    }
    // As quatro listas de hoje (passos, abas do explorador, recursos do
    // cuidador e condições): se o número cair a zero, o teste deixou de ler.
    expect(achadas).toBeGreaterThanOrEqual(4)
    expect(erradas).toEqual([])
  })
})
