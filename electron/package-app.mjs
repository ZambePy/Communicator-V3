/**
 * package-app.mjs - Empacotamento final via electron-builder (API programatica).
 *
 * Por que nao chamar electron-builder diretamente no npm script:
 *   electron-builder extrai o binario do Electron para <output>/win-unpacked.tmp
 *   e depois renomeia para win-unpacked. No Windows, quando o diretorio de output
 *   esta dentro de uma pasta sincronizada pelo OneDrive (ex: OneDrive\Desktop),
 *   o OneDrive bloqueia o rename com EPERM imediatamente apos criar o .tmp.
 *
 *   A solucao e sempre usar o diretorio temporario do sistema (os.tmpdir()) como
 *   output — que fica em AppData\Local\Temp, fora do escopo de sincronizacao do
 *   OneDrive. Isso e feito aqui via API programatica, de forma transparente para
 *   quem rodar npm run electron:build.
 *
 * Onde fica o instalador gerado:
 *   %TEMP%\irisflow-release\win32\IrisFlow Setup X.Y.Z.exe    (Windows)
 *   /tmp/irisflow-release/mac/IrisFlow-X.Y.Z-arm64.dmg        (macOS)
 *   /tmp/irisflow-release/linux/IrisFlow-X.Y.Z-x64.AppImage   (Linux)
 *
 *   Uma subpasta por plataforma: os artefatos nao se misturam e os tres
 *   arquivos de atualizacao (latest.yml, latest-mac.yml, latest-linux.yml)
 *   ficam cada um ao lado do instalador que descrevem.
 *
 *   O caminho exato e impresso ao final do build. Ao lado do instalador sai o
 *   latest.yml, que o electron-updater le para saber se ha versao nova.
 */

import { build, Platform } from 'electron-builder';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Plataforma alvo ────────────────────────────────────────────────────────
//
//   node electron/package-app.mjs            → a plataforma ATUAL
//   node electron/package-app.mjs --win      → Windows (NSIS)
//   node electron/package-app.mjs --mac      → macOS (dmg + zip, x64 + arm64)
//   node electron/package-app.mjs --linux    → Linux (AppImage + deb + rpm)
//
// Sem `targets`, o electron-builder empacota so a plataforma do host — que era
// o comportamento anterior e continua sendo o default.
//
// O que cada sistema consegue de fato gerar:
//   • Windows → win. (mac e impossivel; linux exige Docker ou WSL.)
//   • macOS   → mac, win e linux — e o unico host que gera as tres, e o unico
//               capaz de ASSINAR e notarizar o .app.
//   • Linux   → linux e win (via wine).
// Um .dmg NUNCA sai de Windows ou Linux: o electron-builder depende das
// ferramentas de assinatura da Apple, que so existem no macOS.
const ALVOS = { '--win': 'WINDOWS', '--mac': 'MAC', '--linux': 'LINUX' };
const pedido = process.argv.find((a) => a in ALVOS);
const plataforma = pedido ? Platform[ALVOS[pedido]] : Platform.current();
const nomeDaPlataforma = pedido ? ALVOS[pedido].toLowerCase() : process.platform;

if (pedido === '--mac' && process.platform !== 'darwin') {
  console.error(
    '[electron:package] ERRO: o instalador de macOS (.dmg) so pode ser gerado NO macOS.\n' +
    '                   Rode `npm run electron:build:mac` num Mac ou num runner macos-latest.',
  );
  process.exit(1);
}
if (pedido === '--linux' && process.platform === 'win32') {
  console.warn(
    '[electron:package] AVISO: gerar pacotes Linux a partir do Windows exige Docker ou WSL.\n' +
    '                   O caminho testado e rodar no Linux ou num runner ubuntu-latest.',
  );
}

// Uma subpasta por plataforma: artefatos nao se misturam entre builds.
const output = path.join(os.tmpdir(), 'irisflow-release', nomeDaPlataforma);

// Motor de voz (clonagem local). E opcional no empacotamento: se a pasta gerada
// por voice-engine/build-voice-engine.ps1 existir, vai para resources/voice-engine;
// se nao, o app e empacotado sem ela e a tela de Voz avisa que o motor nao veio.
const motorDeVoz = path.join(__dirname, '..', 'voice-engine', 'dist', 'irisflow-voz');
const extraResources = fs.existsSync(motorDeVoz)
  ? [{ from: motorDeVoz, to: 'voice-engine', filter: ['**/*'] }]
  : [];
console.log(
  extraResources.length
    ? '[electron:package] motor de voz encontrado: sera incluido em resources/voice-engine'
    : '[electron:package] motor de voz NAO encontrado (voice-engine/dist/irisflow-voz): empacotando sem ele',
);

// Atualizacao automatica (electron/atualizacao.ts). O endereco de onde o app
// baixa versoes novas NAO fica no codigo: vem da variavel IRISFLOW_UPDATE_URL no
// momento do empacotamento e e gravado em resources/atualizacao.json. Sem a
// variavel, o app sai com a atualizacao desligada (e diz isso no log) — e o
// latest.yml ainda e gerado, para o dia em que houver onde hospedar.
const urlDeAtualizacao = (process.env.IRISFLOW_UPDATE_URL ?? '').trim();
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'irisflow-atualizacao-'));
const arquivoDeAtualizacao = path.join(pastaTemp, 'atualizacao.json');
fs.writeFileSync(arquivoDeAtualizacao, JSON.stringify({ url: urlDeAtualizacao || null }, null, 2));
extraResources.push({ from: arquivoDeAtualizacao, to: 'atualizacao.json' });
console.log(
  urlDeAtualizacao
    ? `[electron:package] atualizacao automatica apontando para ${urlDeAtualizacao}`
    : '[electron:package] IRISFLOW_UPDATE_URL nao definida: app sai com atualizacao automatica desligada',
);

console.log(`[electron:package] Plataforma alvo: ${nomeDaPlataforma}`);
console.log('[electron:package] Iniciando empacotamento via electron-builder...');
console.log('[electron:package] Output (fora do OneDrive):', output);

const artifacts = await build({
  targets: plataforma.createTarget(),
  // Nunca publica daqui: so gera o instalador e o latest.yml ao lado dele.
  // Subir os dois para o endereco de IRISFLOW_UPDATE_URL e um passo manual.
  publish: 'never',
  config: {
    // Sobrescreve apenas o diretorio de output; todo o resto vem do package.json "build".
    directories: { output },
    extraResources,
    publish: [{ provider: 'generic', url: urlDeAtualizacao || 'https://atualizacao.invalida.local/irisflow' }],
  },
});

console.log('\n[electron:package] Empacotamento concluido. Artefatos:');
for (const artifact of artifacts) {
  console.log('  ', artifact);
}
