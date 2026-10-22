#!/usr/bin/env node
/**
 * publicar.mjs — publica o IrisFlow com UM comando, na ordem certa.
 *
 *   npm run publicar                                  # confere, testa, commita, pergunta, envia
 *   npm run publicar -- --mensagem "Corrige o botão"  # troca a mensagem do commit
 *   npm run publicar -- --sem-conferir-site           # não espera o site novo aparecer no ar
 *   npm run publicar -- --so app                      # outros grupos de teste (ver verificar-tudo.mjs); o site entra sempre
 *   npm run publicar -- --sim                         # não pergunta (uso sem terminal)
 *
 * (O `--` depois de `publicar` é do npm: sem ele o npm engole as opções.)
 *
 * Roda na pasta IrisFlow V2 (ramo pipeline-v2). Confere as duas pastas, tira os
 * arquivos que saíram, atualiza as dependências, roda os testes (o mesmo portão do
 * CI), barra segredo e peso de modelo, faz o commit, pergunta, atualiza a pasta
 * IrisFlow Beta (main), envia ao GitHub e espera o site novo aparecer no ar.
 * Para no primeiro problema e diz "PAROU: <motivo>"; antes do envio, nada vai
 * para a internet. Não existe opção para pular os testes, de propósito.
 *
 * Esta é só a casca (lê os argumentos e liga git, npm, teclado, rede e relógio
 * de verdade); a sequência está em scripts/publicar/fluxo.mjs, as decisões em
 * logica.mjs e o que muda a cada versão em estaVersao.mjs. Estilo e cuidados de
 * scripts/verificar-tudo.mjs: sem dependência nova, cores só com terminal e
 * `shell` só para npm no Windows (o git roda sem shell: pasta com espaço, `[id]`
 * e `(tabs)` chegam inteiros). Nunca grava configuração do git.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import * as estaVersao from './publicar/estaVersao.mjs';
import { publicar } from './publicar/fluxo.mjs';
import { ErroDeUso, lerArgumentos } from './publicar/logica.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDERECO_DA_VERSAO = 'https://irisflow.ia.br/versao.json';
const TEMPO_DE_UMA_CONSULTA_MS = 10_000;

// No Windows, `npm` é um .cmd: o spawn precisa de shell para achá-lo.
const SHELL = process.platform === 'win32';

const cor = (codigo, texto) => (process.stdout.isTTY ? `\x1b[${codigo}m${texto}\x1b[0m` : texto);
const verde = (texto) => cor(32, texto);
const vermelho = (texto) => cor(31, texto);
const amarelo = (texto) => cor(33, texto);
const negrito = (texto) => cor(1, texto);

/** Uma linha na tela, com a cor que combina com o que ela diz. */
function escrever(texto) {
  if (texto.startsWith('▶ ')) console.log(`\n${negrito(texto)}`);
  else if (texto.startsWith('PAROU:')) console.log(`\n${vermelho(negrito(texto))}`);
  else if (texto.startsWith('✔') || texto === 'Pronto.') console.log(verde(texto));
  else if (/^(Aviso:|Cancelado\.|O site ainda não mostra)/.test(texto)) console.log(amarelo(texto));
  else console.log(texto);
}

/** Termina depois que a tela acabou de escrever (no Windows o terminal escreve aos poucos). */
function sair(codigo) {
  process.exitCode = codigo;
  process.stdout.write('', () => process.exit(codigo));
}

// Estes mostram o que o git/npm dizem na tela (login, hook, progresso); os outros são só lidos.
const GIT_COM_TELA = new Set(['fetch', 'push', 'commit']);

function git(args, { cwd }) {
  const subcomando = args.find((arg) => !arg.startsWith('-'));
  const comTela = GIT_COM_TELA.has(subcomando);
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024, // o diff de uma versão grande passa de 1 MB
    stdio: comTela ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  return { codigo: r.status ?? 1, saida: r.stdout ?? '', erro: r.error ? String(r.error.message) : (r.stderr ?? '') };
}

function npm(args, { cwd }) {
  // Com shell, o comando vai numa string só (evita o aviso DEP0190 do Node 24).
  const r = SHELL
    ? spawnSync(['npm', ...args].join(' '), { cwd, stdio: 'inherit', shell: true })
    : spawnSync('npm', args, { cwd, stdio: 'inherit' });
  return { codigo: r.status ?? 1, saida: '', erro: r.error ? String(r.error.message) : '' };
}

/** Os mesmos testes do CI: scripts/verificar-tudo.mjs com os grupos pedidos. */
async function rodarTestes({ raiz, so }) {
  const r = spawnSync(process.execPath, [path.join(raiz, 'scripts', 'verificar-tudo.mjs'), '--so', so], {
    cwd: raiz,
    stdio: 'inherit',
  });
  return r.status === 0;
}

/** Ctrl+C, Ctrl+D ou o teclado fechado respondem "nada" (que cancela). */
function perguntar(texto) {
  const leitor = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolver) => {
    leitor.once('close', () => resolver(''));
    leitor.question(texto).then(
      (resposta) => {
        resolver(resposta);
        leitor.close();
      },
      () => resolver(''),
    );
  });
}

/** O `commit` que o site no ar diz ter; null se ainda não há versao.json (404, ou o index.html do SPA). */
async function buscarVersaoDoSite() {
  const resposta = await fetch(ENDERECO_DA_VERSAO, { cache: 'no-store', signal: AbortSignal.timeout(TEMPO_DE_UMA_CONSULTA_MS) });
  if (!resposta.ok) return null;
  const dados = await resposta.json().catch(() => null);
  return typeof dados?.commit === 'string' ? dados.commit : null;
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// ---------------------------------------------------------------------------

let argumentos;
try {
  argumentos = lerArgumentos(process.argv.slice(2));
} catch (erro) {
  if (!(erro instanceof ErroDeUso)) throw erro;
  console.error(vermelho(erro.message));
  process.exit(2);
}

if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) {
  escrever('PAROU: O git não está instalado (ou não está no PATH). Instale o Git para Windows e abra um PowerShell novo.');
  escrever('Nada foi enviado para a internet.');
  sair(1);
} else {
  console.log(`Publicando o IrisFlow a partir de: ${RAIZ}`);
  publicar({
    raiz: RAIZ,
    argumentos,
    git,
    npm,
    rodarTestes,
    perguntar,
    temTerminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    buscarVersaoDoSite,
    esperar,
    agora: () => Date.now(),
    log: escrever,
    estaVersao: { BASE: estaVersao.BASE, REMOVIDOS: estaVersao.REMOVIDOS, MENSAGEM: estaVersao.MENSAGEM },
  }).then(
    (resultado) => sair(resultado.codigo),
    (erro) => {
      escrever(`PAROU: erro inesperado: ${erro?.message ?? erro}`);
      escrever('Nada foi enviado para a internet (se o erro veio depois do envio, o GitHub já recebeu).');
      sair(1);
    },
  );
}
