/**
 * Cópia de segurança antes de restaurar um backup (rodada 3, 21/10/2026).
 *
 * Restaurar troca as configurações deste computador pelas do arquivo escolhido.
 * Antes de escrever qualquer coisa, o app guarda o estado de agora — e quem
 * guarda é o PROCESSO PRINCIPAL, numa pasta do app (`userData/copias-de-seguranca/`):
 *   - um download pela página abre o "Salvar como" do sistema e a janela
 *     recarrega logo depois, o que pode cancelá-lo sem ninguém perceber;
 *   - o localStorage não comporta uma cópia do localStorage inteiro.
 * Fora do OneDrive de propósito: a pasta Documentos costuma ser sincronizada, e
 * esta cópia tem nome de paciente, frases e histórico de dor.
 *
 * Canal estreito, só para a janela do app. A página manda SÓ o texto; pasta,
 * nome e extensão são do main — nenhum caminho vindo da página. E uma cópia
 * nunca sobrescreve outra: a segunda do mesmo segundo guardaria o estado já
 * restaurado por cima do original, que era justamente o que a cópia protegia.
 */

import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANAL_DA_COPIA_DE_SEGURANCA, COPIAS_DE_SEGURANCA_MANTIDAS, FORMATO_DO_BACKUP, TAMANHO_MAXIMO_DO_BACKUP_BYTES,
  type ResultadoDaCopiaDeSeguranca,
} from '../src/backup/protocolo';

const PREFIXO = 'copia-de-seguranca-';
/** Só o que este módulo escreveu: a poda não encosta em nenhum outro arquivo da pasta. */
const NOME_DE_COPIA = /^copia-de-seguranca-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-\d{2}\.json$/;

/** `2026-10-21T08-15-30Z`: UTC, sem `:` (o Windows não aceita), e ordena como o tempo. */
const carimbo = (d: Date) => `${d.toISOString().slice(0, 19).replace(/:/g, '-')}Z`;

/** O primeiro nome livre do segundo (`-01`, `-02`…): o contador fixo mantém a ordem do nome igual à do tempo. */
function nomeLivre(pasta: string, quando: Date): string | null {
  for (let n = 1; n <= 99; n++) {
    const nome = `${PREFIXO}${carimbo(quando)}-${String(n).padStart(2, '0')}.json`;
    if (!fs.existsSync(path.join(pasta, nome))) return nome;
  }
  return null;
}

/** Texto inteiro ou nada: escreve num temporário e renomeia. Só o dono lê (tem nome de paciente). */
function gravarTextoAtomico(caminho: string, texto: string): void {
  const temporario = `${caminho}.tmp`;
  try {
    const bytes = Buffer.from(texto, 'utf-8');
    const fd = fs.openSync(temporario, 'w', 0o600);
    try {
      for (let feito = 0; feito < bytes.byteLength; ) feito += fs.writeSync(fd, bytes, feito, bytes.byteLength - feito);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporario, caminho);
  } catch (e) {
    fs.rmSync(temporario, { force: true });
    throw e;
  }
}

/** O tamanho do arquivo no disco agora; `null` se nem isso dá para ler (o motivo vai para o registro). */
function medirNoDisco(caminho: string, log: (m: string) => void): number | null {
  try {
    return fs.statSync(caminho).size;
  } catch (e) {
    log(`[backup] não foi possível medir a cópia de segurança gravada: ${(e as Error)?.message ?? e}`);
    return null;
  }
}

/** Um JSON de objeto que se diz backup do IrisFlow. Uma cópia que não abre depois não é cópia. */
function ehBackupDoIrisFlow(texto: string): boolean {
  try {
    const v = JSON.parse(texto) as unknown;
    return !!v && typeof v === 'object' && !Array.isArray(v) && (v as Record<string, unknown>).formato === FORMATO_DO_BACKUP;
  } catch {
    return false;
  }
}

