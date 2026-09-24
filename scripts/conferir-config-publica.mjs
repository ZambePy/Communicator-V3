#!/usr/bin/env node
/**
 * conferir-config-publica.mjs — a configuração PÚBLICA versionada não pode
 * carregar segredo.
 *
 * Três arquivos entram no git de propósito (24/09/2026), para que o site, o
 * instalador do desktop e o app do cuidador subam com a configuração que está
 * no repositório, sem chave digitada em painel:
 *
 *   site/.env.production       lido pelo Cloudflare Pages no `npm run build`
 *   frontend/.env.production   lido pelo `vite build` do desktop (release.yml)
 *   app/.env.production        lido pelo `expo export` local; é a referência
 *                              dos valores do eas.json e das variáveis do EAS
 *
 * Tudo neles vai para dentro do que o usuário baixa (bundle do site, app.asar,
 * APK). A URL e a chave anon do Supabase são públicas por desenho — a RLS do
 * banco é que protege os dados. O que NÃO pode aparecer ali: a chave
 * service_role, uma chave secreta nova (`sb_secret_…`), senha, token, chave
 * privada. Este script falha (código 1) se:
 *
 *   - uma variável não tem o prefixo público do projeto (`VITE_` no site e no
 *     desktop, `EXPO_PUBLIC_` no app) ou tem no nome SECRET, PASSWORD, SENHA,
 *     PRIVATE, SERVICE ou TOKEN (com uma exceção: o token do beacon do
 *     Cloudflare Web Analytics, público por natureza);
 *   - um valor parece segredo: JWT cujo `role` não é `anon`, `sb_secret_…`,
 *     bloco `-----BEGIN`;
 *   - a chave anon não é do projeto da URL (ref do JWT ≠ subdomínio);
 *   - os três arquivos não apontam para o MESMO projeto Supabase.
 *
 * Roda no CI (job `site`) e em `npm run verificar`. Imprime nomes, nunca valores.
 *
 *   node scripts/conferir-config-publica.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ARQUIVOS = [
  { arquivo: 'site/.env.production', prefixo: 'VITE_', url: 'VITE_SUPABASE_URL', chave: 'VITE_SUPABASE_ANON_KEY' },
  { arquivo: 'frontend/.env.production', prefixo: 'VITE_', url: 'VITE_SUPABASE_URL', chave: 'VITE_SUPABASE_ANON_KEY' },
  { arquivo: 'app/.env.production', prefixo: 'EXPO_PUBLIC_', url: 'EXPO_PUBLIC_SUPABASE_URL', chave: 'EXPO_PUBLIC_SUPABASE_ANON_KEY' },
];

/** Nomes que sugerem segredo. O beacon do Web Analytics é público (vai no HTML). */
const NOME_SUSPEITO = /SECRET|PASSWORD|SENHA|PRIVATE|SERVICE|TOKEN/i;
const NOMES_PUBLICOS_APESAR_DO_NOME = new Set(['VITE_CF_ANALYTICS_TOKEN']);

/** Lê KEY=VALOR, ignorando comentários e linhas vazias (formato dotenv simples). */
function lerDotenv(texto) {
  const vars = new Map();
  for (const [i, bruta] of texto.split(/\r?\n/).entries()) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linha);
    if (!m) {
      vars.set(`(linha ${i + 1} ilegível)`, null);
      continue;
    }
    let valor = m[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    vars.set(m[1], valor);
  }
  return vars;
}

/** Payload de um JWT, ou null se o valor não for um JWT legível. */
function payloadDoJwt(valor) {
  const partes = valor.split('.');
  if (partes.length !== 3 || !valor.startsWith('eyJ')) return null;
  try {
    return JSON.parse(Buffer.from(partes[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const problemas = [];
const projetos = new Map();

for (const { arquivo, prefixo, url, chave } of ARQUIVOS) {
  const caminho = path.join(RAIZ, arquivo);
  if (!existsSync(caminho)) {
    problemas.push(`${arquivo}: arquivo ausente (ele é versionado — ver o cabeçalho deste script)`);
    continue;
  }
  const vars = lerDotenv(readFileSync(caminho, 'utf8'));

  for (const [nome, valor] of vars) {
    if (valor === null) {
      problemas.push(`${arquivo}: ${nome}`);
      continue;
    }
    if (!nome.startsWith(prefixo)) {
      problemas.push(`${arquivo}: ${nome} não tem o prefixo público ${prefixo} — não é lugar para ela`);
    }
    if (NOME_SUSPEITO.test(nome) && !NOMES_PUBLICOS_APESAR_DO_NOME.has(nome)) {
      problemas.push(`${arquivo}: o nome ${nome} sugere segredo — segredo não entra na configuração pública`);
    }
    if (valor.startsWith('sb_secret_')) {
      problemas.push(`${arquivo}: ${nome} tem uma chave SECRETA do Supabase (sb_secret_…) — remova e gere outra no painel`);
    }
    if (valor.includes('-----BEGIN')) {
      problemas.push(`${arquivo}: ${nome} tem uma chave privada — remova`);
    }
    const jwt = payloadDoJwt(valor);
    if (jwt && jwt.role !== 'anon') {
      problemas.push(
        `${arquivo}: ${nome} é um JWT com role "${jwt.role}" — só a chave anon é pública. ` +
          'Se for a service_role, troque-a já no painel do Supabase (Settings → API Keys).',
      );
    }
  }

  const valorUrl = vars.get(url) ?? '';
  const valorChave = vars.get(chave) ?? '';
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(valorUrl)?.[1];
  if (!ref) problemas.push(`${arquivo}: ${url} ausente ou fora do formato https://<ref>.supabase.co`);
  const jwt = payloadDoJwt(valorChave);
  if (!jwt) {
    problemas.push(`${arquivo}: ${chave} ausente ou não é a chave anon (JWT)`);
  } else if (ref && jwt.ref !== ref) {
    problemas.push(`${arquivo}: ${chave} é do projeto "${jwt.ref}", mas a URL é do projeto "${ref}"`);
  }
  if (ref) projetos.set(arquivo, ref);
}

if (new Set(projetos.values()).size > 1) {
  problemas.push(
    'os arquivos apontam para projetos Supabase diferentes: ' +
      [...projetos].map(([a, r]) => `${a} → ${r}`).join(', '),
  );
}

if (problemas.length > 0) {
  for (const p of problemas) console.log(`::error::${p}`);
  console.error(`\n${problemas.length} problema(s) na configuração pública versionada.`);
  process.exit(1);
}
console.log(
  `[config pública] ok — ${ARQUIVOS.length} arquivos, só variáveis públicas, chave anon do projeto ${[...new Set(projetos.values())].join(', ')}`,
);
