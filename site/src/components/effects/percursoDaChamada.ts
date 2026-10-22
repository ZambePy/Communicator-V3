import { ORDEM_DA_CALIBRACAO } from '@/components/produto/calibracao'

/* A chamada final (AlvosDeCalibracao, em Ilustracoes.tsx), rodada 3,
   21/10/2026: o anel de fixação percorre os 13 pontos da figura da calibração,
   na ordem do app, devagar, enquanto a seção está na tela. Estas são as contas
   do percurso — o componente só desenha o passo em que está.

   Um passo por ponto (0 a 12): o anel chega, enche (a fixação) e, ao fim do
   passo, o ponto fica marcado e o anel vai ao próximo. O passo 13 é o de
   "completo": os 13 marcados e o anel guardado; depois, volta ao começo. */

/** Quanto cada ponto dura: o anel viaja (260 ms), enche e fica um instante cheio. */
export const PASSO_DO_PERCURSO_MS = 1250
/** O anel enche em 1 s (o tempo de fixação padrão do app é 1,5 s; aqui é devagar, mas é uma vitrine). */
export const FIXACAO_NO_PERCURSO_MS = 1000

/** 13 pontos + o passo "completo". */
export const PASSOS_DO_PERCURSO = ORDEM_DA_CALIBRACAO.length + 1

/** O índice (de PONTOS_DA_CALIBRACAO) sob o anel no passo; `null` no passo "completo" e fora da faixa. */
export function pontoDoPasso(passo: number): number | null {
  return ORDEM_DA_CALIBRACAO[passo] ?? null
}

/** Os pontos já fixados no começo do passo: os que vieram antes na ordem. */
export function pontosFeitos(passo: number): number[] {
  return ORDEM_DA_CALIBRACAO.slice(0, Math.max(0, passo))
}

export function proximoPasso(passo: number): number {
  return (passo + 1) % PASSOS_DO_PERCURSO
}
