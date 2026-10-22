/**
 * Monta o backup (rodada 3, 21/10/2026): lê o `localStorage` (as chaves que
 * entram, ver `chaves.ts`) e, no aplicativo instalado, as gravações da voz
 * guardada, e devolve o objeto do arquivo.
 *
 * Princípio: um backup que parece completo e não é, é pior do que nenhum. Por
 * isso qualquer coisa que não deu para ler RECUSA com o motivo — nunca entrega
 * um arquivo "sem a voz" sem que a pessoa tenha pedido (`comVoz: false`).
 */

import { FORMATO_DO_BACKUP, TAMANHO_MAXIMO_DO_BACKUP_BYTES, VERSAO_DO_BACKUP } from '@tracker/backup/protocolo';
import { LIMITES_DO_BACKUP_DA_VOZ } from '@tracker/voz/vozGuardada';
import { infoDoApp } from '../../cloud/armazenamento';
import { ehBufferDeBytes, paraBase64 } from './base64';
import { CHAVE_DAS_CONFIGURACOES, chaveEntraNoBackup } from './chaves';
import { ErroDeBackup } from './erro';
import {
  BYTES_DA_SOMA_NO_ARQUIVO, configuracoesLegiveis, serializarBackup, somaDoConteudo, TAMANHO_MAXIMO_EM_MB, validarBackup,
  type ArquivoDaVozNoBackup, type BackupV1,
} from './formato';
import { falhaDoIpc, ponteDoBackupDaVoz, type PonteDoBackupDaVoz } from './ponteDaVoz';

export interface OpcoesDoMontarBackup {
  /** Falso: o backup sai sem as gravações da voz (para quando com elas não cabe no arquivo). Padrão: com. */
  comVoz?: boolean;
}

export interface DependenciasDoMontarBackup {
  /** O `localStorage`. */
  armazenamento?: Pick<Storage, 'length' | 'key' | 'getItem'>;
  /** A ponte da voz; `null` = não há (navegador). Padrão: a da janela. */
  ponteDaVoz?: PonteDoBackupDaVoz | null;
  agora?: () => Date;
  versaoDoApp?: () => Promise<string>;
}

const SEM_LER_A_VOZ = 'Não foi possível ler as gravações da voz agora. Tente de novo em instantes.';
const VOZ_MUDOU = 'As gravações da voz mudaram enquanto o backup era feito. Tente de novo.';
const GRANDE_COM_VOZ = `Com as gravações da voz, o backup passa de ${TAMANHO_MAXIMO_EM_MB} MB, o tamanho máximo de um arquivo de backup. Salve o backup sem as gravações da voz: elas continuam guardadas neste computador.`;
const GRANDE_SEM_VOZ = `Os dados deste computador passam de ${TAMANHO_MAXIMO_EM_MB} MB, o tamanho máximo de um arquivo de backup.`;

function lerChaves(armazenamento: DependenciasDoMontarBackup['armazenamento']): Record<string, string> {
  const chaves: Record<string, string> = {};
  try {
    const origem = armazenamento ?? window.localStorage;
    const nomes: string[] = [];
    for (let i = 0; i < origem.length; i++) {
      const nome = origem.key(i);
      if (nome !== null && chaveEntraNoBackup(nome)) nomes.push(nome);
    }
    // Ordem fixa: dois backups do mesmo estado dão o mesmo arquivo.
    for (const nome of nomes.sort()) {
      const valor = origem.getItem(nome);
      // Sumiu entre listar e ler: `null` no arquivo faria o validador recusar o backup que acabamos de fazer.
      if (valor === null) continue;
      // Configurações truncadas (acontece quando os perfis de calibração estouram a cota — ver `SettingsContext`) o
      // aplicativo já descarta e substitui pelos padrões. O backup faz o mesmo: levá-las faria o validador recusar o
      // PRÓPRIO backup, e quem está com o armazenamento danificado — o que mais precisa salvar e restaurar — não
      // conseguiria nenhum dos dois (correção da rodada 1, 21/10/2026). O resto dos dados vai normalmente.
      if (nome === CHAVE_DAS_CONFIGURACOES && !configuracoesLegiveis(valor)) {
        console.warn(`[backup] ${nome} está ilegível neste computador (o aplicativo já a ignora e usa os padrões): fica fora do backup.`, { tamanho: valor.length });
        continue;
      }
      chaves[nome] = valor;
    }
  } catch (e) {
    console.warn('[backup] não foi possível ler o armazenamento:', e);
    throw new ErroDeBackup('armazenamento', 'Não foi possível ler os dados guardados neste navegador agora. Feche as outras janelas do IrisFlow e tente de novo.');
  }
  return chaves;
}

async function viaPonte<T>(chamada: () => Promise<T>): Promise<T> {
  try {
    return await chamada();
  } catch (e) {
    console.warn('[backup] a ponte da voz falhou:', e);
    throw new ErroDeBackup('voz-ilegivel', falhaDoIpc(e));
  }
}

