import { app, BrowserWindow, Menu, dialog, session, ipcMain, screen, safeStorage, shell, type WebContents } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  permitirPermissao, permitirNavegacao, permitirAberturaExterna, hostDoSite, CSP, CSP_DEV, cspComNuvem,
  preferenciasWebSeguras, atalhoBloqueadoEmProducao, alternaTelaCheia, decidirRecarga,
  argumentoDeDepuracao, SWITCHES_DE_DEPURACAO, papeisDoMenuEmpacotado,
} from '../src/electronSecurity';
import { registrarModoComputador } from './computador/sessao';
import { registrarVoz } from './voz';
import { registrarAtualizacao } from './atualizacao';
import { iniciarDiagnostico, pastaDosLogs, registrarNoLog } from './diagnostico';
import { esquecerTamanhosDosMonitores, lerTamanhosDosMonitores } from './monitores';

// ---------------------------------------------------------------------
// Antes de qualquer outra coisa.
//
// 0. App EMPACOTADO aberto com porta de depuração (`--inspect*`,
//    `--remote-debugging-port`, `--remote-debugging-pipe`): encerra. O usuário
//    final recebe o app pronto, não uma porta para ler o código e a memória
//    das páginas. Os fuses do binário (package.json → `build.electronFuses`)
//    já ignoram o inspetor do Node; o protocolo de depuração do Chromium
//    nenhum fuse desliga — por isso a checagem aqui. Em desenvolvimento os
//    dois são ferramenta de trabalho e passam.
// 1. Relatório de falhas + log local (cobre quedas da própria inicialização).
// 2. AppUserModelID do Windows = `build.appId` do electron-builder. Sem isto
//    o Windows agrupa a janela sob "electron.app.IrisFlow Communicator": o
//    ícone da barra de tarefas não casa com o atalho do Menu Iniciar, a
//    janela não "fixa" direito e notificações saem com o nome errado.
// 3. Instância única: um segundo clique no atalho (comum quando o app demora
//    a abrir numa máquina fraca) abriria OUTRA janela disputando a mesma
//    câmera — a segunda falha com "câmera em uso" e parece defeito. A
//    segunda instância só acorda a primeira e sai.
// ---------------------------------------------------------------------
const ARGUMENTO_DE_DEPURACAO = app.isPackaged
  ? argumentoDeDepuracao(process.argv) ?? SWITCHES_DE_DEPURACAO.find((s) => app.commandLine.hasSwitch(s)) ?? null
  : null;
if (ARGUMENTO_DE_DEPURACAO) {
  registrarNoLog('erro', `[seguranca] aberto com argumento de depuração (${ARGUMENTO_DE_DEPURACAO.slice(0, 60)}); encerrando`);
  app.exit(1);
}

iniciarDiagnostico({ canal: 'beta' });

const ID_DO_APP = 'com.irisflow.app';
if (process.platform === 'win32') app.setAppUserModelId(ID_DO_APP);

// Com argumento de depuração nada abaixo sobe, mesmo que o `exit` acima ainda
// não tenha derrubado o processo: sem trava de instância, sem janela.
const PRIMEIRA_INSTANCIA = !ARGUMENTO_DE_DEPURACAO && app.requestSingleInstanceLock();
if (!PRIMEIRA_INSTANCIA) app.quit();

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
const RAIZ_DO_PROJETO = path.join(__dirname, '..');

/** A janela do app. Só existe uma; o Modo Computador e a voz precisam achá-la. */
let janelaPrincipal: BrowserWindow | null = null;

// Variáveis `VITE_*` do frontend que o main também precisa: a URL do Supabase
// (para a CSP de cabeçalho ser igual à `<meta>` que o Vite injeta) e a URL do
// site (para liberar links para ele no navegador do sistema).
//   - dev: ambiente e, se não houver, `frontend/.env.local` / `frontend/.env`
//     (sem depender de dotenv: só a chave que importa);
//   - empacotado: valores fixados no build por `electron/build.mjs`, lidos
//     dos mesmos arquivos que o Vite usa no build de produção.
declare const __IRISFLOW_BUILD_ENV__: Record<string, string>;
function lerVariavelDoFrontend(nome: string): string | undefined {
  if (process.env[nome]) return process.env[nome];
  if (app.isPackaged) {
    try {
      const v = __IRISFLOW_BUILD_ENV__[nome];
      return typeof v === 'string' && v.trim() ? v.trim() : undefined;
    } catch {
      return undefined;
    }
  }
  for (const arquivoEnv of ['.env.local', '.env']) {
    const arquivo = path.join(__dirname, '..', 'frontend', arquivoEnv);
    try {
      const linha = fs.readFileSync(arquivo, 'utf-8').split(/\r?\n/)
        .find((l) => new RegExp(`^\\s*${nome}\\s*=`).test(l));
      if (linha) return linha.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    } catch { /* arquivo ausente: segue */ }
  }
  return undefined;
}

