/**
 * Posição da frase nova: depois da última. `phrases.length` repetia posições
 * depois de uma remoção (três frases, apaga a do meio, a nova ganhava a mesma
 * posição da última) e a ordem na tela do paciente ficava instável.
 */
export function proximaPosicao(frases: { position?: number | null }[]): number {
  return frases.reduce((max, f) => Math.max(max, (typeof f.position === 'number' ? f.position : -1) + 1), 0);
}