/** Todos os arquivos da voz (índice, termos, áudios), um por vez, pelo nome. Lista vazia se a pessoa não gravou. */
async function lerAVoz(ponte: PonteDoBackupDaVoz): Promise<ArquivoDaVozNoBackup[]> {
  const lista = await viaPonte(() => ponte.backupListar());
  if (!lista.ok) throw new ErroDeBackup('voz-ilegivel', lista.erro);

  // Antes de ler UM áudio: ler centenas de MB para depois recusar trava a tela à toa.
  const previsto = lista.arquivos.reduce((soma, a) => soma + a.bytes, 0);
  if (previsto > LIMITES_DO_BACKUP_DA_VOZ.bytesMax) throw new ErroDeBackup('grande-demais', GRANDE_COM_VOZ);

  const arquivos: ArquivoDaVozNoBackup[] = [];
  for (const { nome, bytes } of lista.arquivos) {
    const lido = await viaPonte(() => ponte.backupLer(nome));
    if (!lido.ok) throw new ErroDeBackup('voz-ilegivel', lido.erro);
    if (!ehBufferDeBytes(lido.bytes)) throw new ErroDeBackup('voz-ilegivel', SEM_LER_A_VOZ);
    // Gravaram (ou apagaram) uma voz entre listar e ler: o índice e os áudios não combinariam.
    if (lido.bytes.byteLength !== bytes) throw new ErroDeBackup('voz-ilegivel', VOZ_MUDOU);
    arquivos.push({ nome, base64: paraBase64(lido.bytes) });
  }
  return arquivos;
}

/** A soma do conteúdo, ou `null` (com aviso no log) quando não dá para calculá-la: o backup não deixa de ser feito por isso. */
async function somaDoBackup(backup: BackupV1): Promise<string | null> {
  try {
    const soma = await somaDoConteudo(backup);
    if (soma === null) console.warn('[backup] esta janela não tem como calcular a soma de verificação: o backup sai sem ela.', { motivo: 'sem criptografia' });
    return soma;
  } catch (e) {
    console.warn('[backup] não foi possível calcular a soma de verificação: o backup sai sem ela.', e);
    return null;
  }
}

export async function montarBackup(opcoes: OpcoesDoMontarBackup = {}, deps: DependenciasDoMontarBackup = {}): Promise<BackupV1> {
  const chaves = lerChaves(deps.armazenamento);

  const ponte = deps.ponteDaVoz === undefined ? ponteDoBackupDaVoz() : deps.ponteDaVoz;
  const arquivosDaVoz = opcoes.comVoz !== false && ponte ? await lerAVoz(ponte) : [];

  const versaoDoApp = deps.versaoDoApp ?? (async () => (await infoDoApp()).version);
  const backup: BackupV1 = {
    formato: FORMATO_DO_BACKUP,
    versao: VERSAO_DO_BACKUP,
    criadoEm: (deps.agora?.() ?? new Date()).toISOString(),
    app: await versaoDoApp(),
    chaves,
  };
  if (arquivosDaVoz.length > 0) backup.arquivosDaVoz = arquivosDaVoz;

  // O limite é do ARQUIVO, em bytes: a moldura e as configurações somam ao que a voz já ocupa. Medido ANTES de calcular
  // a soma: um backup grande demais não gasta o cálculo.
  const recusarPorTamanho = (): never => {
    throw new ErroDeBackup('grande-demais', backup.arquivosDaVoz ? GRANDE_COM_VOZ : GRANDE_SEM_VOZ);
  };
  const bytesSemASoma = serializarBackup(backup).bytes;
  if (bytesSemASoma > TAMANHO_MAXIMO_DO_BACKUP_BYTES) recusarPorTamanho();

  // A soma de verificação do conteúdo (SHA-256): quem restaura confere antes de escrever, e um valor estragado que
  // continue sendo JSON válido deixa de passar. Campo opcional e o ÚLTIMO do arquivo: se esta janela não tem como
  // calculá-la, o backup sai sem ela — como os feitos antes dela — e o log diz o porquê.
  const soma = await somaDoBackup(backup);
  if (soma !== null) {
    if (bytesSemASoma + BYTES_DA_SOMA_NO_ARQUIVO > TAMANHO_MAXIMO_DO_BACKUP_BYTES) recusarPorTamanho();
    backup.soma = soma;
  }

  // Autoverificação: o aplicativo nunca entrega um backup que ele mesmo se recusaria a restaurar.
  const conferido = validarBackup(backup);
  if (!conferido.ok) {
    console.warn('[backup] o backup montado não passou na conferência:', conferido.motivo);
    throw new ErroDeBackup('invalido', `O backup não ficou íntegro e não foi salvo. ${conferido.motivo}`);
  }
  return backup;
}
