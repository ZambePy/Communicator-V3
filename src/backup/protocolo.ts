/**
 * Backup completo (rodada 3, 21/10/2026) — o que o processo principal e a
 * página combinam. Só constantes e tipos: o preload importa este arquivo, então
 * ele não pode puxar módulo que use `fs`.
 *
 * O backup é UM arquivo de texto (JSON) com tudo o que é do paciente neste
 * computador: as configurações, as frases, o vocabulário aprendido, o histórico
 * de dor e as gravações da voz guardada (dentro dele, em base64). O formato em
 * si (`BackupV1`) mora em `frontend/src/services/backup/formato.ts`.
 */

export const FORMATO_DO_BACKUP = 'irisflow-backup' as const;
export const VERSAO_DO_BACKUP = 1 as const;

/**
 * O arquivo de backup inteiro, em bytes (50 MiB). Acima disso o app recusa em
 * vez de montar um arquivo que o computador novo não consegue abrir — e oferece
 * o backup sem as gravações da voz, dizendo o que fica de fora.
 */
export const TAMANHO_MAXIMO_DO_BACKUP_BYTES = 50 * 1024 * 1024;

/**
 * Antes de restaurar, o app guarda o estado de agora. O processo principal
 * escreve a cópia em `userData/copias-de-seguranca/` (a página manda só o texto;
 * pasta e nome são dele) e fica com as últimas, para a pasta não crescer sem fim.
 */
export const CANAL_DA_COPIA_DE_SEGURANCA = 'irisflow:backup-guardar-copia';
export const COPIAS_DE_SEGURANCA_MANTIDAS = 5;

export type ResultadoDaCopiaDeSeguranca =
  /** `pasta`: onde ficou, para a tela dizer ao cuidador (a página não usa isto para abrir nada). */
  | { ok: true; nome: string; pasta: string }
  | { ok: false; erro: string };
