/**
 * O arquivo de backup e a barreira de entrada (rodada 3, 21/10/2026).
 *
 * Um arquivo de texto (JSON) com tudo o que é do paciente neste computador:
 *   chaves          o `localStorage` que entra (ver `chaves.ts`): ajustes,
 *                   pacientes, frases, vocabulário aprendido, histórico de dor…
 *   arquivosDaVoz   as gravações da voz guardada, em base64, com os mesmos NOMES
 *                   que têm na pasta do app (índice, termos, `<uuid>.wav`).
 *
 * `validarBackup` é o que impede um arquivo estragado — ou mexido à mão — de
 * escrever no armazenamento: recusa o que não é um backup deste app, uma versão
 * que não sabe ler e uma chave que nem é do IrisFlow. Uma chave do IrisFlow que a
 * restauração não toca (licença, modo apresentação…) fica de fora do que se
 * grava — `chavesIgnoradasDoBackup` a conta, e a tela diz quantas — em vez de
 * recusar o arquivo: um backup editado não liga o modo apresentação (que
 * descarta todos os pedidos de socorro) nem troca a licença, e um backup antigo
 * não vira irrestaurável quando a lista de fora cresce. Nunca lança: o motivo vai
 * para a tela.
 */

import { FORMATO_DO_BACKUP, TAMANHO_MAXIMO_DO_BACKUP_BYTES, VERSAO_DO_BACKUP } from '@tracker/backup/protocolo';
import { LIMITES_DA_VOZ_GUARDADA, LIMITES_DO_BACKUP_DA_VOZ, ehNomeDeArquivoDoBackup } from '@tracker/voz/vozGuardada';
import { tamanhoDecodificado } from './base64';
import { CHAVE_DAS_CONFIGURACOES, chaveEhDoAplicativo, chaveEntraNoBackup } from './chaves';

/** O limite do arquivo, como se diz em voz alta nas mensagens ("50 MB"). */
export const TAMANHO_MAXIMO_EM_MB = TAMANHO_MAXIMO_DO_BACKUP_BYTES / (1024 * 1024);

export interface ArquivoDaVozNoBackup {
  /** O nome do arquivo na pasta da voz: `indice.json`, `consentimento.json` ou `<uuid>.wav`. */
  nome: string;
  base64: string;
}

export interface BackupV1 {
  formato: typeof FORMATO_DO_BACKUP;
  versao: typeof VERSAO_DO_BACKUP;
  /** ISO 8601. */
  criadoEm: string;
  /** Versão do aplicativo que fez o backup (só para mostrar; não decide nada). */
  app: string;
  chaves: Record<string, string>;
  arquivosDaVoz?: ArquivoDaVozNoBackup[];
  /**
   * SHA-256 (64 letras hexadecimais) do CONTEÚDO — as chaves e a voz, na forma canônica de `somaDoConteudo`. Opcional: os
   * backups feitos antes dela continuam válidos. Quando existe, a restauração confere antes de escrever qualquer coisa.
   * Sempre o último campo do arquivo: o limite de tamanho conta com `BYTES_DA_SOMA_NO_ARQUIVO`.
   */
  soma?: string;
}

export type ResultadoDaValidacao = { ok: true; backup: BackupV1 } | { ok: false; motivo: string };

const NAO_E_BACKUP = 'Este arquivo não é um backup do IrisFlow.';
const SOMA_FORA_DO_FORMATO = 'A soma de verificação deste backup está fora do formato — o arquivo parece estragado.';
const SOMA_NAO_BATE = 'Este arquivo foi alterado ou está estragado: o conteúdo não bate com a soma de verificação que o backup guardou, e o IrisFlow não o restaura.';
const SOMA_NAO_CONFERIDA = 'Não foi possível conferir se o arquivo está íntegro agora. Tente de novo; se continuar, abra o backup no aplicativo IrisFlow instalado.';

/** Quantos bytes o campo `,"soma":"<64 letras>"` ocupa no arquivo — fixo, porque a soma tem sempre 64 letras ASCII. */
export const BYTES_DA_SOMA_NO_ARQUIVO = ',"soma":"'.length + 64 + '"'.length;
const SOMA = /^[0-9a-fA-F]{64}$/;
const VOZ_FORA_DO_FORMATO = 'As gravações da voz deste backup estão fora do formato — o arquivo parece estragado.';
/** O índice, o termo e uma gravação por vaga. */
const ARQUIVOS_DA_VOZ_MAX = LIMITES_DA_VOZ_GUARDADA.gravacoesMax + 2;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** O backup antigo era só `JSON.stringify(settings)`: sem `formato`, com campos das configurações. */
const parecesBackupAntigo = (x: Record<string, unknown>): boolean =>
  'dwellMs' in x || 'dwellSpeed' in x || 'soundEnabled' in x || 'eyeDominance' in x;

