import { describe, expect, it } from 'vitest'
import { anguloNoArco } from './geometriaDoArco'
import {
  DURACAO_DO_TRACO_MS,
  FADE_DO_ITEM_MS,
  instanteDoItemNaLista,
  instanteDoItemNoArco,
} from './desenhoDoArco'

/* "Para quem": a linha do arco se desenha da esquerda para a direita quando a
   seção entra na tela, e cada condição aparece quando a linha passa por ela
   (rodada 3, 21/10/2026). Aqui, as contas: o instante em que o traço chega a
   cada item, que só depende do ângulo dele no arco. */

describe('quando o traço passa por cada condição', () => {
  const n = 6

  it('da esquerda para a direita: cada condição aparece depois da anterior', () => {
    const t = Array.from({ length: n }, (_, i) => instanteDoItemNoArco(i, n, 900))
    for (let i = 1; i < n; i++) expect(t[i]).toBeGreaterThan(t[i - 1])
  })

  it('o primeiro item só aparece quando o traço já começou, e o último ainda a tempo de o traço acabar', () => {
    expect(instanteDoItemNoArco(0, n, 900)).toBeGreaterThan(0)
    expect(instanteDoItemNoArco(n - 1, n, 900)).toBeLessThan(DURACAO_DO_TRACO_MS)
    // E ao fim da linha o último já terminou de aparecer, sem esperar muito.
    expect(instanteDoItemNoArco(n - 1, n, 900) + FADE_DO_ITEM_MS).toBeLessThan(DURACAO_DO_TRACO_MS + 600)
  })

  it('é simétrico: o traço passa pelo item de fora na mesma proporção, de um lado e de outro', () => {
    for (let i = 0; i < n; i++) {
      const soma = instanteDoItemNoArco(i, n, 900) + instanteDoItemNoArco(n - 1 - i, n, 900)
      expect(soma).toBeCloseTo(DURACAO_DO_TRACO_MS, 0)
    }
  })

  it('segue a posição horizontal real: o item do meio aparece lá pela metade do traço', () => {
    expect(anguloNoArco(0, 3)).toBeLessThan(0)
    const meio = instanteDoItemNoArco(1, 3, 900)
    expect(meio).toBeCloseTo(DURACAO_DO_TRACO_MS / 2, 0)
  })

  it('um arco mais fechado (raio menor) empurra os itens um pouco mais para as pontas', () => {
    const aberto = instanteDoItemNoArco(n - 1, n, 1100)
    const fechado = instanteDoItemNoArco(n - 1, n, 400)
    expect(fechado).toBeGreaterThan(aberto)
    expect(fechado).toBeLessThanOrEqual(DURACAO_DO_TRACO_MS)
  })

  it('valores inválidos nunca dão tempo negativo nem infinito', () => {
    for (const t of [instanteDoItemNoArco(0, 1, 0), instanteDoItemNoArco(3, 0, 900), instanteDoItemNoArco(0, 6, NaN)]) {
      expect(Number.isFinite(t)).toBe(true)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(DURACAO_DO_TRACO_MS)
    }
  })

  it('na lista de pílulas (janela estreita) elas aparecem em fila, depois do traço começar', () => {
    const t = Array.from({ length: n }, (_, i) => instanteDoItemNaLista(i))
    expect(t[0]).toBeGreaterThan(0)
    for (let i = 1; i < n; i++) expect(t[i]).toBeGreaterThan(t[i - 1])
    expect(t[n - 1]).toBeLessThan(DURACAO_DO_TRACO_MS + 400)
  })
})
