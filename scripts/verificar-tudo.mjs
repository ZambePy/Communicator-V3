#!/usr/bin/env node
/**
 * verificar-tudo.mjs — roda, em sequência, tudo que o CI roda, e resume.
 *
 *   npm run verificar                 # tudo (raiz/frontend/electron, site, app)
 *   node scripts/verificar-tudo.mjs --so site,app      # só alguns grupos
 *   node scripts/verificar-tudo.mjs --sem-build        # pula os builds (mais rápido)
 *   node scripts/verificar-tudo.mjs --continuar        # não para no primeiro erro
 *   node scripts/verificar-tudo.mjs --so desktop,pacote  # + empacotamento e conferência
 *
 * Grupos: desktop (tsc núcleo + Electron, vitest núcleo, vitest frontend,
 * build frontend, compile Electron), site (tsc, vitest, build) e app (tsc,
 * jest). Sem dependência nova: só `npm`/`npx` dos próprios projetos.
 * Sai com código 1 se algum passo falhar. É o mesmo portão do ci.yml —
 * verde aqui, verde lá.
 *
 * `pacote` (espelho do job `empacotamento-linux`) só roda quando pedido em
 * `--so`: empacota a pasta do app para ESTE sistema (`--dir`, baixa o Electron
 * na primeira vez) e roda scripts/conferir-pacote.mjs — sem código-fonte, sem
 * source map, fuses gravados. Precisa do build do desktop antes (mesma
 * execução ou uma anterior).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Saída do empacotamento do grupo `pacote` — fora do repositório (e do OneDrive). */
const PASTA_DO_PACOTE = path.join(os.tmpdir(), 'irisflow-verificar-pacote');
const args = process.argv.slice(2);
const idxSo = args.findIndex((a) => a === '--so' || a.startsWith('--so='));
const soGrupos = (idxSo < 0 ? '' : args[idxSo].includes('=') ? args[idxSo].split('=')[1] : (args[idxSo + 1] ?? ''))
  .split(',').map((s) => s.trim()).filter(Boolean);
const SEM_BUILD = args.includes('--sem-build');
const CONTINUAR = args.includes('--continuar');

const cor = (c, t) => (process.stdout.isTTY ? `\x1b[${c}m${t}\x1b[0m` : t);
const verde = (t) => cor(32, t);
const vermelho = (t) => cor(31, t);
const amarelo = (t) => cor(33, t);
const negrito = (t) => cor(1, t);

// No Windows, `npm`/`npx` são .cmd: spawnSync precisa de shell para achá-los.
const SHELL = process.platform === 'win32';

/** @type {{grupo:string, nome:string, dir:string, cmd:string[], build?:boolean, opcional?:boolean, env?:Record<string,string>}[]} */
const PASSOS = [
  // ---- desktop (raiz + frontend + electron): espelho do job `verify` ----
  { grupo: 'desktop', nome: 'tsc núcleo',           dir: '.',        cmd: ['npx', 'tsc', '--noEmit', '-p', 'tsconfig.json'] },
  { grupo: 'desktop', nome: 'tsc Electron',         dir: '.',        cmd: ['npx', 'tsc', '--noEmit', '-p', 'electron/tsconfig.json'] },
  { grupo: 'desktop', nome: 'vitest núcleo',        dir: '.',        cmd: ['npm', 'test', '--silent'] },
  { grupo: 'desktop', nome: 'vitest interface',     dir: 'frontend', cmd: ['npm', 'test', '--silent'] },
  { grupo: 'desktop', nome: 'build frontend',       dir: 'frontend', cmd: ['npm', 'run', 'build', '--silent'], build: true },
  { grupo: 'desktop', nome: 'compile Electron',     dir: '.',        cmd: ['npm', 'run', 'electron:compile', '--silent'], build: true },
  // ---- site: espelho do job `site` ----
  { grupo: 'site',    nome: 'config pública',       dir: '.',        cmd: ['node', 'scripts/conferir-config-publica.mjs'] },
  { grupo: 'site',    nome: 'tsc site',             dir: 'site',     cmd: ['npx', 'tsc', '--noEmit', '-p', 'tsconfig.app.json'] },
  { grupo: 'site',    nome: 'vitest site',          dir: 'site',     cmd: ['npm', 'test', '--silent'] },
  { grupo: 'site',    nome: 'build site',           dir: 'site',     cmd: ['npm', 'run', 'build', '--silent'], build: true },
  // ---- app do cuidador: espelho do job `app` ----
  { grupo: 'app',     nome: 'tsc app',              dir: 'app',      cmd: ['npx', 'tsc', '--noEmit'] },
  { grupo: 'app',     nome: 'jest app',             dir: 'app',      cmd: ['npx', 'jest', '--ci', '--silent'] },
  // ---- pacote: espelho do job `empacotamento-linux` (só com --so pacote) ----
  { grupo: 'pacote',  nome: 'empacotar (--dir)',    dir: '.',        cmd: ['node', 'electron/package-app.mjs', '--dir'], build: true, opcional: true, env: { IRISFLOW_RELEASE_DIR: PASTA_DO_PACOTE } },
  { grupo: 'pacote',  nome: 'conferir pacote',      dir: '.',        cmd: ['node', 'scripts/conferir-pacote.mjs', PASTA_DO_PACOTE], build: true, opcional: true },
];

