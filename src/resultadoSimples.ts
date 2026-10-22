/**
 * O resultado da calibração e do teste de precisão em palavras (item 9 do
 * pedido de 19/10/2026): "Ótima", "Boa" ou "Refazer…", e uma frase do que
 * fazer. Fonte ÚNICA dos limiares: a classificação do teste de precisão
 * (Excelente/Bom/Regular/Ruim) e as palavras saem da mesma função, então não
 * há como a tela dizer "Ótima" sobre um teste que o relatório chama de "Ruim".
 *
 * ## Por que estes limiares
 *
 * São os de sempre do `accuracy.ts`, sobre o erro médio dos pontos interiores:
 * Excelente < 30 px, Bom < 60 px, Regular < 100 px, Ruim ≥ 100 px. Na bancada
 * de referência (23,6" a 60 cm, 1920×1080: 38,5 px por grau) isso é 0,8°,
 * 1,6° e 2,6° — e 2,6° é a METADE do alvo mínimo do app (5°): acima disso o
 * cursor, na média, cai fora de um botão mínimo. As palavras juntam as classes
 * pelo que elas significam para quem usa:
 *
 *   Excelente e Bom  →  Ótima   o cursor cai bem dentro de qualquer botão
 *   Regular          →  Boa     dentro do botão na média; dá para usar
 *   Ruim             →  Refazer fora do botão mínimo na média
 *
 * Na tela de resultado, sem teste de precisão, o erro é o LOTO da grade
 * interna da calibração. As duas medidas estimam a mesma coisa — o erro num
 * lugar da tela em que o modelo não treinou —, e nas nove sessões de
 * `docs/medicoes/historico/` a classe pelo LOTO bateu com a do teste em oito
 * (a que divergiu: LOTO 170 px "Ruim", teste 76 px "Regular").
 *
 * LIMITE herdado do `accuracy.ts`: os limiares são em px, então numa tela de
 * outra densidade a mesma classe vale outro ângulo. Mudar para graus é mudar
 * a classificação do relatório junto — fica para quando houver sessões de
 * outras telas.
 */

/**
 * Como a pessoa quer ler os resultados (perguntado uma vez, no começo da
 * calibração; muda em Configurações). `simples`: a palavra e uma frase do que
 * fazer. `tecnica`: os números de sempre — px, graus, LOTO, precisão.
 */
export type LinguagemDoRelatorio = 'simples' | 'tecnica';

/** Erro interior abaixo do qual o teste é "Excelente", em px. */
export const LIMIAR_EXCELENTE_PX = 30;
/** Abaixo disto, "Bom". */
export const LIMIAR_BOM_PX = 60;
/** Abaixo disto, "Regular"; daqui para cima, "Ruim". */
export const LIMIAR_REGULAR_PX = 100;

export type ClasseDoErro = 'Excelente' | 'Bom' | 'Regular' | 'Ruim';

/** A classe do teste de precisão para um erro médio em px. `null` sem medida. */
export function classificarErroPx(erroPx: number | null | undefined): ClasseDoErro | null {
  if (typeof erroPx !== 'number' || !Number.isFinite(erroPx)) return null;
  if (erroPx < LIMIAR_EXCELENTE_PX) return 'Excelente';
  if (erroPx < LIMIAR_BOM_PX) return 'Bom';
  if (erroPx < LIMIAR_REGULAR_PX) return 'Regular';
  return 'Ruim';
}

/** Classe CSS de cada classe (as cores do relatório). */
export const CLASSE_CSS_DO_ERRO: Record<ClasseDoErro, string> = {
  Excelente: 'accuracy-excellent',
  Bom: 'accuracy-good',
  Regular: 'accuracy-regular',
  Ruim: 'accuracy-poor',
};

export type PalavraDoResultado = 'otima' | 'boa' | 'refazerCantos' | 'refazerPontos' | 'refazerTudo';

export interface EntradaDaPalavra {
  /** Erro dos pontos interiores, em px: o do teste ou o LOTO da grade interna. */
  erroInternoPx: number | null;
  /** Pontos ruins que dá para refazer sozinhos, por região. */
  pontosRuins: { borda: number; interno: number };
  /** O centro já erra demais: refazer pontos avulsos não resolve. */
  sessaoRuim?: boolean;
}

/**
 * A palavra do resultado. A ordem importa:
 *  1. miolo ruim (ou a sessão inteira) → refazer a calibração;
 *  2. pontos ruins no miolo → refazer alguns pontos;
 *  3. só cantos/bordas ruins → refazer os cantos;
 *  4. senão a classe do erro: Ótima (Excelente/Bom) ou Boa (Regular).
 * Sem medida nenhuma, "Boa": não reprova o que não mediu nem promete "Ótima".
 */
export function palavraDoResultado(e: EntradaDaPalavra): PalavraDoResultado {
  const classe = classificarErroPx(e.erroInternoPx);
  if (e.sessaoRuim || classe === 'Ruim') return 'refazerTudo';
  if (e.pontosRuins.interno > 0) return 'refazerPontos';
  if (e.pontosRuins.borda > 0) return 'refazerCantos';
  if (classe === 'Excelente' || classe === 'Bom') return 'otima';
  return 'boa';
}

/** A palavra, como a tela escreve. */
export const TITULO_DA_PALAVRA: Record<PalavraDoResultado, string> = {
  otima: 'Ótima',
  boa: 'Boa',
  refazerCantos: 'Refazer os cantos',
  refazerPontos: 'Refazer alguns pontos',
  refazerTudo: 'Vale refazer a calibração',
};

/**
 * A frase do que fazer, no painel do teste de precisão. A tela de resultado
 * tem a sua (i18n), que pode nomear o motivo e oferecer refazer só os pontos.
 *
 * O painel só tem dois botões (Continuar e Refazer a calibração), então a
 * frase não promete refazer só os cantos: isso existe na tela de resultado,
 * depois da calibração, e quem chega lá recebe a outra frase (ver
 * `FRASE_DOS_CANTOS_COM_RESULTADO_DEPOIS`).
 */
export const FRASE_DO_TESTE: Record<PalavraDoResultado, string> = {
  otima: 'O sistema entendeu bem o seu olhar. Pode usar.',
  boa: 'Dá para usar. Se quiser mais precisão, refaça a calibração com calma outra hora.',
  refazerCantos:
    'O meio da tela ficou bom; os cantos ficaram imprecisos. Dá para usar assim; para melhorar os cantos, refaça a calibração.',
  refazerPontos:
    'Alguns pontos ficaram imprecisos. Dá para usar assim; para melhorar esses pontos, refaça a calibração.',
  refazerTudo: 'O olhar ficou impreciso no meio da tela. Vale refazer a calibração, com o rosto bem iluminado.',
};

/** Cantos ruins no teste do fim da calibração: a tela seguinte refaz só eles. */
export const FRASE_DOS_CANTOS_COM_RESULTADO_DEPOIS =
  'O meio da tela ficou bom; os cantos ficaram imprecisos. Toque em Continuar: na próxima tela dá para refazer só os cantos.';
