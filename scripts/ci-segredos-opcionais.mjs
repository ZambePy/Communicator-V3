#!/usr/bin/env node
/**
 * ci-segredos-opcionais.mjs — segredos OPCIONAIS do GitHub Actions sem
 * "Context access might be invalid".
 *
 * O problema: escrever `${{ secrets.CSC_LINK }}` num workflow faz a extensão
 * GitHub Actions do VS Code (e o actionlint, com a lista de segredos do
 * repositório) acusar erro enquanto o segredo não existe. Para um repositório
 * público recém-criado — que deve compilar SEM segredo nenhum — isso são
 * "erros" permanentes num arquivo correto.
 *
 * A solução, com sintaxe válida de Actions: o workflow passa o contexto
 * inteiro para UM passo pequeno, `SEGREDOS_JSON: ${{ toJSON(secrets) }}`
 * (nenhum nome de segredo aparece no YAML, então não há o que acusar), e este
 * script copia para o ambiente dos passos seguintes ($GITHUB_ENV) só os
 * nomes da lista abaixo que EXISTEM e servem à plataforma. Os demais passos
 * (npm, electron-builder...) nunca veem o contexto inteiro.
 *
 *   node scripts/ci-segredos-opcionais.mjs --plataforma windows|macos|linux
 *
 * Segundo modo, sem repassar nada — o portão da nuvem do release.yml:
 *
 *   node scripts/ci-segredos-opcionais.mjs --conferir-nuvem [--permitir-sem-nuvem]
 *
 * confere se VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY existem e passam no
 * MESMO teste que o app faz (`nuvemConfigurada` em frontend/src/cloud/config.ts:
 * URL `https://` e chave com mais de 20 caracteres). Um instalador sem elas não
 * falha: cai no serviço de licença SIMULADO (frontend/src/services/license/
 * index.ts), sem login real e sem app do cuidador. Por isso, sem elas, este
 * modo sai com código 1 — a não ser com `--permitir-sem-nuvem` (só o teste
 * manual do release.yml passa essa opção), que troca o erro por um aviso.
 *
 * Imprime só NOMES presentes/ausentes — valores nunca. O GitHub mascara nos
 * logs qualquer valor vindo de `secrets`, e o script ainda registra cada linha
 * com `::add-mask::` por garantia (valores de várias linhas, como .p8).
 *
 * Fora do GitHub Actions (sem $GITHUB_ENV) nada é gravado: o script só
 * imprime o que faria. É o jeito de testar à mão, por exemplo:
 *   SEGREDOS_JSON='{"WIN_CSC_LINK":"x"}' node scripts/ci-segredos-opcionais.mjs --plataforma windows
 */

import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

/**
 * Nome → plataformas em que ele é repassado.
 *
 * Cada sistema assina com o SEU par, e um nunca cai no do outro: no Windows o
 * electron-builder usa WIN_CSC_LINK e, se ele não existir, recorre ao CSC_LINK
 * (app-builder-lib, getCscLink("WIN_CSC_LINK")). Se o CSC_* chegasse ao job de
 * Windows, cadastrar só o Developer ID da Apple faria o instalador de Windows
 * ser assinado com o certificado da Apple. Por isso CSC_* vai só para o macOS
 * (e `electron/package-app.mjs` ainda o retira do ambiente num build de Windows).
 */
const OPCIONAIS = {
  // Assinatura Windows: certificado .pfx em base64
  WIN_CSC_LINK: ['windows'],
  WIN_CSC_KEY_PASSWORD: ['windows'],
  // Assinatura Windows: Azure Artifact/Trusted Signing
  AZURE_TENANT_ID: ['windows'],
  AZURE_CLIENT_ID: ['windows'],
  AZURE_CLIENT_SECRET: ['windows'],
  AZURE_TRUSTED_SIGNING_ENDPOINT: ['windows'],
  AZURE_TRUSTED_SIGNING_ACCOUNT: ['windows'],
  AZURE_TRUSTED_SIGNING_PROFILE: ['windows'],
  AZURE_TRUSTED_SIGNING_PUBLISHER: ['windows'],
  // Assinatura macOS: certificado Developer ID (.p12 em base64)
  CSC_LINK: ['macos'],
  CSC_KEY_PASSWORD: ['macos'],
  // Notarização Apple
  APPLE_ID: ['macos'],
  APPLE_APP_SPECIFIC_PASSWORD: ['macos'],
  APPLE_TEAM_ID: ['macos'],
  // Nuvem embutida no instalador (valores públicos: vão no bundle do app)
  VITE_SUPABASE_URL: ['windows', 'macos', 'linux'],
  VITE_SUPABASE_ANON_KEY: ['windows', 'macos', 'linux'],
  VITE_SITE_URL: ['windows', 'macos', 'linux'],
  VITE_DESKTOP_SYNC_URL: ['windows', 'macos', 'linux'],
  // Envio de minidumps (Sentry ou compatível) — ver electron/diagnostico.ts
  IRISFLOW_CRASH_URL: ['windows', 'macos', 'linux'],
};