// ---------------------------------------------------------------------
// Cofre local: token da sessão do Supabase e chave do computador.
//
// O renderer não guarda credenciais em localStorage (legível por qualquer
// coisa que abra o perfil do Chromium). Ele pede ao main, que cifra com
// `safeStorage` — DPAPI no Windows, Keychain no macOS — e grava em
// `userData/cloud-store.json`. Sem cifra disponível (Linux sem keyring, por
// exemplo) o valor é gravado em claro com aviso, para o app não ficar sem
// login em vez de sem segurança adicional.
// ---------------------------------------------------------------------
type Cofre = Record<string, { enc: boolean; v: string }>;
const COFRE_CHAVES_PERMITIDAS = /^irisflow\.[a-z0-9_.-]{1,64}$/i;

function caminhoDoCofre(): string {
  return path.join(app.getPath('userData'), 'cloud-store.json');
}
function lerCofre(): Cofre {
  try {
    const raw = fs.readFileSync(caminhoDoCofre(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Cofre) : {};
  } catch {
    return {};
  }
}
function gravarCofre(c: Cofre): void {
  fs.mkdirSync(path.dirname(caminhoDoCofre()), { recursive: true });
  fs.writeFileSync(caminhoDoCofre(), JSON.stringify(c), { encoding: 'utf-8', mode: 0o600 });
}
function chaveValida(chave: unknown): chave is string {
  return typeof chave === 'string' && COFRE_CHAVES_PERMITIDAS.test(chave);
}

/**
 * Só a janela principal fala com estes canais.
 *
 * Defesa em profundidade, como já se faz em `voz/index.ts` e em
 * `computador/sessao.ts`. Hoje não é explorável — `contextIsolation`,
 * `sandbox`, navegação externa bloqueada, e o preload da sobreposição não
 * expõe nada disto. Mas o cofre guarda o token de sessão do Supabase já
 * decifrado, a sobreposição do Modo Computador compartilha a mesma sessão do
 * Chromium, e basta uma janela nova ou um preload distraído para isso virar
 * exfiltração de credencial. A checagem custa uma linha.
 */
function daJanelaPrincipal(e: Electron.IpcMainInvokeEvent): boolean {
  const w = janelaPrincipal;
  if (!w || w.isDestroyed()) return false;
  if (e.sender !== w.webContents) {
    console.warn('[ipc] pedido recusado: remetente não é a janela principal');
    return false;
  }
  return true;
}

ipcMain.handle('irisflow:secure-get', (e, chave: unknown): string | null => {
  if (!daJanelaPrincipal(e) || !chaveValida(chave)) return null;
  const item = lerCofre()[chave];
  if (!item) return null;
  try {
    if (!item.enc) return item.v;
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(item.v, 'base64'));
  } catch (erro) {
    console.warn('[cofre] não foi possível ler', chave, erro);
    return null;
  }
});

ipcMain.handle('irisflow:secure-set', (e, chave: unknown, valor: unknown): boolean => {
  // 2 MB: a fila offline pode acumular relatórios; safeStorage lida com isso.
  if (!daJanelaPrincipal(e) || !chaveValida(chave) || typeof valor !== 'string' || valor.length > 2_000_000) return false;
  const cofre = lerCofre();
  if (safeStorage.isEncryptionAvailable()) {
    cofre[chave] = { enc: true, v: safeStorage.encryptString(valor).toString('base64') };
  } else {
    console.warn('[cofre] safeStorage indisponível neste sistema — gravando sem cifra');
    cofre[chave] = { enc: false, v: valor };
  }
  gravarCofre(cofre);
  return true;
});

ipcMain.handle('irisflow:secure-remove', (e, chave: unknown): boolean => {
  if (!daJanelaPrincipal(e) || !chaveValida(chave)) return false;
  const cofre = lerCofre();
  delete cofre[chave];
  gravarCofre(cofre);
  return true;
});

