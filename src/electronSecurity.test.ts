import { describe, it, expect } from 'vitest';
import {
  origemConfiavel, permitirPermissao, permitirNavegacao, CSP, CSP_DEV, cspComNuvem, origemDaNuvem,
  PREFERENCIAS_WEB_SEGURAS, preferenciasWebSeguras, permitirAberturaExterna, hostDoSite,
  atalhoBloqueadoEmProducao, alternaTelaCheia, decidirRecarga, RECARGA_JANELA_MS, RECARGA_MAXIMO,
  HOSTS_EXTERNOS_PERMITIDOS, argumentoDeDepuracao, SWITCHES_DE_DEPURACAO, papeisDoMenuEmpacotado,
} from './electronSecurity';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

/** Todos os .ts de `electron/` (processo principal e preloads). */
function fontesDoElectron(): string[] {
  const arquivos: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (nome.endsWith('.ts')) arquivos.push(caminho);
    }
  };
  andar(resolve(RAIZ, 'electron'));
  return arquivos;
}

// A decisão de segurança do Electron é testável sem abrir o Electron.

describe('só origem local é confiável', () => {
  it('file:// é confiável — é o build empacotado', () => {
    expect(origemConfiavel('file:///C:/app/frontend/dist/index.html')).toBe(true);
  });

  it('localhost é confiável — é o servidor de dev', () => {
    expect(origemConfiavel('http://localhost:5173/')).toBe(true);
    expect(origemConfiavel('http://127.0.0.1:5173/index.html')).toBe(true);
  });

  it('host remoto NÃO é confiável', () => {
    expect(origemConfiavel('https://exemplo.com/')).toBe(false);
    expect(origemConfiavel('http://exemplo.com/')).toBe(false);
  });

  it('um host que apenas CONTÉM "localhost" não passa', () => {
    // Defesa contra checagem por substring, que é o erro clássico aqui.
    expect(origemConfiavel('https://localhost.exemplo.com/')).toBe(false);
    expect(origemConfiavel('https://evil-localhost/')).toBe(false);
  });

  it('URL inválida ou ausente não é confiável', () => {
    expect(origemConfiavel(null)).toBe(false);
    expect(origemConfiavel(undefined)).toBe(false);
    expect(origemConfiavel('')).toBe(false);
    expect(origemConfiavel('nao-e-url')).toBe(false);
  });

  it('outros protocolos não passam', () => {
    expect(origemConfiavel('data:text/html,<h1>x</h1>')).toBe(false);
    expect(origemConfiavel('javascript:alert(1)')).toBe(false);
    expect(origemConfiavel('ftp://exemplo.com/')).toBe(false);
  });
});

describe('a permissão depende da origem, não só do tipo', () => {
  it('media de origem local é concedida', () => {
    expect(permitirPermissao('media', 'file:///C:/app/index.html')).toBe(true);
    expect(permitirPermissao('media', 'http://localhost:5173/')).toBe(true);
  });

  it('media de origem REMOTA é negada', () => {
    expect(permitirPermissao('media', 'https://exemplo.com/')).toBe(false);
  });

  it('permissões que o app não precisa são negadas, mesmo local', () => {
    // Lista de permissão explícita, não `default: allow`. A lista do Chromium
    // cresce, e um default permissivo envelheceria mal.
    for (const p of ['geolocation', 'notifications', 'midi', 'clipboard-read', 'display-capture']) {
      expect(permitirPermissao(p, 'file:///C:/app/index.html'), p).toBe(false);
    }
  });

  it('origem ausente nega tudo', () => {
    expect(permitirPermissao('media', null)).toBe(false);
  });
});

describe('navegação para fora é bloqueada', () => {
  it('navegar para o próprio app é permitido', () => {
    expect(permitirNavegacao('file:///C:/app/index.html')).toBe(true);
    expect(permitirNavegacao('http://localhost:5173/menu')).toBe(true);
  });

  it('navegar para fora é bloqueado', () => {
    // Um link externo — num texto que o paciente compôs, por exemplo — não
    // pode substituir a aplicação inteira por uma página remota.
    expect(permitirNavegacao('https://exemplo.com/')).toBe(false);
  });
});

