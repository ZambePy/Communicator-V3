/**
 * Voz guardada — os canais IPC (pedido de 19/10/2026). O arquivo em si está em
 * `gravacoes.ts`; aqui só a porta, estreita e só para a janela do app.
 *
 * "Usar como base da voz do computador" passa pelo MESMO caminho da
 * importação da voz clonada (`registrarVoz` → `importarDeArquivo`): o mesmo
 * preparo do áudio no motor, o mesmo termo de consentimento exigido e
 * gravado, a mesma troca atômica da referência. A diferença é só de onde vem o
 * arquivo — da pasta das gravações, escolhido pelo id, e não do seletor do
 * sistema. O renderer nunca passa um caminho: um caminho vindo da página
 * faria o motor ler qualquer arquivo do disco.
 */

import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { CANAIS_VOZ_GUARDADA } from '../../src/voz/vozGuardada';
import type { ResultadoDaImportacao } from '../../src/voz/protocolo';
import { criarArmazemDeGravacoes, type ArmazemDeGravacoes } from './gravacoes';

export function registrarVozGuardada(opcoes: {
  janelaPrincipal: () => BrowserWindow | null;
  /** `ControleDaVoz.importarDeArquivo`: o caminho da importação da voz clonada, sem o seletor. */
  importarDeArquivo: (origem: string, consentimento: unknown, nomeParaMostrar: string) => Promise<ResultadoDaImportacao>;
  /** Para teste; o padrão é `userData/voz/guardadas`. */
  pasta?: string;
}): ArmazemDeGravacoes {
  const pasta = opcoes.pasta ?? path.join(app.getPath('userData'), 'voz', 'guardadas');
  const armazem = criarArmazemDeGravacoes(pasta);

  // Mesma checagem de remetente dos outros canais da voz: só a janela do app.
  const daJanelaPrincipal = (e: IpcMainInvokeEvent): boolean => {
    const j = opcoes.janelaPrincipal();
    return !!j && !j.isDestroyed() && e.sender === j.webContents;
  };
  const RECUSA = { ok: false as const, erro: 'Origem não autorizada.' };

  ipcMain.handle(CANAIS_VOZ_GUARDADA.listar, (e) => (daJanelaPrincipal(e) ? armazem.listar() : RECUSA));
  ipcMain.handle(CANAIS_VOZ_GUARDADA.consentir, (e, c: unknown) => (daJanelaPrincipal(e) ? armazem.consentir(c) : RECUSA));
  ipcMain.handle(CANAIS_VOZ_GUARDADA.salvar, (e, pedido: unknown) => (daJanelaPrincipal(e) ? armazem.salvar(pedido) : RECUSA));
  ipcMain.handle(CANAIS_VOZ_GUARDADA.ler, (e, id: unknown) => (daJanelaPrincipal(e) ? armazem.ler(id) : RECUSA));
  ipcMain.handle(CANAIS_VOZ_GUARDADA.apagar, (e, id: unknown) => (daJanelaPrincipal(e) ? armazem.apagar(id) : RECUSA));
  // Remover o paciente (M4, 21/10/2026): as gravações e o termo dele saem do computador. Pelo id do perfil, nunca por caminho.
  ipcMain.handle(CANAIS_VOZ_GUARDADA.apagarDoPerfil, (e, perfilId: unknown) => (daJanelaPrincipal(e) ? armazem.apagarDoPerfil(perfilId) : RECUSA));
  // Backup completo (rodada 3): a página lista, lê um por vez, por NOME, e devolve tudo de uma vez
  // para somar ao que já existe (sem sobrescrever: gravação com o mesmo id e outro áudio entra como cópia).
  // A restauração é assíncrona — o processo principal segue atendendo a janela enquanto os áudios são escritos.
  // Nenhum destes canais recebe nem devolve caminho.
  ipcMain.handle(CANAIS_VOZ_GUARDADA.backupListar, (e) => (daJanelaPrincipal(e) ? armazem.arquivosParaBackup() : RECUSA));
  ipcMain.handle(CANAIS_VOZ_GUARDADA.backupLer, (e, nome: unknown) => (daJanelaPrincipal(e) ? armazem.lerArquivoDoBackup(nome) : RECUSA));
  ipcMain.handle(CANAIS_VOZ_GUARDADA.backupRestaurar, (e, arquivos: unknown, opcoes: unknown) => (daJanelaPrincipal(e) ? armazem.restaurarDoBackup(arquivos, opcoes) : RECUSA));
  ipcMain.handle(CANAIS_VOZ_GUARDADA.usarComoReferencia, async (e, id: unknown, consentimento: unknown): Promise<ResultadoDaImportacao> => {
    if (!daJanelaPrincipal(e)) return RECUSA;
    const alvo = armazem.arquivoDe(id);
    if (!alvo) return { ok: false, erro: 'Esta gravação não está mais neste computador.' };
    const frase = alvo.gravacao.texto.length > 60 ? `${alvo.gravacao.texto.slice(0, 57)}…` : alvo.gravacao.texto;
    return opcoes.importarDeArquivo(alvo.caminho, consentimento, `Gravação guardada: "${frase}"`);
  });

  return armazem;
}
