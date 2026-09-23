// Política de segurança do processo principal do Electron.
//
// Fica em `src/` (e não inline em `electron/main.ts`) para que a decisão —
// dada uma origem, permitir ou não — seja testável sem abrir o Electron.

/**
 * Permissões que o app legitimamente precisa:
 *   - `media`: câmera (rastreamento) e microfone (gravar a voz de referência
 *     da voz personalizada, a pedido do cuidador);
 *   - `fullscreen`: `element.requestFullscreen()` de alguma tela.
 * Todo o resto (geolocalização, notificações, MIDI, área de transferência,
 * captura de tela pelo renderer, HID/USB/serial...) é negado.
 */
const PERMISSOES_PERMITIDAS = new Set(['media', 'fullscreen']);

/**
 * Origens confiáveis: `file://` (build empacotado) e `localhost`/`127.0.0.1`
 * (servidor de dev do Vite). Nenhum host remoto — o app é 100% local.
 */
export function origemConfiavel(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === 'file:') return true;
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
    return true;
  }
  return false;
}

/**
 * Só concede o que o app precisa (`media`) e só para origem confiável. Lista
 * explícita, não `default: allow`: a lista de permissões do Chromium cresce.
 */
export function permitirPermissao(
  permission: string,
  url: string | null | undefined,
  mediaTypes?: readonly string[] | null,
): boolean {
  if (!PERMISSOES_PERMITIDAS.has(permission) || !origemConfiavel(url)) return false;
  // `media` só para câmera e microfone (o Chromium manda `mediaTypes` no
  // pedido); qualquer outro tipo que apareça no futuro é negado.
  if (permission === 'media' && mediaTypes && mediaTypes.some((t) => t !== 'video' && t !== 'audio')) return false;
  return true;
}

/** O app não navega para fora de si mesmo (um link num texto do paciente, por exemplo). */
export function permitirNavegacao(url: string | null | undefined): boolean {
  return origemConfiavel(url);
}

/**
 * Content-Security-Policy do app.
 *
 * - `'wasm-unsafe-eval'`: MediaPipe e ONNX Runtime compilam WebAssembly.
 * - `'unsafe-inline'` em `style-src`: o React usa `style={{...}}`.
 * - `connect-src` só aceita a própria origem e `localhost` — é o que torna a
 *   promessa de privacidade (nada sai do dispositivo) uma política de
 *   navegador. O `localhost` cobre o servidor de dev e o backend de
 *   demonstração das telas de chatbot/perfis. A ÚNICA exceção é a origem do
 *   Supabase do IrisFlow (login, licença, mensagens do cuidador), acrescentada
 *   por `cspComNuvem` quando `VITE_SUPABASE_URL` está configurada — e só ela:
 *   imagem, landmarks, perfil de calibração e relatório bruto continuam sem
 *   rota para fora.
 * - `blob:` em worker/media: o worker do L2CS e o `<video>` da câmera.
 *
 * No build empacotado (`file://`) não há cabeçalho HTTP; a mesma política é
 * injetada como `<meta http-equiv>` pelo Vite (ver `frontend/vite.config.ts`).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // Sem `https:`: fotos do álbum, dos perfis e a lupa são `data:`/`blob:`
  // locais (as imagens de exemplo do unsplash saíram). Uma `<img>` remota é
  // também um canal de saída (a URL carrega dados), então não há exceção.
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/**
 * Variante para o servidor de DESENVOLVIMENTO (Electron com `loadURL`).
 *
 * O `@vitejs/plugin-react` injeta no `index.html` um `<script>` INLINE (o
 * preâmbulo do Fast Refresh) e todo módulo transformado lança se ele não
 * rodou. Com `script-src 'self'` no cabeçalho, o app em dev abria em branco.
 * Só `script-src` muda, e só fora do build empacotado — a política de
 * produção continua sendo `CSP`.
 */
export const CSP_DEV = CSP.replace(
  "script-src 'self' 'wasm-unsafe-eval'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'",
);

/**
 * Origem da nuvem do IrisFlow (projeto Supabase), normalizada, ou `null` se a
 * URL não servir. Só `https:` — a chave anônima e o token da sessão viajam
 * nessa conexão.
 */
export function origemDaNuvem(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !u.hostname) return null;
  return u.origin;
}

/**
 * CSP com as origens da nuvem liberadas em `connect-src` (HTTPS para REST/RPC
 * e Edge Functions, WSS para o realtime das mensagens do cuidador). Aceita
 * mais de uma URL (Supabase e, se houver, a Edge Function hospedada fora).
 * Qualquer outra diretiva fica intacta; sem URL válida devolve a política
 * original.
 */
export function cspComNuvem(csp: string, ...urls: Array<string | null | undefined>): string {
  const origens = [...new Set(urls.map(origemDaNuvem).filter((o): o is string => o !== null))];
  if (origens.length === 0) return csp;
  const extras = origens.flatMap((o) => [o, o.replace(/^https:/, 'wss:')]).join(' ');
  return csp
    .split('; ')
    .map((d) => (d.startsWith('connect-src ') ? `${d} ${extras}` : d))
    .join('; ');
}

