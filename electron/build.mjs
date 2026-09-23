import { build as esbuildBuild, context } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Variáveis do frontend que o processo main também usa no app EMPACOTADO
 * (onde não há `frontend/.env*` para ler em tempo de execução):
 *   VITE_SUPABASE_URL / VITE_DESKTOP_SYNC_URL → CSP de cabeçalho igual à <meta>;
 *   VITE_SITE_URL → links para o site abrem no navegador do sistema.
 * Mesma precedência do Vite no build de produção (`.env` < `.env.local` <
 * `.env.production` < `.env.production.local` < ambiente do processo). São
 * valores PÚBLICOS (já vão no bundle do frontend) — nenhum segredo entra aqui.
 */
const CHAVES_DO_FRONTEND = ['VITE_SUPABASE_URL', 'VITE_DESKTOP_SYNC_URL', 'VITE_SITE_URL'];
function lerEnvDoFrontend() {
  const out = {};
  for (const nome of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    let texto = '';
    try { texto = fs.readFileSync(path.join(__dirname, '..', 'frontend', nome), 'utf8'); } catch { continue; }
    for (const linha of texto.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
      if (m && CHAVES_DO_FRONTEND.includes(m[1])) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  for (const k of CHAVES_DO_FRONTEND) if (process.env[k]) out[k] = process.env[k].trim();
  return out;
}

/**
 * Endereço de envio de minidumps (Sentry ou compatível). Vazio = os relatórios
 * de falha ficam só no computador. Ver electron/diagnostico.ts.
 */
const URL_DE_FALHAS = (process.env.IRISFLOW_CRASH_URL ?? '').trim();

const SAIDA = path.join(__dirname, '..', 'dist-electron');

// Compila o processo main + preload do Electron (TypeScript -> CJS).
//
// Dois modos:
//   - desenvolvimento (`--watch`, usado por `npm run electron:dev`): legível e
//     com source map, para o stack trace apontar a linha do .ts;
//   - produção (sem `--watch` — `npm run electron:compile` e o empacotamento):
//     minificado, sem comentários e SEM source map. Um .map carrega o fonte
//     original inteiro (`sourcesContent`) e iria dentro do instalador.
//     O `files` do electron-builder ainda exclui `**/*.map` (segunda barreira).
function opcoes({ producao }) {
  return {
    entryPoints: [
      path.join(__dirname, 'main.ts'),
      path.join(__dirname, 'preload.ts'),
      path.join(__dirname, 'overlayPreload.ts'),
    ],
    outdir: SAIDA,
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    // `koffi` é um módulo nativo (Node-API): fica em node_modules e é carregado
    // em tempo de execução pelo adaptador do Windows — nunca entra no bundle.
    external: ['electron', 'koffi', 'electron-updater'],
    sourcemap: !producao,
    minify: producao,
    // Nem os comentários "legais" (`/*! */`, `@license`): o bundle só tem
    // código do IrisFlow — as dependências de terceiros são `external` acima
    // e vão com as próprias licenças em node_modules.
    legalComments: producao ? 'none' : 'eof',
    logLevel: 'info',
    define: {
      __IRISFLOW_BUILD_ENV__: JSON.stringify(lerEnvDoFrontend()),
      __IRISFLOW_CRASH_URL__: JSON.stringify(URL_DE_FALHAS),
    },
  };
}

/** Source maps de um build de desenvolvimento anterior não podem sobrar ao lado do bundle de produção. */
function apagarSourceMapsAntigos() {
  let nomes = [];
  try { nomes = fs.readdirSync(SAIDA); } catch { return; }
  for (const nome of nomes) {
    if (nome.endsWith('.map')) fs.rmSync(path.join(SAIDA, nome), { force: true });
  }
}

export async function runBuild({ watch = false } = {}) {
  if (watch) {
    const ctx = await context(opcoes({ producao: false }));
    await ctx.watch();
    console.log('[electron:build] observando electron/ para recompilar automaticamente...');
    return ctx;
  }
  apagarSourceMapsAntigos();
  await esbuildBuild(opcoes({ producao: true }));
  console.log('[electron:build] build de produção concluído em dist-electron/ (minificado, sem source map)');
  return null;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const watch = process.argv.includes('--watch');
  await runBuild({ watch });
  if (!watch) process.exit(0);
}
