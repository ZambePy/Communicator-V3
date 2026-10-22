/**
 * Contrato da VOZ GUARDADA (voice banking, pedido de 19/10/2026): frases que o
 * paciente grava com a própria voz enquanto ainda fala, para tocar depois
 * como "mensagens guardadas" — e, se alguém escolher, para servir de base da
 * voz clonada.
 *
 *   renderer ⇄ main (IPC, `CANAIS_VOZ_GUARDADA`), como a voz clonada
 *   (`protocolo.ts`). As gravações ficam em `userData/voz/guardadas/`, ao lado
 *   da voz clonada; nada disto toca rede.
 *
 * O consentimento segue o MESMO formato do da voz clonada (texto aceito,
 * quando, por qual perfil, com o hash do texto) e o main recusa gravar sem
 * ele — voz é dado biométrico (LGPD, art. 5º, II e art. 11).
 *
 * Um termo POR PERFIL (revisão de segurança de 20/10/2026): o titular da voz é
 * cada paciente. Antes havia um termo só para o computador inteiro, e o
 * "Concordo" de um paciente deixava gravar a voz de outro que nunca viu o
 * termo. Gravar exige o termo do perfil do pedido (`consentimentoDoPerfil`).
 */

import { TAMANHO_MAXIMO_DO_BACKUP_BYTES } from '../backup/protocolo';

export const CANAIS_VOZ_GUARDADA = {
  listar: 'irisflow:voz-guardada-listar',
  consentir: 'irisflow:voz-guardada-consentir',
  salvar: 'irisflow:voz-guardada-salvar',
  ler: 'irisflow:voz-guardada-ler',
  apagar: 'irisflow:voz-guardada-apagar',
  // Remover o paciente (revisão final, rodada 1, M4, 21/10/2026): apaga TODAS as gravações dele e o
  // termo que ele aceitou, de uma vez, pelo id do perfil. Sem isto o backup "Tudo" levava a voz de
  // quem já tinha sido removido.
  apagarDoPerfil: 'irisflow:voz-guardada-apagar-do-perfil',
  usarComoReferencia: 'irisflow:voz-guardada-usar-como-referencia',
  // Backup completo (rodada 3, 21/10/2026): as gravações viajam dentro do arquivo
  // de backup e voltam num computador novo. A página só fala em NOMES de arquivo
  // da voz (índice, termos, <uuid>.wav) — nunca em caminho.
  backupListar: 'irisflow:voz-guardada-backup-listar',
  backupLer: 'irisflow:voz-guardada-backup-ler',
  backupRestaurar: 'irisflow:voz-guardada-backup-restaurar',
} as const;

/** Veredito da checagem de qualidade feita na hora de gravar. */
export type QualidadeDaGravacao = 'boa' | 'aceitavel' | 'refazer';

export interface GravacaoGuardada {
  id: string;
  /** A frase que foi gravada (o que a tela mostra no alvo). */
  texto: string;
  criadaEm: string;
  duracaoS: number;
  qualidade: QualidadeDaGravacao;
  /** Paciente que gravou. `null` = sem perfil (modo de desenvolvimento). */
  perfilId: string | null;
  bytes: number;
}

export interface ConsentimentoDaVozGuardada {
  texto: string;
  aceitoEm: string;
  /** Quem aceitou: o termo vale só para este perfil. `null` = sem perfil (modo de desenvolvimento). */
  perfilId: string | null;
  /** SHA-256 do texto aceito (gravado pelo main). */
  hash?: string;
}

/**
 * O termo aceito por ESTE perfil, ou `null`. Comparação exata: o termo de um
 * paciente não vale para outro, e o de "sem perfil" (modo de desenvolvimento)
 * não vale para um paciente — nem o contrário.
 */
export function consentimentoDoPerfil(
  consentimentos: readonly ConsentimentoDaVozGuardada[],
  perfilId: string | null,
): ConsentimentoDaVozGuardada | null {
  return consentimentos.find((c) => c.perfilId === perfilId) ?? null;
}

export interface PedidoDeSalvar {
  id: string;
  texto: string;
  /** WAV PCM (RIFF/WAVE). */
  wav: ArrayBuffer;
  duracaoS: number;
  qualidade: QualidadeDaGravacao;
  perfilId: string | null;
  /** Gravação que esta substitui (a mesma frase gravada de novo). */
  substitui?: string;
}