// ===========================================================================
// Janelas: preferências, links externos, atalhos e recuperação de queda.
// Tudo aqui é decisão pura; `electron/main.ts` só aplica.
// ===========================================================================

/**
 * `webPreferences` de TODA janela do app (principal e sobreposição).
 *
 * O que já é padrão no Electron 43 vai explícito de propósito: um padrão que
 * muda numa versão futura não pode abrir o app em silêncio, e o teste trava
 * cada linha. (`enableRemoteModule` não existe mais desde o Electron 14 — o
 * módulo `remote` saiu do núcleo e não está nas dependências.)
 *
 * `spellcheck: false` não é só gosto: com o corretor ligado, o Chromium baixa
 * dicionários de um servidor do Google no Windows/Linux — uma conexão de
 * rede que ninguém pediu num app que promete não falar com terceiros. Só isto
 * não basta: a SESSÃO também precisa ficar sem idiomas de corretor
 * (`setSpellCheckerLanguages([])` em `electron/main.ts`), senão o dicionário
 * é baixado mesmo assim (medido com net-log no app empacotado).
 */
export const PREFERENCIAS_WEB_SEGURAS = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
  spellcheck: false,
} as const;

/** Preferências seguras + DevTools só fora do app empacotado. */
export function preferenciasWebSeguras(empacotado: boolean): typeof PREFERENCIAS_WEB_SEGURAS & { devTools: boolean } {
  return { ...PREFERENCIAS_WEB_SEGURAS, devTools: !empacotado };
}

/**
 * Sites que um link do app pode abrir NO NAVEGADOR DO SISTEMA (nunca dentro
 * do app). Domínio e subdomínios. Fixos só o site oficial (Cloudflare Pages)
 * e o GitHub (página dos instaladores; o repositório de releases é trocável
 * no build, por isso a lista não carrega nome de repositório).
 *
 * O domínio próprio, quando existir, NÃO entra aqui: vem de `VITE_SITE_URL`
 * no build do instalador (`extras` em `permitirAberturaExterna`, lido por
 * `electron/main.ts`). Um domínio cravado na lista e ainda não registrado
 * mandaria o cuidador para o site de um estranho.
 */
export const HOSTS_EXTERNOS_PERMITIDOS = [
  'irisflow.pages.dev',
  'github.com',
] as const;

/**
 * Ajustes de privacidade do sistema que a tela de permissão da câmera pode
 * abrir (Windows e macOS). Correspondência EXATA — `ms-settings:` genérico
 * abriria qualquer painel do Windows.
 */
export const URIS_DE_SISTEMA_PERMITIDAS = [
  'ms-settings:privacy-webcam',
  'ms-settings:privacy-microphone',
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
] as const;

