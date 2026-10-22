/**
 * Aviso no console UMA vez por tipo de problema.
 *
 * O armazenamento do assistente é chamado a cada tecla e a cada mensagem; uma
 * falha que repete a cada chamada (cota estourada, dado corrompido) viraria um
 * log por tecla e esconderia o resto do console. A primeira ocorrência avisa; as
 * seguintes calam. O ID é o que distingue um problema do outro — quem chama
 * põe o nome do módulo na frente.
 */

const jaAvisados = new Set<string>();

export function avisarUmaVez(id: string, mensagem: string, erro?: unknown): void {
  if (jaAvisados.has(id)) return;
  jaAvisados.add(id);
  console.warn(mensagem, erro ?? '');
}

/** Só para os testes: esquece o que já foi avisado. */
export function _esquecerAvisosParaTeste(): void {
  jaAvisados.clear();
}