/** As configurações são um objeto JSON? Texto truncado, lista, número ou `null` não são — e o aplicativo os descarta. */
export function configuracoesLegiveis(texto: string): boolean {
  try {
    return ehObjeto(JSON.parse(texto) as unknown);
  } catch {
    return false;
  }
}

function validarVoz(bruto: unknown): { ok: true; arquivos: ArquivoDaVozNoBackup[] } | { ok: false; motivo: string } {
  if (!Array.isArray(bruto) || bruto.length > ARQUIVOS_DA_VOZ_MAX) return { ok: false, motivo: VOZ_FORA_DO_FORMATO };
  const vistos = new Set<string>();
  const arquivos: ArquivoDaVozNoBackup[] = [];
  let total = 0;
  for (const item of bruto) {
    if (!ehObjeto(item) || !ehNomeDeArquivoDoBackup(item.nome) || vistos.has(item.nome)) return { ok: false, motivo: VOZ_FORA_DO_FORMATO };
    const bytes = tamanhoDecodificado(item.base64);
    if (bytes === null) return { ok: false, motivo: VOZ_FORA_DO_FORMATO };
    total += bytes;
    // Sem decodificar nada: a conta sai do tamanho do texto.
    if (total > LIMITES_DO_BACKUP_DA_VOZ.bytesMax) {
      return { ok: false, motivo: 'A voz guardada neste backup é maior do que o aplicativo consegue restaurar.' };
    }
    vistos.add(item.nome);
    arquivos.push({ nome: item.nome, base64: item.base64 as string });
  }
  return { ok: true, arquivos };
}

export function validarBackup(x: unknown): ResultadoDaValidacao {
  if (!ehObjeto(x)) return { ok: false, motivo: NAO_E_BACKUP };
  if (x.formato !== FORMATO_DO_BACKUP) {
    return {
      ok: false,
      motivo: parecesBackupAntigo(x)
        ? 'Este é um backup antigo, que guardava só as configurações. Ele não diz de que paciente nem de que computador são, por isso o IrisFlow não o restaura. Faça um backup novo no computador de origem.'
        : NAO_E_BACKUP,
    };
  }

  const versao = x.versao;
  if (typeof versao !== 'number' || !Number.isInteger(versao) || versao < 1) {
    return { ok: false, motivo: 'A versão deste backup não é reconhecida — o arquivo parece estragado.' };
  }
  if (versao > VERSAO_DO_BACKUP) {
    return {
      ok: false,
      motivo: `Este backup foi feito por uma versão mais nova do IrisFlow (formato ${versao}). Atualize o aplicativo para restaurá-lo.`,
    };
  }

  if (typeof x.criadoEm !== 'string' || !Number.isFinite(Date.parse(x.criadoEm))) {
    return { ok: false, motivo: 'A data deste backup não é válida — o arquivo parece estragado.' };
  }
  if (typeof x.app !== 'string') {
    return { ok: false, motivo: 'A versão do aplicativo que fez este backup não está no arquivo — ele parece estragado.' };
  }

  if (!ehObjeto(x.chaves)) return { ok: false, motivo: 'Os dados deste backup estão incompletos ou fora do formato.' };
  const chaves: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(x.chaves)) {
    // Um arquivo feito por este aplicativo só traz chaves `irisflow…`: outra coisa é arquivo de outro programa, ou mexido à mão.
    if (!chaveEhDoAplicativo(chave)) {
      return {
        ok: false,
        motivo: `Este arquivo traz "${chave}", que o IrisFlow não restaura. Ele foi alterado fora do aplicativo e não será usado.`,
      };
    }
    if (typeof valor !== 'string') return { ok: false, motivo: `O dado "${chave}" deste backup está fora do formato.` };
    // Chave do IrisFlow que ESTA versão não restaura (licença, modo apresentação, sessão…) fica no objeto — a soma de
    // verificação cobre o arquivo como ele é — mas é IGNORADA: `chavesIgnoradasDoBackup` as conta, e quem restaura só
    // grava `chaveEntraNoBackup`. Recusar o arquivo por ela deixaria irrestaurável todo backup antigo cada vez que a lista
    // de fora crescesse, com uma mensagem que culparia o arquivo.
    chaves[chave] = valor;
  }
  if (typeof chaves[CHAVE_DAS_CONFIGURACOES] === 'string' && !configuracoesLegiveis(chaves[CHAVE_DAS_CONFIGURACOES])) {
    return { ok: false, motivo: 'As configurações deste backup estão ilegíveis — o arquivo parece estragado.' };
  }

  // Ausente é permitido (os backups feitos antes dela); presente tem de ser uma soma de verdade, não "nulo" nem texto qualquer.
  if (x.soma !== undefined && !(typeof x.soma === 'string' && SOMA.test(x.soma))) return { ok: false, motivo: SOMA_FORA_DO_FORMATO };

  const backup: BackupV1 = { formato: FORMATO_DO_BACKUP, versao: VERSAO_DO_BACKUP, criadoEm: x.criadoEm, app: x.app, chaves };
  if (x.arquivosDaVoz !== undefined) {
    const voz = validarVoz(x.arquivosDaVoz);
    if (!voz.ok) return voz;
    backup.arquivosDaVoz = voz.arquivos;
  }
  if (typeof x.soma === 'string') backup.soma = x.soma.toLowerCase();
  return { ok: true, backup };
}