/** Fica com as `COPIAS_DE_SEGURANCA_MANTIDAS` mais novas — e a recém-gravada nunca é a que sai. */
function podarAsAntigas(pasta: string, recemGravada: string, log: (m: string) => void): void {
  let outras: string[];
  try {
    outras = fs.readdirSync(pasta).filter((n) => NOME_DE_COPIA.test(n) && n !== recemGravada).sort();
  } catch (e) {
    log(`[backup] não foi possível conferir as cópias antigas: ${(e as Error)?.message ?? e}`);
    return;
  }
  for (const antiga of outras.slice(0, Math.max(0, outras.length - (COPIAS_DE_SEGURANCA_MANTIDAS - 1)))) {
    try {
      fs.rmSync(path.join(pasta, antiga), { force: true });
    } catch (e) {
      log(`[backup] a cópia antiga ${antiga} ficou no disco: ${(e as Error)?.message ?? e}`);
    }
  }
}

export function registrarCopiaDeSeguranca(deps: {
  ipcMain: Pick<IpcMain, 'handle'>;
  janelaPrincipal: () => BrowserWindow | null;
  /** `userData/copias-de-seguranca`; em função, para o teste apontar para uma pasta temporária. */
  pasta: () => string;
  agora?: () => Date;
  log?: (m: string) => void;
}): void {
  const agora = deps.agora ?? (() => new Date());
  const log = deps.log ?? ((m) => console.warn(m));
  const FALHOU = { ok: false as const, erro: 'Não foi possível guardar a cópia de segurança neste computador.' };

  deps.ipcMain.handle(CANAL_DA_COPIA_DE_SEGURANCA, (e: IpcMainInvokeEvent, texto: unknown): ResultadoDaCopiaDeSeguranca => {
    const janela = deps.janelaPrincipal();
    if (!janela || janela.isDestroyed() || e.sender !== janela.webContents) {
      log('[backup] cópia de segurança recusada: remetente não é a janela principal');
      return { ok: false, erro: 'Origem não autorizada.' };
    }
    if (typeof texto !== 'string' || texto.length === 0) {
      return { ok: false, erro: 'Não foi possível guardar a cópia de segurança: não veio conteúdo.' };
    }
    // Em bytes, não em letras: acento ocupa dois. Antes de ler o conteúdo, para não
    // carregar um texto enorme só para recusá-lo.
    if (Buffer.byteLength(texto, 'utf-8') > TAMANHO_MAXIMO_DO_BACKUP_BYTES) {
      return { ok: false, erro: `Não foi possível guardar a cópia de segurança: ela passa do tamanho aceito (${TAMANHO_MAXIMO_DO_BACKUP_BYTES / (1024 * 1024)} MB).` };
    }
    if (!ehBackupDoIrisFlow(texto)) {
      return { ok: false, erro: 'Não foi possível guardar a cópia de segurança: o conteúdo não é um backup do IrisFlow.' };
    }
    const pasta = deps.pasta();
    try {
      fs.mkdirSync(pasta, { recursive: true });
      const nome = nomeLivre(pasta, agora());
      if (!nome) return FALHOU;
      const caminho = path.join(pasta, nome);
      gravarTextoAtomico(caminho, texto);
      // "Conferida" não é só "o texto que mandamos gravar estava certo": depois do rename a cópia é MEDIDA de novo. Antivírus,
      // disco cheio e unidade removível podem deixar no disco outra coisa — e uma cópia que não abre depois não é cópia.
      // Só uma cópia boa abre vaga na pasta (a poda vem depois).
      const esperado = Buffer.byteLength(texto, 'utf-8');
      const noDisco = medirNoDisco(caminho, log);
      if (noDisco !== esperado) {
        fs.rmSync(caminho, { force: true });
        log(`[backup] a cópia de segurança ${nome} ficou com ${noDisco === null ? 'tamanho ilegível' : `${noDisco} bytes`} no disco, mas o texto tem ${esperado} bytes (tamanho esperado): descartada.`);
        return FALHOU;
      }
      podarAsAntigas(pasta, nome, log);
      return { ok: true, nome, pasta };
    } catch (erro) {
      log(`[backup] não foi possível guardar a cópia de segurança: ${(erro as Error)?.message ?? erro}`);
      return FALHOU;
    }
  });
}
