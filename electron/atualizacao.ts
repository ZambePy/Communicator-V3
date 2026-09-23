/**
 * Atualização automática (electron-updater, provedor GitHub Releases).
 *
 * Sem isto, cada correção era "baixe o instalador de novo, clique em 'executar
 * assim mesmo' no SmartScreen, reinstale" — e uma família não faz isso duas
 * vezes. Na beta os bugs VÃO aparecer; o mecanismo de entregar a correção é
 * mais importante que a correção.
 *
 * DE ONDE VEM A VERSÃO NOVA: do GitHub Releases do repositório de releases
 * escolhido NO EMPACOTAMENTO — `electron/package-app.mjs` usa
 * `IRISFLOW_RELEASES_REPO` (dono/repo) > `GITHUB_REPOSITORY` (o repositório do
 * workflow) > `build.publish` do package.json, e o electron-builder grava o
 * endereço em `resources/app-update.yml`, que o electron-updater lê. Este
 * arquivo não tem nome de repositório nenhum: trocar o repositório (código
 * privado, instaladores num repositório público só de releases) é trocar a
 * variável `IRISFLOW_RELEASES_REPO` do GitHub Actions (release.yml).
 * Nada de servidor próprio nem de token no app: o repositório de releases é
 * PÚBLICO (um privado exigiria embutir um token no instalador — nunca), e o
 * `latest.yml` / `latest-mac.yml` / `latest-linux.yml` sobem junto com os
 * instaladores.
 *
 * `IRISFLOW_UPDATE_URL` (variável de AMBIENTE, opcional) ainda troca o
 * provedor por um "generic" — serve para testar uma versão num servidor local
 * sem publicar release. Ninguém precisa defini-la.
 *
 * CANAL: beta. As versões são `X.Y.Z-beta.N`; com versão pré-lançamento o
 * electron-updater aceita pré-lançamentos (`allowPrerelease`), e o
 * `latest*.yml` é sempre gerado com esse nome (`detectUpdateChannel: false`),
 * então quem está na beta recebe a próxima beta e, depois, a 1.0 estável.
 *
 * POLÍTICA: verifica 45 s depois de abrir e a cada 4 h; baixa em segundo
 * plano; NUNCA reinicia sozinho. Reiniciar no meio de uma frase de quem se
 * comunica por fixação ocular é perder a frase. A instalação acontece quando
 * o cuidador aceita ("Reiniciar agora") ou, se ele escolher "Depois", ao
 * fechar o app (`autoInstallOnAppQuit`).
 *
 * LIMITES CONHECIDOS (o estado mostra, o app segue):
 *   - macOS sem assinatura Developer ID: o Squirrel.Mac recusa instalar. O
 *     download acontece e a instalação falha com erro no estado; quem usa Mac
 *     baixa o .dmg novo pelo site até haver certificado.
 *   - Linux .deb/.rpm: o electron-updater instala pelo gerenciador de pacotes
 *     e pede a senha de administrador ao fechar. O AppImage atualiza sozinho.
 */

