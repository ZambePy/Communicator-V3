/**
 * Quem manda nos capítulos da home é o tempo do vídeo. A gravação do
 * Communicator mostra, em sequência, o teclado, o menu e o tutorial — os três
 * capítulos —, então o passo aceso, a legenda e a barra de progresso saem
 * todos do `currentTime`, e nunca ficam fora de sincronia com a imagem.
 *
 * Funções puras: o componente só as chama a cada quadro.
 */

/** Um capítulo começa num instante da gravação e termina onde o próximo começa. */
export type Trecho = { inicio: number }

/** Uma legenda vale a partir de `de` (segundos da gravação) até a próxima. */
export type Legenda = { de: number; texto: string }

/**
 * Índice do capítulo em que o instante `t` cai. Antes do primeiro início (ou
 * com `t` inválido, o que o vídeo devolve antes de carregar), é o primeiro.
 */
export function capituloNoTempo(t: number, capitulos: readonly Trecho[]): number {
  if (!Number.isFinite(t)) return 0
  for (let i = capitulos.length - 1; i > 0; i--) {
    if (t >= capitulos[i].inicio) return i
  }
  return 0
}

/** Índice da legenda em vigor no instante `t`; antes da primeira, a primeira. */
export function legendaNoTempo(t: number, legendas: readonly Legenda[]): number {
  if (!Number.isFinite(t)) return 0
  for (let i = legendas.length - 1; i > 0; i--) {
    if (t >= legendas[i].de) return i
  }
  return 0
}

/**
 * Quanto do capítulo `i` já passou no instante `t`, de 0 a 1. O último
 * capítulo termina no fim da gravação (`duracao`).
 */
export function progressoNoCapitulo(
  t: number,
  i: number,
  capitulos: readonly Trecho[],
  duracao: number,
): number {
  const inicio = capitulos[i]?.inicio ?? 0
  const fim = i + 1 < capitulos.length ? capitulos[i + 1].inicio : duracao
  if (!Number.isFinite(t) || !(fim > inicio)) return 0
  return Math.min(1, Math.max(0, (t - inicio) / (fim - inicio)))
}