/** Onde a documentação dos segredos mora (README da raiz). */
const DOC = 'README → "Instalador e atualização automática" e "Hospedagem e publicação"';

const args = process.argv.slice(2);

let segredos = {};
try {
  segredos = JSON.parse(process.env.SEGREDOS_JSON || '{}') ?? {};
} catch {
  console.log('::warning::SEGREDOS_JSON ilegível — seguindo sem segredos');
}
const valorDe = (nome) => (typeof segredos[nome] === 'string' ? segredos[nome].trim() : '');

// ── Modo portão: a nuvem do instalador ──────────────────────────────────────
if (args.includes('--conferir-nuvem')) {
  const url = valorDe('VITE_SUPABASE_URL');
  const chave = valorDe('VITE_SUPABASE_ANON_KEY');
  const problemas = [];
  if (!url) problemas.push('VITE_SUPABASE_URL ausente');
  else if (!url.startsWith('https://')) problemas.push('VITE_SUPABASE_URL não começa com https://');
  if (!chave) problemas.push('VITE_SUPABASE_ANON_KEY ausente');
  else if (chave.length <= 20) problemas.push('VITE_SUPABASE_ANON_KEY curta demais para ser a chave anon');

  if (problemas.length === 0) {
    console.log('[segredos] nuvem: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY presentes (o instalador sai com login real)');
    process.exit(0);
  }
  const motivo =
    `${problemas.join('; ')}. Sem os dois, o instalador cai na licença SIMULADA ` +
    '(sem login real e sem app do cuidador). Cadastre os segredos em Settings → Secrets and variables → ' +
    `Actions (${DOC}).`;
  if (args.includes('--permitir-sem-nuvem')) {
    console.log(`::warning::Instalador de TESTE sem nuvem, por escolha de quem rodou o workflow: ${motivo}`);
    process.exit(0);
  }
  console.log(`::error::${motivo} Num teste manual, a opção "permitir_sem_nuvem" do workflow aceita seguir assim.`);
  process.exit(1);
}

// ── Modo repasse: segredos da plataforma para $GITHUB_ENV ──────────────────
const i = args.indexOf('--plataforma');
const plataforma = i >= 0 ? args[i + 1] : '';
if (!['windows', 'macos', 'linux'].includes(plataforma)) {
  console.error('uso: node scripts/ci-segredos-opcionais.mjs --plataforma windows|macos|linux');
  console.error('     node scripts/ci-segredos-opcionais.mjs --conferir-nuvem [--permitir-sem-nuvem]');
  process.exit(2);
}

const destino = process.env.GITHUB_ENV;
const presentes = [];
const ausentes = [];
for (const [nome, plataformas] of Object.entries(OPCIONAIS)) {
  if (!plataformas.includes(plataforma)) continue;
  const valor = typeof segredos[nome] === 'string' ? segredos[nome] : '';
  if (!valor.trim()) { ausentes.push(nome); continue; }
  presentes.push(nome);
  for (const linha of valor.split(/\r?\n/)) if (linha.trim()) console.log(`::add-mask::${linha}`);
  if (destino) {
    const delim = `FIM_${randomBytes(12).toString('hex')}`;
    appendFileSync(destino, `${nome}<<${delim}\n${valor}\n${delim}\n`);
  }
}

console.log(`[segredos] plataforma: ${plataforma}`);
console.log(`[segredos] presentes: ${presentes.join(', ') || '(nenhum)'}`);
// Sem "(ok, são opcionais)": numa tag a nuvem é obrigatória — quem barra a
// falta dela é o `--conferir-nuvem`, no primeiro job do release.yml.
console.log(`[segredos] ausentes: ${ausentes.join(', ') || '(nenhum)'}`);
if (!destino) console.log('[segredos] fora do GitHub Actions (sem GITHUB_ENV): nada foi gravado');
if (plataforma === 'windows' && !valorDe('WIN_CSC_LINK') && valorDe('CSC_LINK')) {
  console.log(
    '::notice::CSC_LINK existe, mas é o certificado do macOS e não vale no Windows. ' +
      'Para assinar o instalador de Windows cadastre WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (ou os AZURE_*).',
  );
}
if (!presentes.some((n) => /CSC_LINK|AZURE_CLIENT_SECRET/.test(n)) && plataforma !== 'linux') {
  console.log(`::notice::Build SEM assinatura de código (${plataforma}). Veja no README "Instalador e atualização automática" → "Assinatura de código".`);
}
if (!presentes.includes('VITE_SUPABASE_URL')) {
  console.log('::notice::VITE_SUPABASE_URL ausente: o instalador sai sem login na nuvem (licença simulada, modo 100% local).');
}
