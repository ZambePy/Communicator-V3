/**
 * Falhas do backup que a tela precisa distinguir (rodada 3, 21/10/2026). A
 * mensagem é sempre para a pessoa ler (pt-BR, sem jargão); o `codigo` é o que a
 * tela usa para decidir o que oferecer — por exemplo, "salvar sem as gravações"
 * quando o backup completo não cabe.
 */
export type CodigoDeErroDoBackup =
  /** O backup passa do tamanho máximo do arquivo. */
  | 'grande-demais'
  /** Não deu para ler as gravações da voz agora (arquivo preso, aplicativo ocupado). */
  | 'voz-ilegivel'
  /** O navegador não deixou ler ou gravar o armazenamento. */
  | 'armazenamento'
  /** O arquivo não é um backup que se possa restaurar. */
  | 'invalido'
  /** Não foi possível guardar a cópia de segurança; nada foi restaurado. */
  | 'copia-falhou'
  /** O paciente escolhido não está neste backup. */
  | 'perfil-ausente'
  /** As gravações da voz não voltaram; nada das configurações foi trocado. */
  | 'voz-falhou';

export class ErroDeBackup extends Error {
  readonly codigo: CodigoDeErroDoBackup;

  constructor(codigo: CodigoDeErroDoBackup, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeBackup';
    this.codigo = codigo;
  }
}
