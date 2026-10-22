/**
 * A porta única entre as telas e as abreviações — como `services/assistente`
 * é para as sugestões. O teclado pede "o que o chip oferece para este texto"; os
 * ajustes listam, acrescentam e apagam; quem fala avisa o que foi falado.
 */

import { assistenteEstaAtivo } from '../assistente';
import { dicionarioDasAbreviacoes } from './armazenamento';
import { expansaoDoTexto } from './expandir';

export { aplicarExpansao, chaveDaAbreviacao, expandir, expansaoDoTexto } from './expandir';
export {
  FALAS_PARA_APRENDER,
  MAX_ABREVIACOES_MINHAS,
  MAX_SIGLA,
  MAX_SIGNIFICADO,
  SEMENTES,
  validarAbreviacao,
  type ItemDaLista,
  type OrigemDaAbreviacao,
  type ResultadoDaValidacao,
} from './dicionario';
export {
  aprenderAbreviacoesDaFala,
  dicionarioDasAbreviacoes,
  listarAbreviacoesDoPaciente,
  removerAbreviacao,
  restaurarSementes,
  salvarAbreviacao,
  sementesAlteradasDoPaciente,
  type ResultadoSimples,
} from './armazenamento';

/**
 * O que o chip do teclado oferece para o texto em composição, ou `null`.
 *
 * Segue as sugestões: com o assistente desligado nos ajustes (ou fora do plano)
 * não há chip. Os dois testes baratos vêm antes — texto vazio ou terminado em
 * espaço não pede nada, e assim a maioria das mudanças de texto nem toca o
 * armazenamento.
 */
export function expansaoParaOTexto(texto: string): string | null {
  if (!texto || /\s$/.test(texto)) return null;
  if (!assistenteEstaAtivo()) return null;
  return expansaoDoTexto(texto, dicionarioDasAbreviacoes());
}