// Identidade do computador para o pareamento (nome exibido no app do cuidador).
// Sem guarda de remetente de propósito: versão, sistema e nome da máquina não
// são credencial, e o contrato do preload promete um objeto — devolver `null`
// aqui só criaria um caminho de falha que nunca acontece no uso real.
ipcMain.handle('irisflow:app-info', () => ({
  version: app.getVersion(),
  hostname: os.hostname(),
  platform: process.platform,
  encryptionAvailable: safeStorage.isEncryptionAvailable(),
}));

// Tamanho físico da tela, lido do EDID (registro/WMI no Windows, sysfs no
// Linux, ioreg/CoreGraphics no macOS) — ver `electron/monitores.ts`.
//
// Nenhuma API de browser expõe centímetros: `screen` dá pixels e escala. A
// diagonal entra no erro angular dos relatórios; depender do cuidador digitar
// o valor funciona até ele trocar de monitor. Na dúvida a lista volta vazia e
// o app segue com o valor configurado à mão (passo opcional na UI).
ipcMain.handle('irisflow:monitor-sizes', () => lerTamanhosDosMonitores());

// Pasta dos registros (log do processo principal), para o cuidador anexar
// num pedido de suporte. Só a janela do app pede; abre no gerenciador de
// arquivos do sistema. Os registros não contêm imagem nem texto do paciente.
ipcMain.handle('irisflow:abrir-pasta-dos-logs', async (e): Promise<boolean> => {
  if (!daJanelaPrincipal(e)) return false;
  const pasta = pastaDosLogs();
  if (!pasta) return false;
  return (await shell.openPath(pasta)) === '';
});

// Resolução e escala da tela primária. `window.screen` do renderer não expõe
// o fator de escala do Windows (125%, 150%), e a conversão px→cm do erro
// angular precisa dele.
ipcMain.handle('irisflow:display-info', () => {
  const d = screen.getPrimaryDisplay();
  return {
    widthPx: d.size.width,
    heightPx: d.size.height,
    scaleFactor: d.scaleFactor,
    physicalWidthPx: Math.round(d.size.width * d.scaleFactor),
    physicalHeightPx: Math.round(d.size.height * d.scaleFactor),
  };
});

/**
 * Tela cheia — no desenvolvimento E no app empacotado.
 *
 * Não é conforto — é validade de medida. A grade de calibração é derivada de um
 * ORÇAMENTO ANGULAR, e a conversão px→cm usa `document.documentElement.client*`
 * (o VIEWPORT) contra a diagonal física da tela. Numa janela de 1280×800 sobre
 * um monitor de 23,6", o pipeline calcula como se aqueles 1280×800 ocupassem
 * os 23,6" inteiros: a densidade sai errada, os alvos vão parar na fração
 * errada da tela e o `meanErrorDeg` do relatório mente. Só em tela cheia o
 * viewport coincide com o monitor que as configurações descrevem. E, para
 * quem se comunica pelo olhar, a barra de tarefas e as bordas da janela são
 * alvos que ele não consegue usar e que roubam área útil.
 *
 * Saída do CUIDADOR (teclado físico): F11 alterna (Ctrl+Cmd+F no macOS) —
 * `alternaTelaCheia` em `src/electronSecurity.ts`. Esc continua com a página
 * (fecha diálogos). Fora da tela cheia a janela é normal: redimensionável, com
 * botões de minimizar/fechar. Alt+F4 / Cmd+Q fecham o app como sempre.
 *
 * `IRISFLOW_FULLSCREEN=0` abre em janela — para testar layout responsivo, o
 * piso de `minWidth`/`minHeight`, ou deixar o DevTools destacado visível num
 * monitor só.
 */
const TELA_CHEIA = process.env.IRISFLOW_FULLSCREEN !== '0';

/**
 * Em desenvolvimento, cada abertura começa SEM calibração salva.
 *
 * Pedido de teste: testar o fluxo de calibração com um perfil salvo é testar
 * outra coisa — o app pula a coleta, carrega o modelo de ontem e esconde
 * qualquer regressão no caminho que se queria exercitar. `?calib=0` é a
 * porta que `sessionFromUrl.ts` já entende (vale só para aquela abertura e
 * NÃO apaga nada do disco). O app empacotado persiste normalmente: uma
 * pessoa com ELA não refaz nove pontos a cada abertura.
 * `IRISFLOW_DEV_CALIB=1` religa a persistência no dev.
 */
const URL_DE_DEV = process.env.IRISFLOW_DEV_CALIB === '1' ? DEV_SERVER_URL : `${DEV_SERVER_URL}?calib=0`;