export type ResultadoDaListagem =
  /** `consentimentos`: um por perfil que aceitou — a tela procura o do perfil dela (`consentimentoDoPerfil`). */
  | { ok: true; gravacoes: GravacaoGuardada[]; consentimentos: ConsentimentoDaVozGuardada[] }
  | { ok: false; erro: string };

export type ResultadoDeSalvar = { ok: true; gravacao: GravacaoGuardada } | { ok: false; erro: string };
export type ResultadoDeLer = { ok: true; wav: ArrayBuffer } | { ok: false; erro: string };
export type ResultadoSimples = { ok: true } | { ok: false; erro: string };

export const LIMITES_DA_VOZ_GUARDADA = {
  /** Uma frase; o texto longo de referência tem ~300 caracteres. */
  textoMax: 400,
  /** 60 s de WAV 16 bits mono a 48 kHz ≈ 5,8 MB. */
  bytesMax: 8 * 1024 * 1024,
  gravacoesMax: 300,
  /** O termo tem de ser o termo, não um "ok". */
  consentimentoMin: 40,
} as const;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Id de gravação: um UUID. É o nome do arquivo — nada de `..` nem barra. */
export function ehIdDeGravacao(v: unknown): v is string {
  return typeof v === 'string' && ID.test(v);
}

// -----------------------------------------------------------------------------
// Backup completo (rodada 3, 21/10/2026)
// -----------------------------------------------------------------------------

/** Os dois JSON da pasta das gravações; o resto é `<uuid>.wav`. */
export const NOME_DO_INDICE = 'indice.json';
export const NOME_DOS_TERMOS = 'consentimento.json';

export const LIMITES_DO_BACKUP_DA_VOZ = {
  /**
   * Soma de TODOS os arquivos da voz que um backup leva, em bytes de áudio. No
   * arquivo de backup o áudio vai em base64 (4 bytes de texto para cada 3), então
   * o mais que cabe nos 50 MiB do arquivo inteiro são 3/4 disso. Acima, o app
   * recusa em vez de montar um arquivo que o computador novo não abre — e oferece
   * o backup sem a voz.
   */
  bytesMax: Math.floor((TAMANHO_MAXIMO_DO_BACKUP_BYTES * 3) / 4),
} as const;

/** Um arquivo da voz que entra no backup: o nome e quanto pesa. */
export interface ArquivoDoBackupDaVoz {
  nome: string;
  bytes: number;
}

/** Um arquivo da voz que o backup traz de volta. O IPC entrega `ArrayBuffer` ou uma visão dele. */
export interface ArquivoParaRestaurar {
  nome: string;
  bytes: ArrayBuffer | ArrayBufferView;
}

export type ResultadoDaListaDoBackup = { ok: true; arquivos: ArquivoDoBackupDaVoz[] } | { ok: false; erro: string };
export type ResultadoDeLerParaBackup = { ok: true; bytes: ArrayBuffer } | { ok: false; erro: string };
export type ResultadoDaRestauracaoDaVoz =
  /**
   * `gravacoes`: as do backup que estão aqui depois da restauração (novas, copiadas ou que já estavam).
   * `copiadas`: as que entraram com id NOVO porque já havia, aqui, outra gravação com o mesmo id e áudio
   * diferente — a de cá nunca é sobrescrita. `ignoradas`: as que não voltaram (áudio ausente, estragado,
   * dono ilegível, ou apagado durante a restauração).
   */
  | { ok: true; gravacoes: number; termos: number; ignoradas: number; copiadas: number }
  | { ok: false; erro: string };

/**
 * Os únicos nomes que o backup da voz conhece: o índice, o termo e `<uuid>.wav`.
 * É a porta estreita: nada de `..`, barra, `.bak`, `.tmp` nem arquivo solto.
 */
export function ehNomeDeArquivoDoBackup(v: unknown): v is string {
  if (v === NOME_DO_INDICE || v === NOME_DOS_TERMOS) return true;
  return typeof v === 'string' && v.endsWith('.wav') && ehIdDeGravacao(v.slice(0, -'.wav'.length));
}

/** O cabeçalho de um WAV: "RIFF" .... "WAVE". */
export function ehWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 44) return false;
  const tag = (i: number) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  return tag(0) === 'RIFF' && tag(8) === 'WAVE';
}

export function normalizarTextoDaGravacao(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, LIMITES_DA_VOZ_GUARDADA.textoMax);
}

export function ehQualidade(v: unknown): v is QualidadeDaGravacao {
  return v === 'boa' || v === 'aceitavel' || v === 'refazer';
}
