/**
 * Só para testes do backup: uma "pasta da voz guardada" falsa que fala o mesmo
 * que a ponte do Electron (`window.irisflowVozGuardada.backup*`).
 */
import type { ArquivoParaRestaurar, ResultadoDaRestauracaoDaVoz } from '@tracker/voz/vozGuardada';
import type { PonteDoBackupDaVoz } from '../services/backup/ponteDaVoz';

export const bytesDoTexto = (texto: string): Uint8Array => new TextEncoder().encode(texto);

/** Dois UUID de gravação válidos (o nome do arquivo é `<uuid>.wav`). */
export const ID_A = '8d6f1f0a-aaaa-bbbb-cccc-000000000001';
export const ID_B = '1b2c3d4e-0000-4000-8000-00000000000a';

export interface PonteFalsaDoBackup extends PonteDoBackupDaVoz {
  /** Os nomes que a página pediu para ler, na ordem. */
  lidos: string[];
  /** O que a página mandou restaurar, a cada chamada. */
  restauracoes: { arquivos: ArquivoParaRestaurar[]; opcoes: { perfil?: string } | undefined }[];
}

/**
 * `arquivos`: o que "está na pasta" (nome → bytes). `sobrescreve`: troca uma
 * das três chamadas, para simular falha. Por padrão a restauração responde
 * que voltaram todas as gravações (`.wav`) e os termos.
 */
export function ponteFalsaDoBackup(
  arquivos: Record<string, Uint8Array> = {},
  sobrescreve: Partial<PonteDoBackupDaVoz> = {},
): PonteFalsaDoBackup {
  const lidos: string[] = [];
  const restauracoes: PonteFalsaDoBackup['restauracoes'] = [];
  const resposta = (arquivosRecebidos: ArquivoParaRestaurar[]): ResultadoDaRestauracaoDaVoz => ({
    ok: true,
    gravacoes: arquivosRecebidos.filter((a) => a.nome.endsWith('.wav')).length,
    termos: arquivosRecebidos.some((a) => a.nome === 'consentimento.json') ? 1 : 0,
    ignoradas: 0,
    copiadas: 0,
  });
  return {
    lidos,
    restauracoes,
    backupListar: async () => ({ ok: true, arquivos: Object.entries(arquivos).map(([nome, b]) => ({ nome, bytes: b.byteLength })) }),
    backupLer: async (nome) => {
      lidos.push(nome);
      const b = arquivos[nome];
      return b ? { ok: true, bytes: b.slice().buffer } : { ok: false, erro: 'Arquivo desconhecido.' };
    },
    backupRestaurar: async (recebidos, opcoes) => {
      restauracoes.push({ arquivos: recebidos, opcoes });
      return resposta(recebidos);
    },
    ...sobrescreve,
  };
}
