/**
 * A porta do backup para as gravações da voz guardada (rodada 3, 21/10/2026).
 *
 * As gravações não estão no `localStorage`: ficam em arquivos na pasta do app
 * (`userData/voz/guardadas/`), e só o processo principal do Electron chega lá.
 * O preload expõe, em `window.irisflowVozGuardada`, três chamadas para o backup
 * — listar o que há, ler um arquivo PELO NOME e devolver tudo ao restaurar. A
 * página nunca fala em caminho de arquivo.
 *
 * Fora do aplicativo instalado (navegador, desenvolvimento) não há ponte, e as
 * gravações ficam só na memória da janela: não há o que levar.
 */

import type {
  ArquivoParaRestaurar, ResultadoDaListaDoBackup, ResultadoDaRestauracaoDaVoz, ResultadoDeLerParaBackup,
} from '@tracker/voz/vozGuardada';

export interface PonteDoBackupDaVoz {
  backupListar: () => Promise<ResultadoDaListaDoBackup>;
  backupLer: (nome: string) => Promise<ResultadoDeLerParaBackup>;
  backupRestaurar: (arquivos: ArquivoParaRestaurar[], opcoes?: { perfil?: string }) => Promise<ResultadoDaRestauracaoDaVoz>;
}

/**
 * A ponte do backup desta janela, ou `null`. Uma ponte sem as três chamadas (um
 * aplicativo anterior a esta função) não serve: é melhor dizer "sem a voz" do
 * que falhar no meio de uma restauração.
 */
export function ponteDoBackupDaVoz(w: Window | undefined = typeof window === 'undefined' ? undefined : window): PonteDoBackupDaVoz | null {
  const ponte = (w as unknown as { irisflowVozGuardada?: Partial<PonteDoBackupDaVoz> } | undefined)?.irisflowVozGuardada;
  if (!ponte) return null;
  const completa = typeof ponte.backupListar === 'function'
    && typeof ponte.backupLer === 'function'
    && typeof ponte.backupRestaurar === 'function';
  return completa ? (ponte as PonteDoBackupDaVoz) : null;
}

/** Um IPC que rejeita (janela recarregando, processo principal ocupado) vira esta mensagem, não uma exceção solta na tela. */
export function falhaDoIpc(e: unknown): string {
  const motivo = e instanceof Error ? e.message : String(e);
  return `Não foi possível falar com o aplicativo agora (${motivo}).`;
}
