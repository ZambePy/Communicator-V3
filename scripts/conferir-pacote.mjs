#!/usr/bin/env node
/**
 * conferir-pacote.mjs — confere, NO APP JÁ EMPACOTADO, que quem instala recebe
 * a solução e não o código-fonte nem ferramenta de depuração.
 *
 *   node scripts/conferir-pacote.mjs <pasta de saída do electron-builder>
 *   node scripts/conferir-pacote.mjs release                     # CI (IRISFLOW_RELEASE_DIR=release)
 *   node scripts/conferir-pacote.mjs /tmp/irisflow-release/linux # local
 *
 * Procura as pastas desempacotadas que o electron-builder deixa ao lado dos
 * instaladores (linux-unpacked, win-unpacked, o .app dentro de mac e
 * mac-arm64) e, em cada uma:
 *
 *   1. o app vem em resources/app.asar — e SÓ nele (sem pasta resources/app);
 *   2. dentro do asar só há o build (frontend/dist, dist-electron,
 *      node_modules, package.json): nada de src/, electron/, site/, app/,
 *      docs/, nenhum .ts e nenhum source map (.map) — nem no asar nem no
 *      app.asar.unpacked;
 *   3. os bundles do IrisFlow (dist-electron/*.cjs, frontend/dist/assets/*.js)
 *      estão minificados e não apontam para source map (`sourceMappingURL`);
 *   4. os fuses do binário do Electron estão como o package.json pede
 *      (`build.electronFuses`): RunAsNode e as duas portas do Node desligadas,
 *      OnlyLoadAppFromAsar ligado.
 *
 * Sai com código 1 se algo falhar. Sem dependência nova: `@electron/asar` e
 * `@electron/fuses` já vêm com o electron-builder.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');

const pasta = path.resolve(process.argv[2] ?? 'release');
if (!fs.existsSync(pasta)) {
  console.error(`[conferir-pacote] pasta não existe: ${pasta}`);
  process.exit(2);
}

/** Estado de um fuse no binário: '0' desligado, '1' ligado (bytes ASCII). */
const DESLIGADO = 48;
const LIGADO = 49;
const FUSES_ESPERADOS = {
  RunAsNode: DESLIGADO,
  EnableNodeOptionsEnvironmentVariable: DESLIGADO,
  EnableNodeCliInspectArguments: DESLIGADO,
  OnlyLoadAppFromAsar: LIGADO,
};
/** Marca de onde fica a "fiação" de fuses dentro do binário do Electron. */
const SENTINELA_DOS_FUSES = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');

/** Única coisa que pode existir dentro do app.asar. */
const RAIZES_PERMITIDAS = ['/frontend/dist/', '/dist-electron/', '/node_modules/', '/package.json'];

/**
 * Bundle minificado: linhas longas. Um bundle legível (esbuild sem minify,
 * Vite com `minify: false`) fica em ~30–40 caracteres por linha, com os
 * comentários do fonte; minificado passa de centenas. Só vale para arquivos
 * com corpo suficiente para a média dizer algo.
 */
const MEDIA_MINIMA_POR_LINHA = 200;
const TAMANHO_MINIMO_PARA_MEDIR = 4 * 1024;

const falhas = [];
const falhar = (onde, msg) => falhas.push(`${onde}: ${msg}`);

/** Apps desempacotados na pasta de saída: { rotulo, recursos, binarioOuApp }. */
function acharApps(raiz) {
  const apps = [];
  for (const nome of fs.readdirSync(raiz)) {
    const dir = path.join(raiz, nome);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (/^(linux|win)(-[a-z0-9]+)?-unpacked$/.test(nome)) {
      apps.push({ rotulo: nome, recursos: path.join(dir, 'resources'), binarioOuApp: acharBinarioDoElectron(dir) });
    } else if (/^mac(-[a-z0-9]+)?$/.test(nome)) {
      for (const sub of fs.readdirSync(dir)) {
        if (!sub.endsWith('.app')) continue;
        const app = path.join(dir, sub);
        apps.push({ rotulo: `${nome}/${sub}`, recursos: path.join(app, 'Contents', 'Resources'), binarioOuApp: app });
      }
    }
  }
  return apps;
}

/** O executável do app é o arquivo da pasta que carrega a sentinela dos fuses. */
function acharBinarioDoElectron(dir) {
  for (const nome of fs.readdirSync(dir)) {
    const arq = path.join(dir, nome);
    const st = fs.statSync(arq);
    if (!st.isFile() || st.size < 20 * 1024 * 1024) continue; // o Electron tem >100 MB
    if (/\.(so|dll|pak|bin|dat|asar)(\.|$)/i.test(nome)) continue;
    if (fs.readFileSync(arq).includes(SENTINELA_DOS_FUSES)) return arq;
  }
  return null;
}