const selecionados = PASSOS.filter((p) =>
  (soGrupos.length === 0 ? !p.opcional : soGrupos.includes(p.grupo)) && !(SEM_BUILD && p.build));

if (selecionados.length === 0) {
  console.error(vermelho(`nenhum passo selecionado (grupos válidos: desktop, site, app, pacote)`));
  process.exit(2);
}

// Sem node_modules o passo falharia com uma mensagem confusa do npx; avisa antes.
for (const dir of new Set(selecionados.map((p) => p.dir))) {
  if (!existsSync(path.join(RAIZ, dir, 'node_modules'))) {
    console.error(amarelo(`aviso: ${dir === '.' ? 'raiz' : dir}/node_modules não existe — rode \`npm ci\` em ${dir === '.' ? 'raiz' : dir}/`));
  }
}

const resultados = [];
const inicioGeral = Date.now();

for (const passo of selecionados) {
  const rotulo = `[${passo.grupo}] ${passo.nome}`;
  console.log(`\n${negrito('▶ ' + rotulo)}  ${cor(2, `(${passo.dir}: ${passo.cmd.join(' ')})`)}`);
  const inicio = Date.now();
  const r = spawnSync(passo.cmd[0], passo.cmd.slice(1), {
    cwd: path.join(RAIZ, passo.dir),
    stdio: 'inherit',
    shell: SHELL,
    env: { ...process.env, CI: process.env.CI ?? '1', FORCE_COLOR: process.env.FORCE_COLOR ?? '1', ...passo.env },
  });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  const ok = r.status === 0;
  resultados.push({ rotulo, ok, segundos, status: r.status ?? r.signal });
  console.log(ok ? verde(`✔ ${rotulo} (${segundos}s)`) : vermelho(`✖ ${rotulo} falhou (código ${r.status ?? r.signal}, ${segundos}s)`));
  if (!ok && !CONTINUAR) {
    console.log(amarelo('\nparando no primeiro erro (use --continuar para rodar o resto)'));
    break;
  }
}

const falhas = resultados.filter((r) => !r.ok);
const pulados = selecionados.length - resultados.length;
console.log(`\n${negrito('Resumo')} (${((Date.now() - inicioGeral) / 1000).toFixed(0)}s)`);
for (const r of resultados) console.log(`  ${r.ok ? verde('ok    ') : vermelho('FALHOU')} ${r.rotulo}  ${cor(2, r.segundos + 's')}`);
if (pulados > 0) console.log(`  ${amarelo('pulado')} ${pulados} passo(s) depois da falha`);
if (SEM_BUILD) console.log(`  ${amarelo('nota  ')} builds pulados (--sem-build)`);

if (falhas.length > 0) {
  console.log(vermelho(`\n${falhas.length} passo(s) com erro. Não publique.`));
  process.exit(1);
}
console.log(verde('\nTudo verde: pode seguir para a publicação (README, "Hospedagem e publicação").'));