describe('a CSP fecha a promessa de privacidade', () => {
  it('connect-src só aceita a própria origem e localhost', () => {
    // Nenhuma imagem, landmark ou perfil sai do dispositivo.
    const connect = CSP.split('; ').find((d) => d.startsWith('connect-src'))!;
    expect(connect).toContain("'self'");
    expect(connect).not.toMatch(/https?:\/\/(?!localhost|127\.0\.0\.1)/);
  });

  it('permite WASM — MediaPipe e ONNX Runtime dependem disso', () => {
    expect(CSP).toContain("'wasm-unsafe-eval'");
  });

  it('permite estilos inline — o projeto usa style={{...}} em toda parte', () => {
    expect(CSP).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('permite blob: para worker e media', () => {
    // O worker do L2CS e o `<video>` da câmera precisam.
    expect(CSP).toContain("worker-src 'self' blob:");
    expect(CSP).toContain("media-src 'self' blob:");
  });

  it('imagens só locais — uma <img> remota também é canal de saída', () => {
    const img = CSP.split('; ').find((d) => d.startsWith('img-src'))!;
    expect(img).toBe("img-src 'self' data: blob:");
  });

  it('bloqueia object, frame e form-action', () => {
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toContain("frame-src 'none'");
    expect(CSP).toContain("form-action 'none'");
  });

  it('NÃO contém unsafe-eval para script', () => {
    // `wasm-unsafe-eval` é específico e necessário; `unsafe-eval` genérico
    // abriria `eval()` e `new Function()`.
    expect(CSP).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it('produção não aceita script inline; a variante de dev aceita só isso a mais', () => {
    // O preâmbulo do Fast Refresh do Vite é inline: sem esta exceção o
    // `electron:dev` abre em branco. Fora de `script-src` as duas são iguais.
    expect(CSP).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(CSP_DEV).toMatch(/script-src[^;]*'unsafe-inline'/);
    const semScript = (p: string) => p.split('; ').filter((d) => !d.startsWith('script-src'));
    expect(semScript(CSP_DEV)).toEqual(semScript(CSP));
    expect(CSP_DEV).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });
});

describe('CSP com a origem da nuvem', () => {
  it('sem URL a política é a original', () => {
    expect(cspComNuvem(CSP, undefined)).toBe(CSP);
    expect(cspComNuvem(CSP, '')).toBe(CSP);
    expect(cspComNuvem(CSP, 'nao-e-url')).toBe(CSP);
  });

  it('só https entra; http e outros protocolos são recusados', () => {
    expect(origemDaNuvem('http://abc.supabase.co')).toBeNull();
    expect(origemDaNuvem('ftp://abc.supabase.co')).toBeNull();
    expect(origemDaNuvem('https://abc.supabase.co/rest/v1')).toBe('https://abc.supabase.co');
  });

  it('libera REST (https) e realtime (wss) SÓ em connect-src', () => {
    const csp = cspComNuvem(CSP, 'https://abc.supabase.co');
    const diretivas = Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d]));
    expect(diretivas['connect-src']).toContain('https://abc.supabase.co');
    expect(diretivas['connect-src']).toContain('wss://abc.supabase.co');
    // nenhuma outra diretiva ganhou a origem — script-src continua só local
    expect(diretivas['script-src']).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(diretivas['default-src']).toBe("default-src 'self'");
    expect(csp.split('supabase.co').length - 1).toBe(2);
  });

  it('a origem remota continua NÃO sendo destino de navegação', () => {
    // CSP libera fetch/websocket; a janela em si nunca navega para lá.
    expect(permitirNavegacao('https://abc.supabase.co/')).toBe(false);
  });
});

describe('permissões: câmera, microfone e tela cheia — e só', () => {
  it('fullscreen de origem local é concedida; remota não', () => {
    expect(permitirPermissao('fullscreen', 'file:///C:/app/index.html')).toBe(true);
    expect(permitirPermissao('fullscreen', 'https://exemplo.com/')).toBe(false);
  });

  it('media com vídeo/áudio passa; outro tipo de mídia é negado', () => {
    expect(permitirPermissao('media', 'file:///C:/app/index.html', ['video'])).toBe(true);
    expect(permitirPermissao('media', 'file:///C:/app/index.html', ['video', 'audio'])).toBe(true);
    expect(permitirPermissao('media', 'file:///C:/app/index.html', ['video', 'screen'])).toBe(false);
  });

  it('dispositivos e APIs sensíveis continuam negados', () => {
    for (const p of ['hid', 'usb', 'serial', 'bluetooth', 'openExternal', 'pointerLock', 'idle-detection', 'clipboard-sanitized-write']) {
      expect(permitirPermissao(p, 'file:///C:/app/index.html'), p).toBe(false);
    }
  });
});

describe('webPreferences de toda janela', () => {
  it('nenhum dicionário de ortografia é baixado (a sessão fica sem idiomas antes da primeira janela)', () => {
    // Com só `spellcheck: false` nas janelas, o Chromium ainda buscava
    // `en-us-10-1.bdic` em redirector.gvt1.com a cada abertura (net-log do
    // app empacotado). Sem idiomas na sessão, não há download.
    const main = fonte('electron/main.ts');
    const semIdiomas = main.indexOf('session.defaultSession.setSpellCheckerLanguages([])');
    expect(semIdiomas).toBeGreaterThan(-1);
    expect(semIdiomas).toBeLessThan(main.indexOf('createWindow();', semIdiomas));
    expect(PREFERENCIAS_WEB_SEGURAS.spellcheck).toBe(false);
  });

  it('isolamento, sandbox e nada de Node no renderer', () => {
    expect(PREFERENCIAS_WEB_SEGURAS.contextIsolation).toBe(true);
    expect(PREFERENCIAS_WEB_SEGURAS.nodeIntegration).toBe(false);
    expect(PREFERENCIAS_WEB_SEGURAS.nodeIntegrationInWorker).toBe(false);
    expect(PREFERENCIAS_WEB_SEGURAS.nodeIntegrationInSubFrames).toBe(false);
    expect(PREFERENCIAS_WEB_SEGURAS.sandbox).toBe(true);
    expect(PREFERENCIAS_WEB_SEGURAS.webviewTag).toBe(false);
    expect(PREFERENCIAS_WEB_SEGURAS.webSecurity).toBe(true);
    expect(PREFERENCIAS_WEB_SEGURAS.allowRunningInsecureContent).toBe(false);
    expect(PREFERENCIAS_WEB_SEGURAS.spellcheck).toBe(false);
  });

  it('DevTools só fora do app empacotado', () => {
    expect(preferenciasWebSeguras(true).devTools).toBe(false);
    expect(preferenciasWebSeguras(false).devTools).toBe(true);
  });

  it('a janela principal E a sobreposição usam as preferências seguras', () => {
    // Um `new BrowserWindow` que monte as próprias webPreferences à mão é o
    // jeito clássico de uma janela nova nascer sem sandbox.
    expect(fonte('electron/main.ts')).toMatch(/\.\.\.preferenciasWebSeguras\(app\.isPackaged\)/);
    expect(fonte('electron/computador/sessao.ts')).toMatch(/\.\.\.preferenciasWebSeguras\(app\.isPackaged\)/);
  });

  it('TODA `new BrowserWindow` do processo principal nasce com as preferências seguras (DevTools só em dev)', () => {
    // Uma janela nova (de diagnóstico, de aviso...) acrescentada sem lembrar
    // disto teria DevTools no app instalado.
    let janelas = 0;
    for (const arquivo of fontesDoElectron()) {
      const src = readFileSync(arquivo, 'utf8');
      const criacoes = src.split('new BrowserWindow(').length - 1;
      if (criacoes === 0) continue;
      janelas += criacoes;
      const seguras = src.split('...preferenciasWebSeguras(app.isPackaged)').length - 1;
      expect(seguras, `${arquivo}: ${criacoes} janela(s), ${seguras} com preferenciasWebSeguras`).toBeGreaterThanOrEqual(criacoes);
      expect(src, arquivo).not.toMatch(/devTools:\s*true/);
    }
    expect(janelas).toBeGreaterThanOrEqual(2);
  });

  it('DevTools só abrem no desenvolvimento, e são fechadas se algo as abrir no app empacotado', () => {
    const main = fonte('electron/main.ts');
    expect(main).toMatch(/if \(!app\.isPackaged\) \{\s*win\.loadURL\(URL_DE_DEV\);\s*win\.webContents\.openDevTools/);
    expect(main).toMatch(/if \(app\.isPackaged\) \{\s*contents\.on\('devtools-opened'[\s\S]{0,80}contents\.closeDevTools\(\)/);
  });

  it('o main endurece TODO webContents criado (navegação, janelas, webview)', () => {
    const main = fonte('electron/main.ts');
    expect(main).toContain("app.on('web-contents-created'");
    expect(main).toContain("'will-navigate'");
    expect(main).toContain("'will-redirect'");
    expect(main).toContain("'will-attach-webview'");
    expect(main).toContain('setWindowOpenHandler');
    expect(main).toContain('Menu.setApplicationMenu');
    expect(main).toContain('requestSingleInstanceLock');
    expect(main).toMatch(/setAppUserModelId\(ID_DO_APP\)/);
  });

  it('o AppUserModelId do Windows é o appId do electron-builder', () => {
    const appId = JSON.parse(fonte('package.json')).build.appId;
    expect(fonte('electron/main.ts')).toContain(`const ID_DO_APP = '${appId}'`);
  });
});

describe('links externos: só no navegador do sistema, só para a lista', () => {
  it('site oficial (Cloudflare Pages) e GitHub abrem (com subdomínio)', () => {
    expect(permitirAberturaExterna('https://irisflow-communicator.pages.dev/beta')).toBe(true);
    expect(permitirAberturaExterna('https://abc123.irisflow-communicator.pages.dev/')).toBe(true);
    // O endereço anterior continua aceito: ele redireciona para o atual.
    expect(permitirAberturaExterna('https://irisflow.pages.dev/beta')).toBe(true);
    expect(permitirAberturaExterna('https://irisflow.pages.dev/conta')).toBe(true);
    expect(permitirAberturaExterna('https://abc123.irisflow.pages.dev/')).toBe(true);
    // Qualquer repositório: o de releases é trocável no build (IRISFLOW_RELEASES_REPO).
    expect(permitirAberturaExterna('https://github.com/dono/repositorio-de-releases/releases')).toBe(true);
  });

  it('a lista fixa não carrega domínio próprio nem nome de repositório', () => {
    // Domínio próprio entra por VITE_SITE_URL (teste abaixo); repositório não
    // entra em lista nenhuma — o host github.com basta.
    expect([...HOSTS_EXTERNOS_PERMITIDOS].sort()).toEqual([
      'github.com',
      'irisflow-communicator.pages.dev',
      'irisflow.pages.dev',
    ]);
  });

  it('domínio próprio só abre quando o build o configura (VITE_SITE_URL)', () => {
    expect(permitirAberturaExterna('https://irisflow.com.br/conta')).toBe(false);
    expect(permitirAberturaExterna('https://www.irisflow.tech/')).toBe(false);
    const extras = [hostDoSite('https://irisflow.com.br')!];
    expect(permitirAberturaExterna('https://irisflow.com.br/conta', extras)).toBe(true);
    expect(permitirAberturaExterna('https://www.irisflow.com.br/', extras)).toBe(true);
  });

  it('http, outros protocolos e hosts parecidos são recusados', () => {
    expect(permitirAberturaExterna('http://irisflow.pages.dev/')).toBe(false);
    expect(permitirAberturaExterna('https://irisflow.pages.dev.evil.com/')).toBe(false);
    expect(permitirAberturaExterna('https://evilirisflow.pages.dev/')).toBe(false);
    expect(permitirAberturaExterna('https://user:pw@irisflow.pages.dev/')).toBe(false);
    expect(permitirAberturaExterna('https://github.com.evil.com/')).toBe(false);
    expect(permitirAberturaExterna('file:///C:/Windows/System32/cmd.exe')).toBe(false);
    expect(permitirAberturaExterna('javascript:alert(1)')).toBe(false);
    expect(permitirAberturaExterna('https://exemplo.com/')).toBe(false);
    expect(permitirAberturaExterna(null)).toBe(false);
  });

  it('ajustes de privacidade da câmera/microfone: correspondência exata', () => {
    expect(permitirAberturaExterna('ms-settings:privacy-webcam')).toBe(true);
    expect(permitirAberturaExterna('ms-settings:privacy-microphone')).toBe(true);
    expect(permitirAberturaExterna('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera')).toBe(true);
    expect(permitirAberturaExterna('ms-settings:windowsupdate')).toBe(false);
    expect(permitirAberturaExterna('ms-settings:privacy-webcam&x')).toBe(false);
  });

  it('host extra (VITE_SITE_URL do build) entra na lista', () => {
    expect(permitirAberturaExterna('https://meusite.org/x')).toBe(false);
    expect(permitirAberturaExterna('https://meusite.org/x', [hostDoSite('https://meusite.org')!])).toBe(true);
    expect(hostDoSite('http://inseguro.org')).toBeNull();
  });
});

describe('atalhos do app empacotado', () => {
  const tecla = (key: string, mods: Partial<{ control: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}) =>
    ({ type: 'keyDown', key, ...mods });

  it('DevTools e recarregar ficam bloqueados', () => {
    expect(atalhoBloqueadoEmProducao(tecla('F12'))).toBe(true);
    expect(atalhoBloqueadoEmProducao(tecla('I', { control: true, shift: true }))).toBe(true);
    expect(atalhoBloqueadoEmProducao(tecla('j', { control: true, shift: true }))).toBe(true);
    expect(atalhoBloqueadoEmProducao(tecla('i', { meta: true, alt: true }))).toBe(true);
    expect(atalhoBloqueadoEmProducao(tecla('F5'))).toBe(true);
    expect(atalhoBloqueadoEmProducao(tecla('r', { control: true }))).toBe(true);
    expect(atalhoBloqueadoEmProducao(tecla('R', { meta: true, shift: true }))).toBe(true);
  });

  it('copiar, colar, digitar e Esc passam', () => {
    expect(atalhoBloqueadoEmProducao(tecla('c', { control: true }))).toBe(false);
    expect(atalhoBloqueadoEmProducao(tecla('v', { meta: true }))).toBe(false);
    expect(atalhoBloqueadoEmProducao(tecla('r'))).toBe(false);
    expect(atalhoBloqueadoEmProducao(tecla('Escape'))).toBe(false);
    expect(atalhoBloqueadoEmProducao({ type: 'keyUp', key: 'F12' })).toBe(false);
  });

  it('F11 e Ctrl+Cmd+F alternam a tela cheia; Esc não', () => {
    expect(alternaTelaCheia(tecla('F11'))).toBe(true);
    expect(alternaTelaCheia(tecla('f', { control: true, meta: true }))).toBe(true);
    expect(alternaTelaCheia(tecla('Escape'))).toBe(false);
    expect(alternaTelaCheia(tecla('F11', { control: true }))).toBe(false);
  });
});

describe('porta de depuração na linha de comando', () => {
  const exe = 'C:\\Program Files\\IrisFlow Communicator\\IrisFlow Communicator.exe';

  it('inspetor do Node e protocolo do DevTools do Chromium são reconhecidos', () => {
    for (const a of [
      '--inspect', '--inspect=9229', '--inspect-brk', '--inspect-brk=0.0.0.0:9229', '--inspect-port=9230',
      '--inspect-brk-node', '--remote-debugging-port=9222', '--remote-debugging-pipe',
    ]) {
      expect(argumentoDeDepuracao([exe, a]), a).toBe(a);
    }
  });

  it('as grafias que o Chromium também aceita: um hífen, barra (Windows) e maiúsculas', () => {
    expect(argumentoDeDepuracao([exe, '-remote-debugging-port=9222'])).not.toBeNull();
    expect(argumentoDeDepuracao([exe, '/remote-debugging-port=9222'])).not.toBeNull();
    expect(argumentoDeDepuracao([exe, '--REMOTE-DEBUGGING-PORT=9222'])).not.toBeNull();
    expect(argumentoDeDepuracao([exe, '--Inspect'])).not.toBeNull();
  });

  it('uso normal passa: caminho do executável, argumentos do Chromium comuns, arquivos', () => {
    expect(argumentoDeDepuracao([exe])).toBeNull();
    expect(argumentoDeDepuracao(['/opt/IrisFlow Communicator/irisflow-communicator', '--no-sandbox'])).toBeNull();
    expect(argumentoDeDepuracao([exe, '--enable-logging', '--lang=pt-BR', '-psn_0_12345'])).toBeNull();
    expect(argumentoDeDepuracao([exe, '--inspection-report', 'C:\\inspect\\nota.txt'])).toBeNull();
    expect(argumentoDeDepuracao([])).toBeNull();
  });

  it('o main encerra o app EMPACOTADO que abrir com um deles — antes de subir qualquer janela', () => {
    const main = fonte('electron/main.ts');
    expect(main).toMatch(/const ARGUMENTO_DE_DEPURACAO = app\.isPackaged\s*\?\s*argumentoDeDepuracao\(process\.argv\)/);
    expect(main).toMatch(/SWITCHES_DE_DEPURACAO\.find\(\(s\) => app\.commandLine\.hasSwitch\(s\)\)/);
    expect(main).toMatch(/if \(ARGUMENTO_DE_DEPURACAO\) \{[\s\S]{0,200}app\.exit\(1\)/);
    expect(main).toMatch(/const PRIMEIRA_INSTANCIA = !ARGUMENTO_DE_DEPURACAO && app\.requestSingleInstanceLock\(\)/);
    // A checagem vem antes de tudo o que abre janela ou IPC.
    expect(main.indexOf('if (ARGUMENTO_DE_DEPURACAO)')).toBeLessThan(main.indexOf('iniciarDiagnostico('));
    expect(SWITCHES_DE_DEPURACAO).toEqual(expect.arrayContaining(['inspect', 'remote-debugging-port', 'remote-debugging-pipe']));
  });
});

describe('menu do app empacotado', () => {
  it('Windows e Linux: nenhum menu (o padrão traz Recarregar e DevTools)', () => {
    expect(papeisDoMenuEmpacotado('win32')).toBeNull();
    expect(papeisDoMenuEmpacotado('linux')).toBeNull();
  });

  it('macOS: só app (sair) e Editar (Cmd+C/Cmd+V nos campos), mais Janela; nunca Visualizar', () => {
    const papeis = papeisDoMenuEmpacotado('darwin')!;
    expect(papeis).toContain('appMenu');
    expect(papeis).toContain('editMenu');
    for (const proibido of ['viewMenu', 'toggleDevTools', 'reload', 'forceReload', 'zoomIn', 'resetZoom']) {
      expect(papeis as readonly string[]).not.toContain(proibido);
    }
  });

  it('o main aplica exatamente isso, e só no app empacotado', () => {
    const main = fonte('electron/main.ts');
    expect(main).toMatch(/if \(!app\.isPackaged\) return;\s*const papeis = papeisDoMenuEmpacotado\(process\.platform\)/);
    expect(main).toMatch(/Menu\.setApplicationMenu\(papeis \? Menu\.buildFromTemplate\(papeis\.map\(\(role\) => \(\{ role \}\)\)\) : null\)/);
  });
});

describe('o instalador leva o app, não o código-fonte', () => {
  const pkg = () => JSON.parse(fonte('package.json'));

  it('nenhum source map entra no pacote (segunda barreira no electron-builder)', () => {
    expect(pkg().build.files).toContain('!**/*.map');
  });

  it('o processo principal sai minificado, sem comentários e sem source map; o dev mantém o map', () => {
    const build = fonte('electron/build.mjs');
    expect(build).toMatch(/sourcemap: !producao/);
    expect(build).toMatch(/minify: producao/);
    expect(build).toMatch(/legalComments: producao \? 'none'/);
    expect(build).toMatch(/opcoes\(\{ producao: true \}\)/);
    expect(build).toMatch(/context\(opcoes\(\{ producao: false \}\)\)/);
    expect(build).not.toMatch(/sourcemap: true/);
  });

  it('o renderer (Vite) não gera source map no build, a não ser por pedido explícito', () => {
    const vite = fonte('frontend/vite.config.ts');
    expect(vite).toMatch(/sourcemap: process\.env\.IRISFLOW_SOURCEMAP === '1'/);
    expect(vite).not.toMatch(/sourcemap: true/);
    // Minificação padrão (Oxc) — desligá-la traria os comentários de volta.
    expect(vite).not.toMatch(/minify:\s*false/);
  });

  it('fuses: sem virar Node, sem NODE_OPTIONS, sem --inspect, só o app.asar', () => {
    const b = pkg().build;
    expect(b.asar).not.toBe(false);
    expect(b.electronFuses).toMatchObject({
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      onlyLoadAppFromAsar: true,
    });
    // O renderer é carregado por file:// (loadFile): tirar os privilégios
    // extras do file:// quebraria o app. Fica de fora até migrar para um
    // protocolo próprio.
    expect(b.electronFuses.grantFileProtocolExtraPrivileges).toBeUndefined();
    expect(fonte('electron/main.ts')).toContain("loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'))");
  });
});

describe('recarga depois de o renderer cair', () => {
  it('fechamento limpo não recarrega', () => {
    expect(decidirRecarga('clean-exit', [], 0).recarregar).toBe(false);
  });

  it('crash e OOM recarregam, com espera crescente', () => {
    expect(decidirRecarga('crashed', [], 1e9)).toEqual({ recarregar: true, esperaMs: 1000 });
    expect(decidirRecarga('oom', [1e9 - 1000], 1e9)).toEqual({ recarregar: true, esperaMs: 2000 });
  });

  it('para de recarregar depois do limite na janela — nada de tela piscando em laço', () => {
    const agora = 1e9;
    const hist = Array.from({ length: RECARGA_MAXIMO }, (_, i) => agora - i * 1000);
    expect(decidirRecarga('crashed', hist, agora).recarregar).toBe(false);
    // Quedas antigas (fora da janela) não contam.
    expect(decidirRecarga('crashed', hist.map((t) => t - RECARGA_JANELA_MS), agora).recarregar).toBe(true);
  });
});