/** Hosts extras que podem abrir no navegador do sistema (site configurado no build). */
function hostsExtrasDoSite(): string[] {
  const h = hostDoSite(lerVariavelDoFrontend('VITE_SITE_URL'));
  return h ? [h] : [];
}

/**
 * Endurecimento de TODO webContents que nascer — a janela principal, a
 * sobreposição do Modo Computador e qualquer janela que alguém acrescente no
 * futuro sem lembrar destas regras:
 *
 *   - navegação (`will-navigate`) e redirecionamento (`will-redirect`) só
 *     dentro do próprio app. Um link externo nunca substitui o app por uma
 *     página remota; se for de um site da lista (`permitirAberturaExterna`),
 *     abre no navegador do SISTEMA;
 *   - nenhuma janela nova (`setWindowOpenHandler` → deny). `target=_blank` e
 *     `window.open` de um site da lista abrem no navegador do sistema — é
 *     assim que "Gerenciar assinatura" e os links do login funcionam;
 *   - `<webview>` proibido (além de `webviewTag: false`).
 */
/**
 * Pasta das páginas do app empacotado, como URL `file://` — só dentro dela a
 * janela pode navegar (`permitirNavegacao`). No desenvolvimento, `null`: o
 * app vem do servidor do Vite (localhost).
 */
function raizDoApp(): string | null {
  if (!app.isPackaged) return null;
  return pathToFileURL(path.join(__dirname, '..', 'frontend', 'dist') + path.sep).href;
}

function endurecerWebContents(contents: WebContents): void {
  const abrirFora = (url: string): boolean => {
    if (!permitirAberturaExterna(url, hostsExtrasDoSite())) return false;
    void shell.openExternal(url).catch((erro) => console.warn('[electron] não foi possível abrir no navegador:', erro));
    return true;
  };

  // As DevTools (só existem fora do app empacotado) navegam por `devtools://`.
  const internoDoDev = (url: string) => !app.isPackaged && url.startsWith('devtools://');
  contents.on('will-navigate', (event, url) => {
    if (permitirNavegacao(url, raizDoApp()) || internoDoDev(url)) return;
    event.preventDefault();
    if (!abrirFora(url)) console.warn(`[electron] navegação bloqueada para origem não confiável: ${url.slice(0, 200)}`);
  });
  contents.on('will-redirect', (event, url) => {
    if (permitirNavegacao(url, raizDoApp()) || internoDoDev(url)) return;
    event.preventDefault();
    console.warn(`[electron] redirecionamento bloqueado: ${url.slice(0, 200)}`);
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (!abrirFora(url)) console.warn(`[electron] abertura de janela bloqueada: ${url.slice(0, 200)}`);
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.warn('[electron] <webview> bloqueado');
  });
  // Empacotado: DevTools nunca. `devTools: false` nas preferências de toda
  // janela já impede a abertura; isto cobre um webContents que nasça sem
  // elas (uma janela nova que alguém esqueça de montar com
  // `preferenciasWebSeguras`).
  if (app.isPackaged) {
    contents.on('devtools-opened', () => {
      contents.closeDevTools();
      console.warn('[electron] DevTools fechadas: não existem no app empacotado');
    });
  }
}

/**
 * Menu do aplicativo — a decisão (e o porquê) está em `papeisDoMenuEmpacotado`
 * (`src/electronSecurity.ts`, testada): empacotado, nenhum menu no
 * Windows/Linux e só app/editar/janela no macOS. Em desenvolvimento fica o
 * menu padrão (DevTools, recarregar).
 */
function configurarMenu(): void {
  if (!app.isPackaged) return;
  const papeis = papeisDoMenuEmpacotado(process.platform);
  Menu.setApplicationMenu(papeis ? Menu.buildFromTemplate(papeis.map((role) => ({ role }))) : null);
}

