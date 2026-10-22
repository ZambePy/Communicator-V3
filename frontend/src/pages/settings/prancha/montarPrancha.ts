/**
 * A prancha de letras impressa (pedido de 19/10/2026) — o plano C, para quando
 * o computador não está por perto: falta de luz, banho, transporte, hospital.
 *
 * O arranjo é o do TECLADO DA TELA, lido da mesma fonte (`GROUPS` em
 * `KeyboardScreen.tsx`): seis quadros em 3 × 2, e dentro de cada quadro as
 * mesmas seis posições em 3 × 2. Quem já escreve pelo olhar sabe onde cada
 * letra mora — "o Q fica no terceiro quadro, embaixo, no meio" — e isso vale
 * no papel do mesmo jeito. Os dois níveis do teclado viram os dois passos da
 * prancha: primeiro o quadro, depois a posição.
 *
 * O sexto quadro, que na tela é o das palavras sugeridas, no papel leva
 * frases prontas para o que não pode esperar.
 */

import { GROUPS } from '../../KeyboardScreen';

export type TipoDoItem = 'letra' | 'acao' | 'frase';

export interface ItemDaPrancha {
  texto: string;
  tipo: TipoDoItem;
  /** O que a tecla de ação quer dizer no papel. */
  dica?: string;
}

/**
 * As teclas de ação do teclado, com o que significam numa conversa com a
 * prancha: quem segura anota as letras, e estas quatro dizem o que fazer com
 * a anotação. Os rótulos são os mesmos da tela — a dica explica.
 */
export const ACOES_NO_PAPEL: Readonly<Record<string, string>> = {
  'Espaço': 'fim da palavra',
  Falar: 'leia a frase',
  Apagar: 'errei a letra',
  Limpar: 'começar de novo',
};

/** O que não pode esperar alguém trazer o computador. */
export const FRASES_DA_PRANCHA: readonly string[] = [
  'Estou com dor',
  'Falta de ar',
  'Mudar de posição',
  'Preciso de aspiração',
  'Banheiro',
  'Chame alguém',
];

export interface QuadroDaPrancha {
  /** 1 a 6, na ordem de leitura (como os grupos da tela). */
  numero: number;
  itens: ItemDaPrancha[];
}

export function montarPrancha(grupos: readonly (readonly string[])[] = GROUPS): QuadroDaPrancha[] {
  const daTela = grupos.map((grupo, i) => ({
    numero: i + 1,
    itens: grupo.map((texto): ItemDaPrancha =>
      Object.prototype.hasOwnProperty.call(ACOES_NO_PAPEL, texto)
        ? { texto, tipo: 'acao', dica: ACOES_NO_PAPEL[texto] }
        : { texto, tipo: 'letra' },
    ),
  }));
  return [...daTela, { numero: daTela.length + 1, itens: FRASES_DA_PRANCHA.map((texto) => ({ texto, tipo: 'frase' as const })) }];
}
