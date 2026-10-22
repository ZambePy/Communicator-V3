/**
 * O que uma fala do paciente deu — e as duas perguntas que as telas fazem.
 *
 * Num módulo próprio, sem dependências, de propósito: as telas e o aviso de
 * "a voz não saiu" leem estes predicados mesmo quando um teste substitui o
 * `services/voz` inteiro por um `falar` falso.
 */

export type OrigemDaVoz = 'clonada' | 'sistema' | 'nenhuma';

export interface ResultadoDaFala {
  origem: OrigemDaVoz;
  /**
   * Com `origem: 'sistema'`: por que a clonada não foi usada, quando havia
   * intenção de usá-la. Com `origem: 'nenhuma'`: por que nada saiu —
   * `substituida` (outra fala do paciente tomou o lugar), `interrompida`
   * (alguém parou a fala), `texto vazio`, ou uma falha (`sem_voz`, `erro`,
   * `nao_comecou`).
   */
  motivo?: string;
}

/**
 * A fala saiu, com alguma voz. É o único caso em que uma tela pode dizer
 * "falou" (relato de 18/10/2026, item 5). Aceita `undefined` porque as telas
 * não podem quebrar com um resultado que não veio.
 */
export function falaSaiu(r: ResultadoDaFala | null | undefined): boolean {
  return !!r && (r.origem === 'clonada' || r.origem === 'sistema');
}

/**
 * Nada saiu por FALHA (sem voz, erro, a fala nem começou) — e não porque
 * outra fala tomou o lugar desta ou alguém a interrompeu de propósito. É o
 * caso em que a tela mostra o texto em letra grande.
 */
export function falaFalhou(r: ResultadoDaFala | null | undefined): boolean {
  if (!r || r.origem !== 'nenhuma') return false;
  return r.motivo !== 'substituida' && r.motivo !== 'interrompida' && r.motivo !== 'texto vazio';
}
