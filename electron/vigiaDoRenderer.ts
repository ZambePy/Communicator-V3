/**
 * Vigia de renderer travado — a fiação no processo principal.
 *
 * A decisão (quando é travamento, o limiar e o porquê dele) está em
 * `src/vigiaDoRenderer.ts`, pura e testada; aqui só ficam os efeitos: ouvir a
 * batida da página, olhar a janela e o estado de energia do sistema, e, quando
 * o vigia decide, derrubar o processo da página. A recarga depois da queda é
 * a que já existe em `main.ts` (`render-process-gone` → `decidirRecarga`).
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 4).
 */

import { ipcMain, Notification, powerMonitor, type BrowserWindow, type IpcMainEvent } from 'electron';
import {
  CANAL_DA_BATIDA,
  INTERVALO_DO_VIGIA_MS,
  LACUNA_QUE_VAI_PARA_O_LOG_MS,
  criarVigiaDoRenderer,
} from '../src/vigiaDoRenderer';
import { registrarNoLog } from './diagnostico';

/** Aviso NÃO modal de que a tela foi reaberta (some sozinho; nada é bloqueado). */
function avisarReinicio(): void {
  try {
    if (!Notification.isSupported()) return;
    new Notification({
      title: 'IrisFlow',
      body: 'A tela do IrisFlow parou de responder e foi reaberta sozinha.',
    }).show();
  } catch (erro) {
    console.warn('[janela] aviso de reinício da tela não pôde ser mostrado:', erro);
  }
}

export function vigiarRendererTravado(win: BrowserWindow, opcoes: { ligado: boolean }): void {
  if (!opcoes.ligado) return;
  const vigia = criarVigiaDoRenderer();
  // Relógio monotônico: um ajuste do relógio do Windows não vira "silêncio".
  const agora = () => performance.now();
  const contents = win.webContents;
  let suspenso = false;
  let telaBloqueada = false;

  const aoBater = (e: IpcMainEvent, dados: unknown) => {
    if (win.isDestroyed() || e.sender !== contents) return;
    const lacuna = vigia.batida(agora(), dados);
    // Diagnóstico para calibrar o limiar em máquinas reais (um treino longo,
    // um engasgo do driver): fica registrado mesmo quando não chega ao limite.
    if (lacuna !== null && lacuna > LACUNA_QUE_VAI_PARA_O_LOG_MS) {
      registrarNoLog('aviso', `[janela] a página ficou ${Math.round(lacuna / 1000)} s sem dar sinal de vida e voltou sozinha`);
    }
  };
  ipcMain.on(CANAL_DA_BATIDA, aoBater);

  // Página nova (recarga, queda): o vigia só arma de novo com a primeira
  // batida dela — a carga do detector de rosto trava a thread por segundos.
  const desarmar = () => vigia.desarmar();
  contents.on('did-start-loading', desarmar);
  contents.on('render-process-gone', desarmar);

  const aoSuspender = () => { suspenso = true; };
  const aoRetomar = () => { suspenso = false; vigia.desculpar(agora()); };
  const aoBloquear = () => { telaBloqueada = true; };
  const aoDesbloquear = () => { telaBloqueada = false; vigia.desculpar(agora()); };
  powerMonitor.on('suspend', aoSuspender);
  powerMonitor.on('resume', aoRetomar);
  powerMonitor.on('lock-screen', aoBloquear);
  powerMonitor.on('unlock-screen', aoDesbloquear);

  const timer = setInterval(() => {
    if (win.isDestroyed()) return;
    // Minimizada, escondida pelo Modo Computador, tela bloqueada ou sistema
    // suspenso: nada disso é travamento.
    const visivel = win.isVisible() && !win.isMinimized() && !suspenso && !telaBloqueada;
    const r = vigia.verificar(agora(), { visivel });
    if (!r.travado) return;
    vigia.desarmar();
    registrarNoLog(
      'erro',
      `[janela] a página não dá sinal de vida há ${Math.round(r.semBatidaHaMs / 1000)} s com o rastreamento ligado — reiniciando a página`,
    );
    avisarReinicio();
    try {
      contents.forcefullyCrashRenderer();
    } catch (erro) {
      registrarNoLog('erro', '[janela] não foi possível reiniciar a página travada:', erro);
    }
  }, INTERVALO_DO_VIGIA_MS);

  win.on('closed', () => {
    clearInterval(timer);
    ipcMain.removeListener(CANAL_DA_BATIDA, aoBater);
    powerMonitor.removeListener('suspend', aoSuspender);
    powerMonitor.removeListener('resume', aoRetomar);
    powerMonitor.removeListener('lock-screen', aoBloquear);
    powerMonitor.removeListener('unlock-screen', aoDesbloquear);
  });
}
