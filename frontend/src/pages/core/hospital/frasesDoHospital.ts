/**
 * As frases que a tela do quarto (modo hospital) fala, num módulo só de dados
 * (rodada 3, 21/10/2026).
 *
 * Por que separado da tela: a "Preparar frases rápidas" da voz clonada precisa
 * da lista para deixar as frases prontas no cache, e carregar a tela inteira
 * (React, ícones, grade do olhar) só para ler seis frases seria um desperdício.
 * Com a voz clonada, uma frase que nunca foi dita espera até 4 s pela geração e
 * cai para a voz do sistema; "Preciso de aspiração" não pode esperar isso.
 *
 * São ditas na primeira pessoa e sem pedir nada além do que o botão diz:
 * "Estou com sede" não é "traga água" — em jejum, o paciente pode não poder beber.
 */
export const FRASES_DAS_NECESSIDADES = {
  aspirar: 'Preciso de aspiração.',
  posicao: 'Preciso mudar de posição.',
  sede: 'Estou com sede.',
  frio: 'Estou com frio.',
  calor: 'Estou com calor.',
  familia: 'Chame a minha família, por favor.',
} as const;

/** O que a voz diz quando o paciente chama a enfermagem. */
export const FRASE_DO_CHAMADO = 'Por favor, chame a enfermagem.';

/** Tudo o que a tela do quarto fala: é o que vai para o cache da voz clonada. */
export const TEXTOS_DO_HOSPITAL: readonly string[] = [
  ...Object.values(FRASES_DAS_NECESSIDADES),
  FRASE_DO_CHAMADO,
];
