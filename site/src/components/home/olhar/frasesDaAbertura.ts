import type { EstadoDoTeclado } from './maquinaDoTeclado'

/**
 * As frases que o olhar escreve na abertura da home e o que ele escolhe para
 * escrever cada uma. A primeira escolha resolve no nível 1 (o grupo que contém
 * a letra), a segunda no nível 2 (a letra); `teclaQueMostra` acha a tecla.
 * São frases do dia a dia de quem usa o app — a segunda é a mesma da conversa
 * de demonstração do IrisFlow Cuidador.
 *
 * Fica num arquivo à parte porque a home precisa do quadro final logo de cara
 * (movimento reduzido), e o resto do roteiro só chega sob demanda.
 */
export const ROTEIRO = [
  { frase: 'Estou com sede.', escolhas: ['E', 'E', 'Sugestões', 'Estou com sede.', 'Falar'] },
  { frase: 'Obrigado, amor.', escolhas: ['O', 'O', 'Sugestões', 'Obrigado, amor.', 'Falar'] },
] as const

export type RoteiroDeFrases = ReadonlyArray<{ frase: string; escolhas: readonly string[] }>

/** O quadro em que a abertura para: a última frase escrita, no nível 1. */
export const QUADRO_FINAL: EstadoDoTeclado = {
  nivel: { tipo: 'grupos' },
  texto: `${ROTEIRO[ROTEIRO.length - 1].frase} `,
}
