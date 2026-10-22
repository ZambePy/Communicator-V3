import { describe, expect, it } from 'vitest'
import { ABERTURA, DISTANCIA_DA_LINHA, anguloNoArco, geometriaDoArco, type Medida } from './geometriaDoArco'

/* "Para quem" (revisão de 21/10/2026, I1): o arco tinha raio fixo em px dentro
   de uma caixa fluida com overflow:hidden; entre 721 e 920 px e acima de 1100
   px de janela, ELA e Distrofias saíam cortadas ou sumiam. Agora raio e posição
   saem da largura REAL da caixa e do tamanho REAL dos itens, e o arco só é
   usado quando cabe inteiro; senão, a lista de pílulas.

   O verificador abaixo NÃO usa nada de geometriaDoArco.ts: refaz a conta do
   arco.css (rotate → translateY → translateX, origem no centro do círculo) com
   matrizes e confere, canto a canto, que cada item está dentro da caixa e que
   dois itens vizinhos não se cruzam. */

// Medidas de verdade do Chromium em 1440 px (offsetWidth × offsetHeight do <li>),
// 21/10/2026: "ELA", "AVC de tronco", "Lesão medular alta", "Paralisia cerebral",
// "Síndrome do encarceramento" (a palavra mais longa manda na largura) e "Distrofias".
const NORMAL: Medida[] = [
  { largura: 48, altura: 32 },
  { largura: 141, altura: 32 },
  { largura: 150, altura: 53 },
  { largura: 150, altura: 53 },
  { largura: 158, altura: 53 },
  { largura: 100, altura: 32 },
]
// As mesmas condições com a fonte menor e quebrando antes (a densidade compacta).
const COMPACTA: Medida[] = [
  { largura: 46, altura: 31 },
  { largura: 118, altura: 49 },
  { largura: 118, altura: 49 },
  { largura: 118, altura: 49 },
  { largura: 146, altura: 49 },
  { largura: 93, altura: 31 },
]

type Ponto = [number, number]
type Matriz = [number, number, number, number, number, number] // a b c d e f (como no CSS)

const mult = (m: Matriz, n: Matriz): Matriz => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const rotacao = (graus: number): Matriz => {
  const r = (graus * Math.PI) / 180
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
}
const translacao = (x: number, y: number): Matriz => [1, 0, 0, 1, x, y]
const aplicar = (m: Matriz, [x, y]: Ponto): Ponto => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** Os quatro cantos do item i na caixa, como o navegador os põe (arco.css). */
function cantos(larguraDaCaixa: number, g: { raio: number; topo: number }, m: Medida, graus: number, folga = 0): Ponto[] {
  // transform: rotate(a) translateY(-raio - 16px - 100%) translateX(-50%)
  const t = mult(rotacao(graus), mult(translacao(0, -g.raio - DISTANCIA_DA_LINHA - m.altura), translacao(-m.largura / 2, 0)))
  // O <li> nasce no centro do círculo: left 50%, top = topo + raio.
  const origem = translacao(larguraDaCaixa / 2, g.topo + g.raio)
  const todos = mult(origem, t)
  const l = m.largura
  const h = m.altura
  const f = folga
  return ([[-f, -f], [l + f, -f], [l + f, h + f], [-f, h + f]] as Ponto[]).map((p) => aplicar(todos, p))
}

/** Separação por eixos: dois quadriláteros convexos se cruzam? */
function seCruzam(a: Ponto[], b: Ponto[]): boolean {
  for (const poligono of [a, b]) {
    for (let i = 0; i < poligono.length; i++) {
      const p = poligono[i]
      const q = poligono[(i + 1) % poligono.length]
      const eixo: Ponto = [-(q[1] - p[1]), q[0] - p[0]]
      const proj = (ps: Ponto[]) => ps.map((pt) => pt[0] * eixo[0] + pt[1] * eixo[1])
      const pa = proj(a)
      const pb = proj(b)
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false
    }
  }
  return true
}

/** Tudo o que está errado numa geometria 'arco' (lista vazia = certa). */
function defeitos(larguraDaCaixa: number, g: { raio: number; topo: number; altura: number }, medidas: Medida[], folgaMinima = 4): string[] {
  const erros: string[] = []
  const n = medidas.length
  const todos = medidas.map((m, i) => cantos(larguraDaCaixa, g, m, anguloNoArco(i, n)))
  todos.forEach((cs, i) => {
    const xs = cs.map((c) => c[0])
    const ys = cs.map((c) => c[1])
    if (Math.min(...xs) < folgaMinima) erros.push(`item ${i} sai pela esquerda (${Math.min(...xs).toFixed(1)})`)
    if (Math.max(...xs) > larguraDaCaixa - folgaMinima) erros.push(`item ${i} sai pela direita (${Math.max(...xs).toFixed(1)} de ${larguraDaCaixa})`)
    if (Math.min(...ys) < 0) erros.push(`item ${i} sai por cima (${Math.min(...ys).toFixed(1)})`)
    if (Math.max(...ys) > g.altura) erros.push(`item ${i} sai por baixo (${Math.max(...ys).toFixed(1)} de ${g.altura})`)
  })
  // Com 6 px de ar de cada lado das caixas (12 px entre os textos), nenhuma se cruza.
  const inchados = medidas.map((m, i) => cantos(larguraDaCaixa, g, m, anguloNoArco(i, n), 3))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (seCruzam(inchados[i], inchados[j])) erros.push(`itens ${i} e ${j} se cruzam`)
  return erros
}