/** Instantes das recargas automáticas depois de queda do renderer (ver `decidirRecarga`). */
const recargasAposQueda: number[] = [];

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // Ver `TELA_CHEIA`. Largura/altura acima continuam valendo como tamanho
    // restaurado ao sair da tela cheia.
    fullscreen: TELA_CHEIA,
    // Sem isto o Chromium pinta BRANCO até o primeiro frame do renderer: um
    // flash claro de tela cheia em toda abertura do app, antes de qualquer
    // CSS existir. O valor acompanha `--color-bg-base` do tema escuro.
    backgroundColor: '#0f172a',
    // Piso de tamanho. Sem ele a janela podia ser arrastada até 400×300, onde
    // a grade da Home fica com uma linha e meia visível e o alvo mínimo de 5°
    // é aritmeticamente impossível. 1024×640 é o menor posto em que a Home
    // ainda entrega 3×3 dentro do mínimo; abaixo disso a grade rola, o que é
    // degradação honesta — mas travar aqui evita o layout absurdo.
    minWidth: 1024,
    minHeight: 640,
    autoHideMenuBar: true,
    // Ícone da janela e da barra de tarefas. No pacote quem manda é o ícone
    // embutido no executável pelo electron-builder; isto resolve o
    // desenvolvimento, onde a janela aparecia com o ícone padrão do Electron —
    // detalhe pequeno que, numa demonstração, é a primeira coisa que denuncia
    // um protótipo.
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      // isolamento, sandbox, sem Node, sem <webview>, DevTools só em dev —
      // `src/electronSecurity.ts` (testado).
      ...preferenciasWebSeguras(app.isPackaged),
      preload: path.join(__dirname, 'preload.cjs'),
      // No Modo Computador esta janela fica ESCONDIDA enquanto a câmera e o
      // motor continuam rodando nela. Sem isto o Chromium congela o
      // `requestAnimationFrame` de janela oculta e o olhar para de chegar à
      // sobreposição — o cursor sobre o Windows simplesmente trava.
      backgroundThrottling: false,
    },
  });
  janelaPrincipal = win;
  win.on('closed', () => { if (janelaPrincipal === win) janelaPrincipal = null; });

  // Zoom travado em 1: o Modo Computador converte px CSS do app em DIP da
  // tela, e um Ctrl+roda acidental desalinharia o cursor sobre o Windows sem
  // parecer erro de calibração.
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1);
    win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  });
  win.webContents.on('zoom-changed', () => win.webContents.setZoomFactor(1));

  // Teclado: F11 (saída do cuidador) sempre; no app empacotado, DevTools e
  // recarregar não fazem nada.
  win.webContents.on('before-input-event', (event, input) => {
    if (alternaTelaCheia(input)) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
      return;
    }
    if (app.isPackaged && atalhoBloqueadoEmProducao(input)) event.preventDefault();
  });

  // O processo da página morreu (crash do driver de vídeo, falta de memória,
  // antivírus...): registra e recarrega a página com calma, sem fechar o app.
  // O perfil de calibração está salvo em disco; o que se perde é só a tela
  // em que a pessoa estava. Quedas repetidas param de recarregar (laço) e
  // mostram um aviso ao cuidador.
  win.webContents.on('render-process-gone', (_e, detalhes) => {
    registrarNoLog('erro', '[janela] processo da página caiu:', { motivo: detalhes.reason, codigo: detalhes.exitCode });
    const decisao = decidirRecarga(detalhes.reason, recargasAposQueda, Date.now());
    if (decisao.recarregar) {
      recargasAposQueda.push(Date.now());
      setTimeout(() => { if (!win.isDestroyed()) win.webContents.reload(); }, decisao.esperaMs);
      return;
    }
    if (detalhes.reason === 'clean-exit' || win.isDestroyed()) return;
    void dialog.showMessageBox(win, {
      type: 'error',
      title: 'IrisFlow',
      message: 'O IrisFlow parou de responder várias vezes seguidas.',
      detail: 'Tente reiniciar o computador. Se continuar, envie a pasta de registros ao suporte (Configurações → Suporte).',
      buttons: ['Tentar de novo', 'Fechar o IrisFlow'],
      defaultId: 0,
    }).then(({ response }) => {
      if (win.isDestroyed()) return;
      if (response === 0) { recargasAposQueda.length = 0; win.webContents.reload(); } else app.quit();
    });
  });
  win.on('unresponsive', () => registrarNoLog('aviso', '[janela] a página não responde há alguns segundos'));
  win.on('responsive', () => registrarNoLog('info', '[janela] a página voltou a responder'));

  if (!app.isPackaged) {
    win.loadURL(URL_DE_DEV);
    win.webContents.openDevTools({ mode: 'detach' });

    // Espelha no terminal os logs do renderer que têm prefixo entre colchetes
    // ([calib], [L2CS], [accuracy]...). A assinatura de `console-message`
    // mudou no Electron recente (um objeto de evento em vez de argumentos
    // posicionais); as duas formas são aceitas. Só em dev: no app empacotado
    // nada do renderer vai para o log (pode conter texto do paciente).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (win.webContents as any).on('console-message', (...args: any[]) => {
      const message: string | undefined =
        typeof args[0]?.message === 'string' ? args[0].message
        : typeof args[2] === 'string' ? args[2]
        : undefined;
      if (message && /^\[[A-Za-z0-9 _-]+\]/.test(message)) {
        console.log(`[renderer] ${message}`);
      }
    });
  } else {
    win.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }
}