// -----------------------------------------------------------------------------
// A soma de verificação
// -----------------------------------------------------------------------------

const porNome = (a: [string, string], b: [string, string]): number => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/**
 * O texto que a soma cobre: só o CONTEÚDO (as chaves e a voz), em forma canônica — pares ordenados pelo nome, para não
 * depender da ordem em que o arquivo os traz nem do espaçamento. A data e a versão do aplicativo ficam de fora: são
 * só para mostrar. As chaves que a restauração não toca ficam DENTRO: o arquivo é conferido como ele é.
 */
function conteudoDaSoma(b: Pick<BackupV1, 'chaves' | 'arquivosDaVoz'>): string {
  const chaves = Object.entries(b.chaves).sort(porNome);
  const voz = (b.arquivosDaVoz ?? []).map((a): [string, string] => [a.nome, a.base64]).sort(porNome);
  return JSON.stringify({ chaves, voz });
}

/**
 * SHA-256 do conteúdo, em letras hexadecimais minúsculas. `null` quando a janela não tem o recurso de criptografia (só
 * páginas seguras têm: https, localhost e o aplicativo instalado). Rejeita se o cálculo falhar.
 */
export async function somaDoConteudo(b: Pick<BackupV1, 'chaves' | 'arquivosDaVoz'>): Promise<string | null> {
  let subtle: SubtleCrypto | undefined;
  try {
    subtle = globalThis.crypto?.subtle;
  } catch {
    subtle = undefined;
  }
  if (!subtle) return null;
  const resumo = await subtle.digest('SHA-256', new TextEncoder().encode(conteudoDaSoma(b)));
  return Array.from(new Uint8Array(resumo), (n) => n.toString(16).padStart(2, '0')).join('');
}

export type ResultadoDaConferencia = { ok: true } | { ok: false; motivo: string };

/**
 * Confere o conteúdo contra a soma do arquivo. Backup SEM soma (feito antes dela) passa: não se recusa o que nunca teve
 * como ser conferido. Com soma que não dá para conferir (sem o recurso de criptografia, ou o cálculo falhou) RECUSA,
 * dizendo por quê: nunca "confere" sem conferir.
 */
export async function conferirSoma(b: BackupV1): Promise<ResultadoDaConferencia> {
  if (b.soma === undefined) return { ok: true };
  let calculada: string | null;
  try {
    calculada = await somaDoConteudo(b);
  } catch (e) {
    console.warn('[backup] não foi possível calcular a soma de verificação:', e);
    return { ok: false, motivo: SOMA_NAO_CONFERIDA };
  }
  if (calculada === null) {
    console.warn('[backup] esta janela não tem como calcular a soma de verificação (página sem o recurso de criptografia).');
    return { ok: false, motivo: SOMA_NAO_CONFERIDA };
  }
  return calculada === b.soma ? { ok: true } : { ok: false, motivo: SOMA_NAO_BATE };
}

/**
 * As chaves do arquivo que esta versão do aplicativo NÃO restaura: são próprias de cada computador (licença, sessão,
 * calibração…) ou de uma versão diferente da que fez o backup. Não recusam o arquivo; a restauração as ignora.
 */
export function chavesIgnoradasDoBackup(b: Pick<BackupV1, 'chaves'>): string[] {
  return Object.keys(b.chaves).filter((chave) => !chaveEntraNoBackup(chave));
}

/** O texto do arquivo e o tamanho dele em BYTES (acento ocupa dois) — o que se confere contra o limite. */
export function serializarBackup(backup: BackupV1): { texto: string; bytes: number } {
  const texto = JSON.stringify(backup);
  return { texto, bytes: new TextEncoder().encode(texto).byteLength };
}
