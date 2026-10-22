/* ============================================================
   A geometria do arco "Para quem" (ArcoDeCondicoes.tsx), revisão de
   21/10/2026 (I1).

   Antes, o raio do arco era fixo em px no CSS (1100 px acima de 1100 px de
   janela, 760 abaixo) dentro de uma caixa de largura fluida com
   overflow:hidden: o conteúdo precisava de ~1260 px (ou ~920 px) e a caixa
   tinha de 707 a 1200 px, então ELA e Distrofias saíam cortadas, ou sumiam,
   entre 721 e 920 px e acima de 1100 px de janela.

   Agora raio, topo e altura saem da largura REAL da caixa e do tamanho REAL
   dos itens (medidos no navegador com a fonte já carregada), e o arco só é
   usado quando cabe inteiro, sem tocar a borda e sem um item encostar no
   outro. Quando não cabe, a página mostra a lista de pílulas (que nunca
   corta). Função pura: o componente mede e aplica; os testes simulam a
   largura.

   O desenho (igual ao arco.css): um círculo de raio R com centro em
   (largura/2, topo + R); o item i, de largura w e altura h, é girado em torno
   do centro do círculo pelo ângulo dele, com a borda de baixo a
   DISTANCIA_DA_LINHA da linha do círculo.
   ============================================================ */

/** Metade da abertura do arco, em graus: as condições vão de −30° a +30°. */
export const ABERTURA = 30

/** O ângulo da condição i entre n, de uma ponta à outra do arco. */
export function anguloNoArco(i: number, n: number): number {
  if (n <= 1) return 0
  return -ABERTURA + (2 * ABERTURA * i) / (n - 1)
}

/** Distância entre a borda de baixo do item e a linha acesa, em px. */
export const DISTANCIA_DA_LINHA = 16
/** Ar entre o item mais aberto e a borda da caixa, em px. */
export const FOLGA_LATERAL = 8
/** Ar mínimo entre dois itens vizinhos, em px. */
export const VAO_ENTRE_ITENS = 12
/** O maior raio do desenho: acima disso o arco ficaria achatado demais. */
export const RAIO_MAXIMO = 1100
/** Sobra acima do item mais alto (onde a luz sobe) e abaixo do mais baixo. */
export const MARGEM_DE_CIMA = 40
export const MARGEM_DE_BAIXO = 48

export type Medida = { largura: number; altura: number }

export type GeometriaDoArco =
  | { modo: 'lista' }
  | { modo: 'arco'; raio: number; topo: number; altura: number }

type Ponto = readonly [number, number]

const rad = (graus: number) => (graus * Math.PI) / 180

/**
 * Os quatro cantos de um item, em px, com o centro do círculo na origem
 * (y para baixo). `folga` aumenta a caixa dos quatro lados.
 */
function cantosDoItem(raio: number, graus: number, m: Medida, folga = 0): Ponto[] {
  const a = rad(graus)
  const c = Math.cos(a)
  const s = Math.sin(a)
  const base = raio + DISTANCIA_DA_LINHA
  // No referencial do item (sem girar): x ao longo da tangente, y para fora do centro.
  const locais: Ponto[] = [
    [-m.largura / 2 - folga, -(base + m.altura) - folga],
    [m.largura / 2 + folga, -(base + m.altura) - folga],
    [m.largura / 2 + folga, -base + folga],
    [-m.largura / 2 - folga, -base + folga],
  ]
  return locais.map(([x, y]) => [x * c - y * s, x * s + y * c] as const)
}

/** Dois quadriláteros convexos se cruzam? (separação por eixos) */
function seCruzam(a: Ponto[], b: Ponto[]): boolean {
  for (const poligono of [a, b]) {
    for (let i = 0; i < poligono.length; i++) {
      const p = poligono[i]
      const q = poligono[(i + 1) % poligono.length]
      const ex = -(q[1] - p[1])
      const ey = q[0] - p[0]
      const projetar = (ps: Ponto[]) => ps.map((pt) => pt[0] * ex + pt[1] * ey)
      const pa = projetar(a)
      const pb = projetar(b)
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false
    }
  }
  return true
}

const medidaValida = (m: Medida) => Number.isFinite(m.largura) && Number.isFinite(m.altura) && m.largura > 0 && m.altura > 0

/**
 * O arco que cabe numa caixa de `largura` px com estes itens, ou a lista.
 *
 * O raio é o MAIOR que ainda cabe na largura (mais raio = curva mais suave e
 * itens mais afastados), até RAIO_MAXIMO. Cabe quando, no raio escolhido:
 * os itens ficam dentro da caixa com FOLGA_LATERAL de sobra e dois itens
 * nunca chegam a menos de VAO_ENTRE_ITENS um do outro. Como aumentar o raio só
 * afasta os itens, se não cabe no maior raio possível não cabe em nenhum.
 */
export function geometriaDoArco(largura: number, medidas: Medida[]): GeometriaDoArco {
  const n = medidas.length
  if (n === 0 || !Number.isFinite(largura) || largura <= 0 || !medidas.every(medidaValida)) return { modo: 'lista' }

  // 1. O maior raio que cabe na largura. A extensão horizontal do item i é
  //    (w/2)·|cos a| + (raio + distância + h)·|sin a|, e tem de ficar em
  //    largura/2 − folga.
  let raio = RAIO_MAXIMO
  for (let i = 0; i < n; i++) {
    const a = rad(anguloNoArco(i, n))
    const m = medidas[i]
    const sobra = largura / 2 - FOLGA_LATERAL - (m.largura / 2) * Math.abs(Math.cos(a))
    if (sobra <= 0) return { modo: 'lista' }
    const seno = Math.abs(Math.sin(a))
    if (seno < 1e-9) continue // o item do meio não pede raio algum, só cabe ou não
    raio = Math.min(raio, sobra / seno - DISTANCIA_DA_LINHA - m.altura)
  }
  raio = Math.floor(raio)
  if (!(raio > 0)) return { modo: 'lista' }

  // 2. Vizinhos não se tocam (a ordem na curva é a ordem da lista; conferir
  //    todos os pares custa pouco com seis itens).
  const caixas = medidas.map((m, i) => cantosDoItem(raio, anguloNoArco(i, n), m, VAO_ENTRE_ITENS / 2))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (seCruzam(caixas[i], caixas[j])) return { modo: 'lista' }

  // 3. Topo e altura: o item do meio (o mais alto) fica MARGEM_DE_CIMA abaixo
  //    do corte; a caixa termina MARGEM_DE_BAIXO depois do canto mais baixo.
  const maisAlto = Math.max(...medidas.map((m) => m.altura))
  const topo = Math.ceil(DISTANCIA_DA_LINHA + maisAlto + MARGEM_DE_CIMA)
  let baixo = 0
  medidas.forEach((m, i) => {
    for (const [, y] of cantosDoItem(raio, anguloNoArco(i, n), m)) baixo = Math.max(baixo, topo + raio + y)
  })
  return { modo: 'arco', raio, topo, altura: Math.ceil(baixo + MARGEM_DE_BAIXO) }
}
