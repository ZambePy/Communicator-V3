/**
 * Expansão de uma abreviação: "obg" → "obrigado".
 *
 * É uma função pura, sem estado e sem armazenamento: o dicionário vem de quem
 * chama (`montarDicionario`), o que deixa os testes e o chip do teclado
 * olharem para a mesma regra.
 *
 * Duas coisas que o paciente espera sem pedir:
 *
 *   - A CAIXA que ele usou é a que volta. O teclado do olhar só escreve em
 *     maiúsculas; se "N" virasse "não" a linha de composição ficaria com uma
 *     palavra diferente das outras. Por isso "OBG" → "OBRIGADO", "Obg" →
 *     "Obrigado" e "obg" → "obrigado".
 *   - A PONTUAÇÃO grudada fica onde estava: "obg!" → "obrigado!".
 */

import { semAcento } from '@tracker/assistente';

/** Pontuação nas pontas e o miolo. Letras e números nunca entram nas pontas. */
const PONTAS = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su;
const SO_LETRAS = /^\p{L}+$/u;

/**
 * A forma de comparação de uma abreviação: minúscula e sem acento. Quem digita
 * por fixação ocular erra o acento o tempo todo, e "TÁ" tem de achar "ta".
 */
export function chaveDaAbreviacao(texto: string): string {
  return semAcento(texto).toLowerCase();
}

function temChave(dicionario: Readonly<Record<string, string>>, chave: string): boolean {
  // `hasOwnProperty`, e não `in`: "constructor" ou "toString" digitados pelo
  // paciente não são abreviações do objeto-dicionário.
  return Object.prototype.hasOwnProperty.call(dicionario, chave);
}

/**
 * Devolve o que a palavra `token` quer dizer, na caixa em que foi escrita, ou
 * `null` quando não há o que oferecer: não é abreviação, está vazia, tem
 * número ou pontuação no meio, ou a "expansão" é a própria palavra.
 */
export function expandir(token: string, dicionario: Readonly<Record<string, string>>): string | null {
  const bruto = token.trim();
  // Um espaço no meio são duas palavras, e abreviação é uma palavra só.
  if (!bruto || /\s/.test(bruto)) return null;

  const partes = PONTAS.exec(bruto);
  if (!partes) return null;
  const [, antes, miolo, depois] = partes;
  if (!SO_LETRAS.test(miolo)) return null;

  const chave = chaveDaAbreviacao(miolo);
  if (!temChave(dicionario, chave)) return null;
  const significado = dicionario[chave];
  if (typeof significado !== 'string' || !significado.trim()) return null;

  const expandido = naCaixaDe(miolo, significado.trim());
  // Oferecer "ok" para quem escreveu "ok" seria um chip que não faz nada. A
  // comparação é EXATA: "sus" → "SUS" muda a caixa e ainda vale um chip.
  if (expandido === miolo) return null;
  return antes + expandido + depois;
}

/**
 * Tudo em maiúsculas (inclusive uma letra só: "N") pede tudo em maiúsculas;
 * inicial maiúscula pede inicial maiúscula; o resto fica como o dicionário
 * guardou — "sus" → "SUS" e "dr" → "Doutor" são escolha de quem cadastrou.
 */
function naCaixaDe(miolo: string, significado: string): string {
  if (miolo === miolo.toUpperCase() && miolo !== miolo.toLowerCase()) return significado.toUpperCase();
  const [primeira, ...resto] = miolo;
  if (primeira === primeira.toUpperCase() && resto.join('') === resto.join('').toLowerCase()) {
    return significado.charAt(0).toUpperCase() + significado.slice(1);
  }
  return significado;
}

/**
 * O que oferecer para o texto em composição: a expansão da palavra que o
 * paciente está escrevendo AGORA. Depois do espaço ele já seguiu em frente, e
 * um chip para uma palavra do meio da frase só atrapalharia.
 */
export function expansaoDoTexto(texto: string, dicionario: Readonly<Record<string, string>>): string | null {
  if (!texto || /\s$/.test(texto)) return null;
  const palavras = texto.split(/\s+/);
  return expandir(palavras[palavras.length - 1], dicionario);
}

/**
 * O texto depois de escolher o chip: a última palavra sai, a expansão entra e
 * fica um espaço — o mesmo que a escolha de uma palavra da previsão faz.
 */
export function aplicarExpansao(texto: string, expansao: string): string {
  const ultima = /\S*$/.exec(texto);
  const inicio = ultima ? ultima.index : texto.length;
  return `${texto.slice(0, inicio)}${expansao} `;
}