/** Host da URL, se ela for `https:`; `null` caso contrário. */
function hostHttps(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Decide se `url` pode ser entregue a `shell.openExternal`.
 *
 * `extras` são hosts adicionais conhecidos em tempo de build (o
 * `VITE_SITE_URL` do instalador, por exemplo). Nunca `http:`, `file:`,
 * `javascript:`, nem host que só CONTÉM um nome permitido.
 */
export function permitirAberturaExterna(url: string | null | undefined, extras: readonly string[] = []): boolean {
  if (!url || url.length > 2048) return false;
  if ((URIS_DE_SISTEMA_PERMITIDAS as readonly string[]).includes(url)) return true;
  const host = hostHttps(url);
  if (!host) return false;
  const permitidos = [...HOSTS_EXTERNOS_PERMITIDOS, ...extras.map((e) => e.toLowerCase()).filter(Boolean)];
  return permitidos.some((p) => host === p || host.endsWith(`.${p}`));
}

/** Host de uma URL de site configurada (para `extras`), ou `null`. */
export function hostDoSite(url: string | null | undefined): string | null {
  return url ? hostHttps(url.trim()) : null;
}

/** Recorte de `Electron.Input` que as decisões de teclado usam. */
export interface TeclaPressionada {
  type: string;
  key: string;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * Atalhos que NÃO podem agir no app empacotado: DevTools (F12,
 * Ctrl/Cmd+Shift+I/J/C, Cmd+Alt+I) e recarregar (F5, Ctrl/Cmd+R,
 * Ctrl/Cmd+Shift+R). Recarregar no meio de uma frase apaga a frase e a
 * calibração da sessão — e um cuidador aperta F5 por reflexo.
 */
export function atalhoBloqueadoEmProducao(t: TeclaPressionada): boolean {
  if (t.type !== 'keyDown') return false;
  const k = t.key.length === 1 ? t.key.toLowerCase() : t.key;
  const mod = !!(t.control || t.meta);
  if (k === 'F12' || k === 'F5') return true;
  if (mod && k === 'r') return true;
  if (mod && t.shift && (k === 'i' || k === 'j' || k === 'c')) return true;
  if (t.meta && t.alt && (k === 'i' || k === 'j')) return true;
  return false;
}

/**
 * A saída da tela cheia do CUIDADOR: F11 (Windows/Linux) ou Ctrl+Cmd+F
 * (macOS). Esc fica com a página — ele já fecha os diálogos de confirmação,
 * e roubá-lo tiraria a tela cheia a cada diálogo fechado.
 */
export function alternaTelaCheia(t: TeclaPressionada): boolean {
  if (t.type !== 'keyDown') return false;
  if (t.key === 'F11' && !t.control && !t.meta && !t.alt) return true;
  return !!(t.control && t.meta && (t.key === 'f' || t.key === 'F'));
}

/**
 * Argumentos de linha de comando que abririam uma porta de depuração:
 *
 *   - `--inspect`, `--inspect-brk`, `--inspect-port`, `--inspect-brk-node`...:
 *     inspetor do Node no processo principal. O fuse
 *     `EnableNodeCliInspectArguments` (package.json → `build.electronFuses`)
 *     já faz o binário ignorá-los; esta checagem é a segunda barreira;
 *   - `--remote-debugging-port` / `--remote-debugging-pipe`: protocolo do
 *     DevTools do CHROMIUM, que nenhum fuse desliga. Com ele, qualquer
 *     programa do computador lê e comanda as páginas do app — inclusive o
 *     token da sessão já decifrado.
 *
 * O Chromium aceita o switch com `--`, `-` e (no Windows) `/`, sem diferenciar
 * maiúsculas no Windows: as três formas contam.
 */
const ARGUMENTO_DE_DEPURACAO = /^(?:--?|\/)(?:inspect(?:-[a-z-]+)?|remote-debugging-(?:port|pipe))(?:=.*)?$/i;

/** Nomes dos mesmos switches, para `app.commandLine.hasSwitch` no main. */
export const SWITCHES_DE_DEPURACAO = [
  'inspect',
  'inspect-brk',
  'inspect-brk-node',
  'inspect-port',
  'remote-debugging-port',
  'remote-debugging-pipe',
] as const;

/**
 * O primeiro argumento de depuração em `argv`, ou `null`. O app EMPACOTADO
 * encerra quando acha um (`electron/main.ts`); em desenvolvimento eles são a
 * ferramenta de trabalho e ninguém olha para isto.
 */
export function argumentoDeDepuracao(argv: readonly string[]): string | null {
  for (const a of argv) {
    if (typeof a === 'string' && ARGUMENTO_DE_DEPURACAO.test(a.trim())) return a;
  }
  return null;
}

/** Papel de menu do Electron que o app empacotado pode ter. */
export type PapelDoMenu = 'appMenu' | 'editMenu' | 'windowMenu';

/**
 * Menu do aplicativo EMPACOTADO (em desenvolvimento fica o menu padrão, com
 * DevTools e recarregar).
 *
 *   - Windows e Linux: `null` = nenhum menu. O padrão do Electron traz
 *     Recarregar, DevTools e Zoom — três formas de estragar uma sessão sem
 *     querer, e a porta para o código do app.
 *   - macOS: um menu mínimo é obrigatório. Sem `editMenu`, Cmd+C/Cmd+V param
 *     de funcionar nos campos de texto (login); sem `appMenu`, Cmd+Q não fecha.
 *     `windowMenu` só tem minimizar (Cmd+M), zoom e trazer para a frente.
 *     Nunca `viewMenu` (recarregar, forçar recarga, DevTools, zoom).
 */
export function papeisDoMenuEmpacotado(plataforma: string): readonly PapelDoMenu[] | null {
  return plataforma === 'darwin' ? ['appMenu', 'editMenu', 'windowMenu'] : null;
}

/** Janela da política de recarga após queda do renderer. */
export const RECARGA_JANELA_MS = 10 * 60_000;
export const RECARGA_MAXIMO = 3;

/**
 * Depois que o processo da página morre (`render-process-gone`): recarregar?
 *
 *   - `clean-exit` → não (foi fechamento normal);
 *   - qualquer outro motivo (crash, OOM, morto pelo SO, falha de
 *     inicialização) → sim, até `RECARGA_MAXIMO` vezes em
 *     `RECARGA_JANELA_MS`. Passou disso, o problema não é transitório:
 *     recarregar em laço seria uma tela piscando para sempre — o main mostra
 *     um aviso em vez disso.
 *
 * `historico` são os instantes (ms) das recargas anteriores.
 */
export function decidirRecarga(motivo: string, historico: readonly number[], agora: number): { recarregar: boolean; esperaMs: number } {
  if (motivo === 'clean-exit') return { recarregar: false, esperaMs: 0 };
  const recentes = historico.filter((t) => agora - t < RECARGA_JANELA_MS);
  if (recentes.length >= RECARGA_MAXIMO) return { recarregar: false, esperaMs: 0 };
  // Espera cresce um pouco a cada queda: dá tempo de a GPU/driver voltarem.
  return { recarregar: true, esperaMs: 1000 * (recentes.length + 1) };
}
