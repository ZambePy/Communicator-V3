/**
 * O que o assistente guarda POR PACIENTE além do modelo de frases.
 *
 * Abreviações e respostas sugeridas (rodada 3, 21/10/2026) ganharam três
 * coisas no `localStorage`, e as três são dado de saúde de uma pessoa só: o que
 * ela abreviou, as frases curtas que ela falou (a matéria-prima das siglas
 * aprendidas) e quantas sugestões de resposta ela aceitou. Valem a mesma regra
 * do modelo (FE-11): a chave leva o paciente no fim, e sai do computador junto
 * com ele.
 *
 * Fica num módulo que só importa o aviso único (também sem importações) para que
 * `armazenamento.ts` (que apaga) e os serviços que gravam possam usá-lo sem uma
 * depender da outra.
 */

import { avisarUmaVez } from './avisoUnico';

/** O que a pessoa escreveu à mão: siglas acrescentadas, mudadas e apagadas. */
export const BASE_DAS_ABREVIACOES = 'irisflow.abreviacoes.v1';
/** As frases curtas que ela falou, contadas — o que o aparelho aprende das siglas. */
export const BASE_DAS_FALAS = 'irisflow.abreviacoes.falas.v1';
/** Quantas sugestões de resposta foram mostradas e quantas ela escolheu. */
export const BASE_DA_ACEITACAO = 'irisflow.sugestoes.aceitacao.v1';

/** Sem paciente escolhido vale a chave sem dono, como a do modelo. */
export const chaveDoPaciente = (base: string, perfilId: string | null): string =>
  perfilId ? `${base}.${perfilId}` : base;

const ouvintes = new Set<() => void>();

/**
 * Avisa quando o aprendizado é apagado por fora (o botão "Apagar o aprendizado"
 * dos ajustes): a lista de abreviações que está na tela deixou de ser verdade.
 */
export function ouvirMudancaDoAprendizado(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function avisarMudancaDoAprendizado(): void {
  for (const ouvinte of ouvintes) {
    try {
      ouvinte();
    } catch (e) {
      // Um ouvinte com defeito não pode impedir os outros de saberem.
      console.warn('[assistente] ouvinte do aprendizado falhou', e);
    }
  }
}

function remover(chaves: string[]): void {
  try {
    for (const chave of chaves) localStorage.removeItem(chave);
  } catch (e) {
    // "Apagar" é a promessa de privacidade desta tela. Se o navegador não deixou,
    // o dado continua no computador e ninguém saberia: o console avisa (uma vez,
    // para não virar um log por chave) e a tela segue sem travar.
    avisarUmaVez('chaves:remover', '[assistente] o navegador não deixou apagar o que o assistente guarda deste paciente', e);
  }
}

/**
 * "Apagar o aprendizado": some o que o APARELHO aprendeu (as frases curtas
 * contadas e a taxa de aceitação). As abreviações que a pessoa escreveu ficam —
 * ela as escolheu, e perdê-las junto com o aprendizado seria apagar trabalho
 * dela por engano.
 */
export function apagarAprendizadoDoPaciente(perfilId: string | null): void {
  remover([chaveDoPaciente(BASE_DAS_FALAS, perfilId), chaveDoPaciente(BASE_DA_ACEITACAO, perfilId)]);
  avisarMudancaDoAprendizado();
}

/** Perfil removido: tudo o que é dele sai, inclusive as abreviações à mão. */
export function apagarTudoDoPaciente(perfilId: string): void {
  remover([
    chaveDoPaciente(BASE_DAS_ABREVIACOES, perfilId),
    chaveDoPaciente(BASE_DAS_FALAS, perfilId),
    chaveDoPaciente(BASE_DA_ACEITACAO, perfilId),
  ]);
  avisarMudancaDoAprendizado();
}