function arquivosEm(dir) {
  const saida = [];
  if (!fs.existsSync(dir)) return saida;
  const andar = (d) => {
    for (const nome of fs.readdirSync(d)) {
      const f = path.join(d, nome);
      if (fs.statSync(f).isDirectory()) andar(f);
      else saida.push(f);
    }
  };
  andar(dir);
  return saida;
}

function conferirApp({ rotulo, recursos, binarioOuApp }) {
  const arquivoAsar = path.join(recursos, 'app.asar');
  if (!fs.existsSync(arquivoAsar)) {
    falhar(rotulo, 'sem resources/app.asar (asar desligado?)');
    return;
  }
  if (fs.existsSync(path.join(recursos, 'app'))) falhar(rotulo, 'existe resources/app: código fora do asar');

  // 2. Conteúdo do asar.
  const entradas = asar.listPackage(arquivoAsar, { isPack: false }).map((e) => e.replace(/\\/g, '/'));
  const arquivos = entradas.filter((e) => {
    try {
      return !asar.statFile(arquivoAsar, e.slice(1)).files;
    } catch {
      return true;
    }
  });
  for (const e of arquivos) {
    if (!RAIZES_PERMITIDAS.some((r) => e === r || e.startsWith(r))) falhar(rotulo, `fora do build: ${e}`);
    if (e.endsWith('.map')) falhar(rotulo, `source map no pacote: ${e}`);
    if (/\.(ts|tsx|mts|cts)$/.test(e) && !e.endsWith('.d.ts')) falhar(rotulo, `TypeScript no pacote: ${e}`);
  }
  for (const f of arquivosEm(path.join(recursos, 'app.asar.unpacked'))) {
    if (f.endsWith('.map')) falhar(rotulo, `source map em app.asar.unpacked: ${path.relative(recursos, f)}`);
  }

  // 3. Bundles do IrisFlow.
  const bundles = arquivos.filter((e) => /^\/dist-electron\/[^/]+\.cjs$/.test(e) || /^\/frontend\/dist\/assets\/[^/]+\.js$/.test(e));
  if (!bundles.some((e) => e === '/dist-electron/main.cjs')) falhar(rotulo, 'dist-electron/main.cjs ausente');
  if (!bundles.some((e) => e.startsWith('/frontend/dist/assets/'))) falhar(rotulo, 'frontend/dist/assets ausente');
  for (const e of bundles) {
    const texto = asar.extractFile(arquivoAsar, e.slice(1)).toString('utf8');
    if (/[#@]\s*sourceMappingURL=/.test(texto)) falhar(rotulo, `${e} aponta para source map`);
    if (texto.length >= TAMANHO_MINIMO_PARA_MEDIR) {
      const linhas = texto.split('\n').length;
      const media = texto.length / linhas;
      if (media < MEDIA_MINIMA_POR_LINHA) falhar(rotulo, `${e} não parece minificado (${Math.round(media)} caracteres/linha)`);
    }
  }

  // 4. Fuses.
  if (!binarioOuApp) {
    falhar(rotulo, 'binário do Electron não encontrado para ler os fuses');
    return { rotulo, arquivos: arquivos.length, bundles: bundles.length };
  }
  return getCurrentFuseWire(binarioOuApp).then((fiacao) => {
    const estados = {};
    for (const [nome, esperado] of Object.entries(FUSES_ESPERADOS)) {
      const atual = fiacao[FuseV1Options[nome]];
      estados[nome] = atual === LIGADO ? 'ligado' : atual === DESLIGADO ? 'desligado' : `?(${atual})`;
      if (atual !== esperado) falhar(rotulo, `fuse ${nome} está ${estados[nome]}; esperado ${esperado === LIGADO ? 'ligado' : 'desligado'}`);
    }
    return { rotulo, arquivos: arquivos.length, bundles: bundles.length, estados };
  });
}

const apps = acharApps(pasta);
if (apps.length === 0) {
  console.error(`[conferir-pacote] nenhum app desempacotado em ${pasta} (linux-unpacked, win-unpacked, mac*/…app)`);
  process.exit(2);
}

for (const app of apps) {
  const r = await conferirApp(app);
  if (r) {
    const fuses = r.estados ? Object.entries(r.estados).map(([n, s]) => `${n}=${s}`).join(', ') : '(não lidos)';
    console.log(`[conferir-pacote] ${r.rotulo}: ${r.arquivos} arquivos no asar, ${r.bundles} bundles do IrisFlow conferidos; fuses: ${fuses}`);
  }
}

if (falhas.length > 0) {
  console.error(`\n[conferir-pacote] ${falhas.length} problema(s):`);
  for (const f of falhas) console.error(`  ✖ ${f}`);
  process.exit(1);
}
console.log('[conferir-pacote] ok: sem código-fonte, sem source map, bundles minificados, fuses conferidos.');