describe('anguloNoArco', () => {
  it('vai de −30° a +30°, em passos iguais; um item só fica no meio', () => {
    expect(ABERTURA).toBe(30)
    const angulos = Array.from({ length: 6 }, (_, i) => anguloNoArco(i, 6))
    expect(angulos[0]).toBe(-30)
    expect(angulos[5]).toBe(30)
    for (let i = 1; i < 6; i++) expect(angulos[i] - angulos[i - 1]).toBeCloseTo(12, 9)
    expect(anguloNoArco(0, 1)).toBe(0)
  })
})

describe('o verificador (controle negativo)', () => {
  it('acusa o desenho de antes: raio fixo de 1100 px numa caixa de 1200 ou de 1116 px', () => {
    // Era o que o CSS fazia acima de 1100 px de janela: raio 1100, topo 100, altura 400.
    const antigo = { raio: 1100, topo: 100, altura: 400 }
    expect(defeitos(1200, antigo, NORMAL).join('\n')).toMatch(/sai pela direita/)
    expect(defeitos(1116, antigo, NORMAL).join('\n')).toMatch(/sai pela (direita|esquerda)/)
    // E o de tablet (raio 760) numa caixa de 707 px (janela de 768).
    expect(defeitos(707, { raio: 760, topo: 96, altura: 330 }, COMPACTA).join('\n')).toMatch(/sai pela (direita|esquerda)/)
  })

  it('acusa itens que se cruzam (raio pequeno demais para o ângulo)', () => {
    expect(defeitos(2000, { raio: 300, topo: 120, altura: 400 }, NORMAL).join('\n')).toMatch(/se cruzam/)
  })
})

describe('geometriaDoArco', () => {
  it('em toda largura de 300 a 2400 px: ou a lista de pílulas, ou um arco que cabe inteiro sem cruzar', () => {
    let arcos = 0
    for (const medidas of [NORMAL, COMPACTA]) {
      for (let w = 300; w <= 2400; w += 3) {
        const g = geometriaDoArco(w, medidas)
        if (g.modo === 'lista') continue
        arcos++
        expect(defeitos(w, g, medidas), `${w}px, ${medidas === NORMAL ? 'normal' : 'compacta'}, raio ${g.raio}`).toEqual([])
      }
    }
    expect(arcos).toBeGreaterThan(500)
  })

  it('nas larguras de computador usa o arco: 960 (janela de 1024), 1116 (1180) e 1200 (1440 e 1920)', () => {
    for (const w of [960, 1116, 1200]) {
      const g = geometriaDoArco(w, NORMAL)
      expect(g.modo, `${w}px`).toBe('arco')
    }
  })

  it('em tablet estreito e celular (707 e 343 px) cai na lista de pílulas, que não corta', () => {
    expect(geometriaDoArco(707, NORMAL).modo).toBe('lista')
    expect(geometriaDoArco(343, NORMAL).modo).toBe('lista')
    expect(geometriaDoArco(360, COMPACTA).modo).toBe('lista')
  })

  it('o raio acompanha a largura: nunca passa do máximo do desenho e não encolhe quando a caixa cresce', () => {
    let anterior = 0
    let achou = false
    for (let w = 300; w <= 2400; w += 2) {
      const g = geometriaDoArco(w, NORMAL)
      if (g.modo !== 'arco') {
        // Depois que o arco cabe, nunca volta a não caber.
        expect(achou, `${w}px voltou à lista`).toBe(false)
        continue
      }
      achou = true
      expect(g.raio).toBeLessThanOrEqual(1100)
      expect(g.raio).toBeGreaterThanOrEqual(anterior)
      anterior = g.raio
    }
    expect(achou).toBe(true)
    // E a 1200 px o raio é bem menor que os 1100 do desenho antigo (que não cabia).
    const g1200 = geometriaDoArco(1200, NORMAL)
    expect(g1200.modo === 'arco' && g1200.raio < 1100).toBe(true)
  })

  it('a altura cobre o arco inteiro e o topo deixa o item mais alto fora do corte', () => {
    for (const w of [960, 1116, 1200]) {
      const g = geometriaDoArco(w, NORMAL)
      if (g.modo !== 'arco') throw new Error('devia ser arco')
      expect(g.topo).toBeGreaterThanOrEqual(DISTANCIA_DA_LINHA + 53)
      expect(g.altura).toBeGreaterThan(g.topo)
    }
  })

  it('entradas sem sentido (sem itens, largura zero, medida zerada ou NaN) dão a lista, nunca um arco quebrado', () => {
    expect(geometriaDoArco(1200, []).modo).toBe('lista')
    expect(geometriaDoArco(0, NORMAL).modo).toBe('lista')
    expect(geometriaDoArco(Number.NaN, NORMAL).modo).toBe('lista')
    expect(geometriaDoArco(1200, [{ largura: 0, altura: 0 }, ...NORMAL.slice(1)]).modo).toBe('lista')
    expect(geometriaDoArco(1200, [{ largura: Number.NaN, altura: 30 }, ...NORMAL.slice(1)]).modo).toBe('lista')
  })

  it('serve para outra quantidade de itens (5 e 7: o do meio fica sobre a linha)', () => {
    for (const n of [1, 3, 5, 7]) {
      const medidas: Medida[] = Array.from({ length: n }, (_, i) => ({ largura: 90 + 10 * (i % 3), altura: 32 }))
      for (const w of [900, 1200, 1800]) {
        const g = geometriaDoArco(w, medidas)
        if (g.modo === 'arco') expect(defeitos(w, g, medidas), `n=${n} w=${w}`).toEqual([])
      }
    }
  })
})