import { app, ipcMain, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type EstadoDaAtualizacao =
  | { fase: 'inativa'; motivo: string }
  | { fase: 'verificando' }
  | { fase: 'em_dia'; versao: string }
  | { fase: 'baixando'; versao: string; progresso: number }
  | { fase: 'pronta'; versao: string }
  | { fase: 'erro'; mensagem: string };

export const CANAIS_ATUALIZACAO = {
  estado: 'irisflow:atualizacao-estado',
  mudou: 'irisflow:atualizacao-mudou',
  instalar: 'irisflow:atualizacao-instalar',
  verificar: 'irisflow:atualizacao-verificar',
} as const;

/** Primeira verificação depois da abertura: câmera e motor sobem primeiro. */
const PRIMEIRA_VERIFICACAO_MS = 45_000;
/** Entre verificações. Quem deixa o app aberto o dia inteiro vê a versão nova no mesmo dia. */
const INTERVALO_MS = 4 * 3600_000;

function motivoParaDesligar(): string | null {
  if (!app.isPackaged) return 'desenvolvimento (não há app empacotado para atualizar)';
  if (process.env.IRISFLOW_UPDATE_URL?.trim()) return null;
  // Sem app-update.yml (build `--dir`, empacotamento sem `publish`) o
  // electron-updater lança ENOENT a cada verificação. Diz uma vez e para.
  const yml = path.join(process.resourcesPath, 'app-update.yml');
  if (!fs.existsSync(yml)) return 'este build não tem resources/app-update.yml (gerado sem configuração de publicação)';
  if (process.platform === 'linux' && !process.env.APPIMAGE && !fs.existsSync(path.join(process.resourcesPath, 'package-type'))) {
    return 'Linux fora de AppImage/.deb/.rpm: atualize pelo site';
  }
  return null;
}

export function registrarAtualizacao(janela: () => BrowserWindow | null): void {
  let estado: EstadoDaAtualizacao = { fase: 'inativa', motivo: 'ainda não iniciado' };

  const publicar = (novo: EstadoDaAtualizacao) => {
    estado = novo;
    const w = janela();
    if (w && !w.isDestroyed()) w.webContents.send(CANAIS_ATUALIZACAO.mudou, estado);
  };

  const daJanela = (e: Electron.IpcMainInvokeEvent) => {
    const w = janela();
    return !!w && !w.isDestroyed() && e.sender === w.webContents;
  };

  ipcMain.handle(CANAIS_ATUALIZACAO.estado, (e) => (daJanela(e) ? estado : null));

  const desligada = motivoParaDesligar();
  if (desligada) {
    publicar({ fase: 'inativa', motivo: desligada });
    console.log('[atualizacao] desligada:', desligada);
    ipcMain.handle(CANAIS_ATUALIZACAO.instalar, () => false);
    ipcMain.handle(CANAIS_ATUALIZACAO.verificar, () => false);
    return;
  }

  // Import tardio: o módulo é pesado e só faz sentido empacotado.
  let autoUpdater: typeof import('electron-updater').autoUpdater;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    autoUpdater = (require('electron-updater') as typeof import('electron-updater')).autoUpdater;
  } catch (erro) {
    console.warn('[atualizacao] electron-updater não carregou:', erro);
    publicar({ fase: 'inativa', motivo: 'módulo de atualização ausente neste build' });
    ipcMain.handle(CANAIS_ATUALIZACAO.instalar, () => false);
    ipcMain.handle(CANAIS_ATUALIZACAO.verificar, () => false);
    return;
  }

  const urlDeTeste = process.env.IRISFLOW_UPDATE_URL?.trim();
  if (urlDeTeste) autoUpdater.setFeedURL({ provider: 'generic', url: urlDeTeste });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // `allowPrerelease` fica no PADRÃO do electron-updater: verdadeiro só quando a
  // versão instalada é pré-lançamento (X.Y.Z-beta.N). Forçá-lo em `true` só
  // mudaria as instalações ESTÁVEIS, e para pior: com ele, o provedor GitHub de
  // uma versão estável pega a PRIMEIRA entrada do feed releases.atom, seja qual
  // for — inclusive o release que guarda os pesos do L2CS (tag `0.0.0-modelos`,
  // sem instalador nem latest*.yml, quando mora no repositório de releases) —,
  // e a verificação falha até sair outra versão (conferido no GitHubProvider do
  // electron-updater 6.8.9). No padrão, a versão estável consulta
  // /releases/latest, que ignora pré-lançamentos; a beta lê o feed e pula as
  // tags que não são semver ou são de outro canal. Como o release.yml publica
  // as versões do app como release NORMAL, as duas as encontram.
  // NÃO se define `channel`: no electron-updater isso liga `allowDowngrade`, e
  // um downgrade silencioso é justamente o que não se quer.
  autoUpdater.allowDowngrade = false;
  // Os erros vão para o nosso log (diagnostico.ts intercepta console.warn);
  // o logger do electron-updater despejaria o release inteiro no console.
  autoUpdater.logger = null;

  let verificando = false;
  autoUpdater.on('checking-for-update', () => {
    // Uma atualização já baixada não "desbaixa" numa nova verificação.
    if (estado.fase !== 'pronta') publicar({ fase: 'verificando' });
  });
  autoUpdater.on('update-not-available', (info) => {
    if (estado.fase !== 'pronta') publicar({ fase: 'em_dia', versao: info.version });
  });
  autoUpdater.on('update-available', (info) => publicar({ fase: 'baixando', versao: info.version, progresso: 0 }));
  autoUpdater.on('download-progress', (p) => {
    const progresso = Math.max(0, Math.min(100, Math.round(p.percent)));
    // Um evento de progresso por ponto percentual basta para a faixa.
    if (estado.fase === 'baixando' && progresso !== estado.progresso) publicar({ ...estado, progresso });
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[atualizacao] versão ${info.version} baixada; instala ao reiniciar ou ao fechar`);
    publicar({ fase: 'pronta', versao: info.version });
  });
  autoUpdater.on('error', (err) => {
    // Erro de atualização nunca pode parecer erro do app: fica no log e no
    // estado (a UI só mostra em Ajustes), e o app segue com a versão que tem.
    const mensagem = String(err?.message ?? err).split('\n')[0].slice(0, 200);
    console.warn('[atualizacao] falha:', mensagem);
    if (estado.fase !== 'pronta') publicar({ fase: 'erro', mensagem });
  });

  const verificar = () => {
    if (verificando || estado.fase === 'pronta' || estado.fase === 'baixando') return;
    verificando = true;
    autoUpdater.checkForUpdates()
      .catch(() => {
        // O electron-updater já emitiu `error` (registrado acima); aqui só
        // não deixa a promessa rejeitada virar `unhandledRejection`.
      })
      .finally(() => { verificando = false; });
  };

  ipcMain.handle(CANAIS_ATUALIZACAO.verificar, (e) => {
    if (!daJanela(e)) return false;
    verificar();
    return true;
  });
  ipcMain.handle(CANAIS_ATUALIZACAO.instalar, (e) => {
    if (!daJanela(e) || estado.fase !== 'pronta') return false;
    // `isSilent=false, isForceRunAfter=true`: instala e reabre. Só chega aqui
    // por decisão do cuidador na tela ("Reiniciar agora").
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (erro) {
        console.warn('[atualizacao] quitAndInstall falhou:', erro);
        publicar({ fase: 'erro', mensagem: 'não foi possível reiniciar para instalar; a versão nova entra ao fechar o app' });
      }
    });
    return true;
  });

  setTimeout(verificar, PRIMEIRA_VERIFICACAO_MS).unref();
  setInterval(verificar, INTERVALO_MS).unref();
  console.log(`[atualizacao] ligada (${urlDeTeste ? `servidor de teste ${urlDeTeste}` : 'GitHub Releases'}), versão atual ${app.getVersion()}`);
}
