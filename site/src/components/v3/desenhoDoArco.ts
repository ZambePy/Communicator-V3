import { anguloNoArco } from './geometriaDoArco'

/* O desenho do arco "Para quem" (ArcoDeCondicoes.tsx), rodada 3, 21/10/2026:
   quando a seção entra na tela a linha se traça da esquerda para a direita
   (um recorte que abre, em arco.css) e cada condição aparece quando o traço
   passa por ela. Este arquivo só faz a conta de QUANDO o traço passa por cada
   item — pura, para o teste conferir sem navegador. */

/** O traço leva 1,8 s da ponta esquerda à direita: devagar, como um olhar que percorre. */
export const DURACAO_DO_TRACO_MS = 1800
/** Cada condição aparece em 520 ms (opacidade e um passo de 6 px para fora do arco). */
export const FADE_DO_ITEM_MS = 520

/**
 * O trecho visível da linha, em fração da largura do círculo: é a máscara do
 * arco.css (a linha some nas pontas). O recorte começa onde a linha começa a
 * existir e termina onde ela some — o traço não gasta tempo no que não se vê.
 */
const TRECHO_DO_ARCO = { de: 0.19, ate: 0.81 }

/** Distância do item ao círculo da linha, em px (a folga de 16 + metade de um item de uma linha). */
const DISTANCIA_DO_ITEM_PX = 30

const entre = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Quando (ms desde o começo do traço) a linha passa pelo item `i` de `n` num
 * arco de `raio` px. O item fica à distância raio + 30 do centro do círculo, no
 * ângulo dele: a posição horizontal é 0,5 + 0,5·sen(ângulo)·(1 + 30 ÷ raio) da
 * largura do círculo, e o traço (linear, só horizontal) chega lá na mesma
 * fração do trecho visível.
 */
export function instanteDoItemNoArco(i: number, n: number, raio: number): number {
  const r = Number.isFinite(raio) && raio > 0 ? raio : 900
  const angulo = (anguloNoArco(i, n) * Math.PI) / 180
  const posicao = 0.5 + 0.5 * Math.sin(angulo) * (1 + DISTANCIA_DO_ITEM_PX / r)
  const { de, ate } = TRECHO_DO_ARCO
  return DURACAO_DO_TRACO_MS * entre((posicao - de) / (ate - de))
}

/** Na lista de pílulas (janela estreita) elas vêm em fila, logo depois de o traço começar. */
export function instanteDoItemNaLista(i: number): number {
  return 500 + i * 140
}