/** Traz a janela existente para a frente (segunda instância, Dock do macOS). */
function focarJanela(): void {
  const w = janelaPrincipal;
  if (!w || w.isDestroyed()) return;
  if (w.isMinimized()) w.restore();
  // No Modo Computador a janela fica escondida de propósito (a sobreposição
  // está por cima); mostrá-la aí taparia a tela do sistema.
  if (!w.isVisible() && BrowserWindow.getAllWindows().length > 1) return;
  w.show();
  w.focus();
}

if (PRIMEIRA_INSTANCIA) {
  app.on('second-instance', () => focarJanela());
  app.on('web-contents-created', (_e, contents) => endurecerWebContents(contents));

  app.whenReady().then(async () => {
    configurarMenu();

    // Corretor ortográfico do Chromium: nenhum dicionário, nenhum download.
    // `spellcheck: false` nas janelas (`preferenciasWebSeguras`) NÃO basta:
    // medido no app empacotado (net-log), o Chromium ainda baixava
    // `https://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-1.bdic` — uma
    // conexão com o Google a cada abertura, num app que promete não falar com
    // terceiros. Sem idiomas na sessão não há o que baixar. Precisa vir antes
    // da primeira janela. (No macOS o corretor é o do sistema; isto é inócuo.)
    session.defaultSession.setSpellCheckerLanguages([]);
    session.defaultSession.setSpellCheckerEnabled(false);

    // A permissão depende da origem, não só do tipo: câmera/microfone e tela
    // cheia, só para origem local. O check handler cobre os caminhos do
    // Chromium que consultam a permissão sem passar pelo fluxo de request.
    // Dispositivos (HID/USB/serial/Bluetooth) nunca.
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const tipos = (details as { mediaTypes?: string[] }).mediaTypes;
      callback(permitirPermissao(permission, webContents?.getURL(), tipos));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
      return permitirPermissao(permission, requestingOrigin);
    });
    session.defaultSession.setDevicePermissionHandler(() => false);

    // CSP como cabeçalho (servidor de dev e qualquer resposta HTTP). No build
    // empacotado, carregado via `file://`, não há cabeçalhos: a mesma política
    // vai como `<meta>` no `index.html`, injetada pelo Vite a partir do mesmo
    // `CSP` de `src/electronSecurity.ts`. Em dev vale `CSP_DEV`: o preâmbulo
    // do Fast Refresh é um script inline e a política de produção o bloquearia.
    const politica = cspComNuvem(
      app.isPackaged ? CSP : CSP_DEV,
      lerVariavelDoFrontend('VITE_SUPABASE_URL'),
      lerVariavelDoFrontend('VITE_DESKTOP_SYNC_URL'),
    );
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [politica],
        },
      });
    });

    // Monitor ligado/desligado ou resolução trocada: o tamanho físico lido
    // antes pode não valer mais.
    screen.on('display-added', esquecerTamanhosDosMonitores);
    screen.on('display-removed', esquecerTamanhosDosMonitores);
    screen.on('display-metrics-changed', esquecerTamanhosDosMonitores);

    // Modo Computador: cursor do IrisFlow sobre o sistema. A sobreposição é a
    // página `overlay.html` do mesmo build do frontend, com preload próprio.
    registrarModoComputador({
      janelaPrincipal: () => janelaPrincipal,
      preloadDaSobreposicao: path.join(__dirname, 'overlayPreload.cjs'),
      carregarSobreposicao: (janela) =>
        app.isPackaged
          ? janela.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'overlay.html'))
          : janela.loadURL(`${DEV_SERVER_URL}/overlay.html`),
    });

    // Voz clonada local (sidecar Python / executável em resources/voice-engine).
    const voz = registrarVoz({ raizDoProjeto: RAIZ_DO_PROJETO, janelaPrincipal: () => janelaPrincipal });
    registrarAtualizacao(() => janelaPrincipal);
    app.on('before-quit', () => voz.encerrar());

    createWindow();

    // macOS: clicar no ícone do Dock com o app aberto e sem janela recria a
    // janela; com janela, só a traz para a frente.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else focarJanela();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
