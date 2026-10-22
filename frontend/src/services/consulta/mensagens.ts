/**
 * O que dizer ao cuidador quando o diário ou a lista de perguntas NÃO ficou
 * gravada (21/10/2026). As telas nunca dão por salvo o que não foi: cada causa
 * tem a sua frase, calma e sem código de erro.
 */

import type { ResultadoDoRegistro } from '../../utils/clinicalLogger';
import { MAX_PERGUNTAS } from './perguntas';

export type ResultadoDaConsulta = ResultadoDoRegistro | 'invalido' | 'repetida' | 'cheia';

const MENSAGENS: Record<Exclude<ResultadoDaConsulta, 'gravado'>, string> = {
  sem_consentimento:
    'O histórico clínico está desligado neste computador, então nada foi guardado. Quem cuida pode ligá-lo em Configurações.',
  sem_perfil: 'Não há um paciente escolhido, então nada foi guardado. Escolha o paciente e tente de novo.',
  falhou: 'Não foi possível guardar agora. Veja se há espaço livre no computador e tente de novo.',
  invalido: 'Esse valor não pôde ser guardado. Tente escolher de novo.',
  repetida: 'Essa pergunta já está na lista.',
  cheia: `A lista chegou a ${MAX_PERGUNTAS} perguntas. Marque algumas como feitas ou tire as que não precisa mais.`,
};

/** `null` quando ficou gravado: nada a avisar. */
export function mensagemDoRegistro(resultado: ResultadoDaConsulta): string | null {
  return resultado === 'gravado' ? null : MENSAGENS[resultado];
}
