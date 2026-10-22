/**
 * Leitor de QR para os TESTES (rodada 3, tarefa 10, 21/10/2026). Lê a matriz de
 * módulos de um QR e devolve o texto que ela guarda.
 *
 * Por que existe: queremos provar que o QR desenhado na tela do computador
 * (components/ParearCelular.tsx) guarda exatamente o endereço de /parear. O
 * `jsqr` serviria, mas não está nas dependências do projeto. Este leitor é
 * pequeno de propósito: não procura o QR numa imagem (a matriz já vem pronta),
 * não corrige erros (a matriz do teste é perfeita) e só entende o que o app
 * gera: modo de bytes, correção de erro M, versões 1 a 10. Qualquer outra coisa
 * vira um erro claro, nunca um texto torto.
 *
 * Não usa o `qrcode-generator` para nada: máscara, posição dos bits e blocos
 * vêm da tabela do padrão (ISO/IEC 18004), para o teste não repetir um erro do
 * gerador.
 */

export type MatrizQr = boolean[][]

/** Padrões de máscara (ISO 18004, tabela 10): verdadeiro = inverte o módulo. */
const MASCARAS: Array<(l: number, c: number) => boolean> = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (_l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0,
]

/** Centros dos padrões de alinhamento, por versão (versão 1 não tem). */
const ALINHAMENTO: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
}

/** Nível M: palavras de correção por bloco e os tamanhos dos blocos de dados. */
const BLOCOS_M: Record<number, { correcao: number; dados: number[] }> = {
  1: { correcao: 10, dados: [16] },
  2: { correcao: 16, dados: [28] },
  3: { correcao: 26, dados: [44] },
  4: { correcao: 18, dados: [32, 32] },
  5: { correcao: 24, dados: [43, 43] },
  6: { correcao: 16, dados: [27, 27, 27, 27] },
  7: { correcao: 18, dados: [31, 31, 31, 31] },
  8: { correcao: 22, dados: [38, 38, 39, 39] },
  9: { correcao: 22, dados: [36, 36, 36, 37, 37] },
  10: { correcao: 26, dados: [43, 43, 43, 43, 44] },
}

/** Bits de nível de correção na informação de formato: M = 00. */
const NIVEL_M = 0

/** A palavra de 15 bits da informação de formato (BCH 15,5 e máscara 0x5412). */
function palavraDoFormato(dados: number): number {
  let resto = dados << 10
  for (let i = 14; i >= 10; i--) {
    if (resto & (1 << i)) resto ^= 0x537 << (i - 10)
  }
  return ((dados << 10) | resto) ^ 0x5412
}

function distancia(a: number, b: number): number {
  let x = a ^ b
  let n = 0
  while (x) {
    n += x & 1
    x >>= 1
  }
  return n
}

function lerFormato(m: MatrizQr): { nivel: number; mascara: number } {
  // Cópia ao redor do finder do canto superior esquerdo, do bit 14 ao 0.
  const l = (linha: number, coluna: number) => (m[linha][coluna] ? 1 : 0)
  let bits = 0
  for (let c = 0; c <= 5; c++) bits = (bits << 1) | l(8, c)
  bits = (bits << 1) | l(8, 7)
  bits = (bits << 1) | l(8, 8)
  bits = (bits << 1) | l(7, 8)
  for (let r = 5; r >= 0; r--) bits = (bits << 1) | l(r, 8)

  let melhor = { dados: -1, d: 99 }
  for (let dados = 0; dados < 32; dados++) {
    const d = distancia(bits, palavraDoFormato(dados))
    if (d < melhor.d) melhor = { dados, d }
  }
  // Até 3 bits errados o padrão ainda corrige; além disso não é um QR legível.
  if (melhor.d > 3) throw new Error('informação de formato inválida: isto não parece um QR')
  return { nivel: melhor.dados >> 3, mascara: melhor.dados & 7 }
}

/** Módulos que não carregam dados: finders, formato, tempo, alinhamento e versão. */
function mapaReservado(n: number, versao: number): boolean[][] {
  const r = Array.from({ length: n }, () => Array.from({ length: n }, () => false))
  const marcar = (l0: number, l1: number, c0: number, c1: number) => {
    for (let l = l0; l <= l1; l++) for (let c = c0; c <= c1; c++) r[l][c] = true
  }
  // Finders com separador (8 x 8) nos três cantos.
  marcar(0, 7, 0, 7)
  marcar(0, 7, n - 8, n - 1)
  marcar(n - 8, n - 1, 0, 7)
  // Informação de formato (e o módulo escuro, em (n - 8, 8)).
  marcar(8, 8, 0, 8)
  marcar(0, 8, 8, 8)
  marcar(8, 8, n - 8, n - 1)
  marcar(n - 8, n - 1, 8, 8)
  // Linhas de tempo.
  marcar(6, 6, 0, n - 1)
  marcar(0, n - 1, 6, 6)
  // Alinhamento (fora dos três finders).
  const centros = ALINHAMENTO[versao]
  const ultimo = centros[centros.length - 1]
  for (const cl of centros) {
    for (const cc of centros) {
      const noFinder = (cl === 6 && cc === 6) || (cl === 6 && cc === ultimo) || (cl === ultimo && cc === 6)
      if (!noFinder) marcar(cl - 2, cl + 2, cc - 2, cc + 2)
    }
  }
  // Informação de versão (a partir da 7): dois blocos de 6 x 3.
  if (versao >= 7) {
    marcar(0, 5, n - 11, n - 9)
    marcar(n - 11, n - 9, 0, 5)
  }
  return r
}

/** Texto guardado numa matriz de QR (modo de bytes, nível M, versões 1 a 10). */
export function decodificarQr(matriz: MatrizQr): string {
  const n = matriz.length
  const versao = (n - 17) / 4
  if (!Number.isInteger(versao) || versao < 1 || versao > 10 || matriz.some((linha) => linha.length !== n)) {
    throw new Error(`tamanho de matriz sem suporte: ${n} x ${matriz[0]?.length ?? 0}`)
  }
  const { nivel, mascara } = lerFormato(matriz)
  if (nivel !== NIVEL_M) throw new Error('só o nível de correção M é suportado neste leitor')

  const reservado = mapaReservado(n, versao)
  const desmascarar = MASCARAS[mascara]

  // Caminho em zigue-zague, de baixo para cima e de cima para baixo, em
  // colunas de dois módulos da direita para a esquerda (a coluna 6 é pulada).
  const bits: number[] = []
  let subindo = true
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col = 5
    for (let i = 0; i < n; i++) {
      const l = subindo ? n - 1 - i : i
      for (let d = 0; d < 2; d++) {
        const c = col - d
        if (reservado[l][c]) continue
        const escuro = matriz[l][c] !== desmascarar(l, c)
        bits.push(escuro ? 1 : 0)
      }
    }
    subindo = !subindo
  }

  const { correcao, dados: tamanhos } = BLOCOS_M[versao]
  const totalDePalavras = tamanhos.reduce((a, b) => a + b, 0) + correcao * tamanhos.length
  if (Math.floor(bits.length / 8) !== totalDePalavras) {
    throw new Error(`a versão ${versao} devia ter ${totalDePalavras} palavras, mas a matriz deu ${Math.floor(bits.length / 8)}`)
  }
  const palavras: number[] = []
  for (let i = 0; i < totalDePalavras; i++) {
    let v = 0
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b]
    palavras.push(v)
  }

  // Desentrelaça os blocos e fica só com os dados (a correção é ignorada).
  const blocos: number[][] = tamanhos.map(() => [])
  let posicao = 0
  for (let i = 0; i < Math.max(...tamanhos); i++) {
    tamanhos.forEach((tamanho, b) => {
      if (i < tamanho) blocos[b].push(palavras[posicao++])
    })
  }
  const dados = blocos.flat()

  // Cabeçalho do segmento: modo (4 bits) e quantidade de bytes (8 ou 16 bits).
  let cursor = 0
  const ler = (quantos: number) => {
    let v = 0
    for (let i = 0; i < quantos; i++) {
      const byte = dados[cursor >> 3]
      v = (v << 1) | ((byte >> (7 - (cursor & 7))) & 1)
      cursor++
    }
    return v
  }
  const modo = ler(4)
  if (modo !== 0b0100) throw new Error(`modo de dados ${modo.toString(2)} sem suporte (só bytes)`)
  const quantidade = ler(versao < 10 ? 8 : 16)
  const bytes = new Uint8Array(quantidade)
  for (let i = 0; i < quantidade; i++) bytes[i] = ler(8)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/**
 * A matriz do QR desenhado por `CodigoQr` (components/ParearCelular.tsx): cada
 * módulo escuro é um `M<x> <y>h1v1h-1z` no caminho do SVG, deslocado pela
 * margem de 4 módulos. O `viewBox` tem o lado da matriz mais 2 x 4.
 */
export function matrizDoSvg(svg: Element): MatrizQr {
  const [, , largura] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number)
  const lado = largura - 8
  if (!Number.isInteger(lado) || lado <= 0) throw new Error('SVG sem viewBox de QR')
  const matriz: MatrizQr = Array.from({ length: lado }, () => Array.from({ length: lado }, () => false))
  const d = svg.querySelector('path')?.getAttribute('d') ?? ''
  for (const m of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const coluna = Number(m[1]) - 4
    const linha = Number(m[2]) - 4
    if (linha < 0 || coluna < 0 || linha >= lado || coluna >= lado) throw new Error('módulo desenhado fora da área do QR')
    matriz[linha][coluna] = true
  }
  return matriz
}
