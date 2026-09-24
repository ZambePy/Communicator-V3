/**
 * package-app.mjs - Empacotamento final via electron-builder (API programatica).
 *
 * Por que nao chamar electron-builder diretamente no npm script:
 *   electron-builder extrai o binario do Electron para <output>/win-unpacked.tmp
 *   e depois renomeia para win-unpacked. No Windows, quando o diretorio de output
 *   esta dentro de uma pasta sincronizada pelo OneDrive (ex: OneDrive\Desktop),
 *   o OneDrive bloqueia o rename com EPERM imediatamente apos criar o .tmp.
 *
 *   A solucao e usar o diretorio temporario do sistema (os.tmpdir()) como
 *   output — que fica em AppData\Local\Temp, fora do escopo de sincronizacao do
 *   OneDrive. Isso e feito aqui via API programatica, de forma transparente para
 *   quem rodar npm run electron:build. O CI troca a pasta com IRISFLOW_RELEASE_DIR.
 *
 * Onde fica o instalador gerado (nomes FIXOS, sem versao — o site linka
 * https://github.com/<repo>/releases/latest/download/<nome>):
 *   %TEMP%\irisflow-release\win32\IrisFlow-Setup.exe                  (Windows)
 *   /tmp/irisflow-release/mac/IrisFlow-mac-arm64.dmg, IrisFlow-mac-x64.dmg (+ .zip)
 *   /tmp/irisflow-release/linux/IrisFlow-linux-x86_64.AppImage,
 *                               IrisFlow-linux-amd64.deb, IrisFlow-linux-x86_64.rpm
 *
 *   Uma subpasta por plataforma: os artefatos nao se misturam e os tres
 *   arquivos de atualizacao (latest.yml, latest-mac.yml, latest-linux.yml)
 *   ficam cada um ao lado do instalador que descrevem. Nome fixo funciona com
 *   o electron-updater: o latest*.yml aponta para o arquivo, e o provedor
 *   GitHub baixa de /releases/download/<tag>/<nome> — a tag separa as versoes.
 *
 * Assinatura de codigo — OPCIONAL. Sem nenhuma variavel abaixo o build sai sem
 * assinatura e NAO falha (Windows: aviso do SmartScreen; macOS: assinatura
 * ad-hoc, o usuario libera em Ajustes > Privacidade e Seguranca).
 *   Windows (certificado .pfx):   WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD — SO estes; o CSC_* e do
 *                                 macOS e e retirado do ambiente num build de Windows (ver abaixo)
 *   Windows (Azure Trusted Signing): AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
 *                                 AZURE_TRUSTED_SIGNING_ENDPOINT, AZURE_TRUSTED_SIGNING_ACCOUNT,
 *                                 AZURE_TRUSTED_SIGNING_PROFILE, AZURE_TRUSTED_SIGNING_PUBLISHER
 *   macOS (Developer ID .p12):    CSC_LINK + CSC_KEY_PASSWORD (CSC_NAME: identidade do keychain local)
 *   macOS (notarizacao):          APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
 * Detalhes e custos: README da raiz, secao "Instalador e atualizacao automatica".
 */

import { build, Platform } from 'electron-builder';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
const env = (nome) => (process.env[nome] ?? '').trim();

// ── Plataforma alvo ────────────────────────────────────────────────────────
//
//   node electron/package-app.mjs            → a plataforma ATUAL
//   node electron/package-app.mjs --win      → Windows (NSIS)
//   node electron/package-app.mjs --mac      → macOS (dmg + zip, x64 + arm64)
//   node electron/package-app.mjs --linux    → Linux (AppImage + deb + rpm)
//   ... --dir                                → so a pasta desempacotada (inspecao rapida)
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
const soPasta = process.argv.includes('--dir');
const ehMac = plataforma === Platform.MAC;
const ehWin = plataforma === Platform.WINDOWS;

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
const output = env('IRISFLOW_RELEASE_DIR')
  ? path.resolve(env('IRISFLOW_RELEASE_DIR'))
  : path.join(os.tmpdir(), 'irisflow-release', nomeDaPlataforma);

// Motor de voz (clonagem local). E opcional no empacotamento: se a pasta gerada
// por voice-engine/build-voice-engine.ps1 existir, vai para resources/voice-engine;
// se nao, o app e empacotado sem ela e a tela de Voz avisa que o motor nao veio
// (no macOS/Linux: "voz personalizada ainda nao disponivel", fala pela voz do sistema).
const motorDeVoz = path.join(RAIZ, 'voice-engine', 'dist', 'irisflow-voz');
const extraResources = fs.existsSync(motorDeVoz)
  ? [{ from: motorDeVoz, to: 'voice-engine', filter: ['**/*'] }]
  : [];
console.log(
  extraResources.length
    ? '[electron:package] motor de voz encontrado: sera incluido em resources/voice-engine'
    : '[electron:package] motor de voz NAO encontrado (voice-engine/dist/irisflow-voz): empacotando sem ele',
);

// Modelo do L2CS: sem ele o rastreamento roda degradado (bloco angular zerado).
// O arquivo e gitignored (92 MB); no CI o release.yml o baixa do release de tag
// `0.0.0-modelos` (IRISFLOW_MODELOS_REPO) — ver o cabecalho do release.yml.
// Atencao: o que estiver aqui vai para DENTRO do app.asar de todo instalador, e
// os pesos atuais (Gaze360) tem licenca research-only (README, "Modelos").
// Com IRISFLOW_BUILD_L2CS=off (o padrao do release.yml desde 24/09/2026) o app
// nasce com `l2cs: 'off'` e nao procura os pesos: a ausencia e a decisao, nao
// um defeito.
const modeloL2cs = path.join(RAIZ, 'frontend', 'dist', 'models', 'l2cs', 'l2cs_gaze360.onnx');
if (env('IRISFLOW_BUILD_L2CS') === 'off') {
  console.log(
    fs.existsSync(modeloL2cs)
      ? '[electron:package] IRISFLOW_BUILD_L2CS=off, mas frontend/dist tem os pesos do L2CS: eles IRIAM no pacote sem uso — apague frontend/public/models/l2cs/l2cs_gaze360.onnx antes do build'
      : '[electron:package] sem o L2CS por decisao (IRISFLOW_BUILD_L2CS=off): rastreamento pelas features de iris',
  );
  if (fs.existsSync(modeloL2cs)) process.exit(1);
} else if (!fs.existsSync(modeloL2cs)) {
  const msg = '[electron:package] modelo L2CS AUSENTE em frontend/dist/models/l2cs/l2cs_gaze360.onnx — o app sairia com rastreamento degradado';
  if (env('IRISFLOW_EXIGIR_MODELO') === '1') { console.error(msg); process.exit(1); }
  console.warn(`${msg}. (IRISFLOW_EXIGIR_MODELO=1 transforma isto em erro.)`);
}

// ── Atualizacao automatica (electron/atualizacao.ts) ───────────────────────
// Provedor GitHub: o electron-builder grava owner/repo em resources/app-update.yml.
// Ordem: IRISFLOW_RELEASES_REPO (dono/repo) > GITHUB_REPOSITORY (o proprio repo,
// no GitHub Actions — funciona em fork sem configurar nada) > package.json.
// O release.yml define IRISFLOW_RELEASES_REPO = vars.IRISFLOW_RELEASES_REPO ||
// github.repository, o MESMO repositorio em que ele publica. O repositorio de
// releases tem de ser PUBLICO: o app instalado baixa dele sem token.
const publicacaoPadrao = (pkg.build.publish ?? [])[0] ?? {};
const repositorioDeReleases = env('IRISFLOW_RELEASES_REPO') || env('GITHUB_REPOSITORY') || `${publicacaoPadrao.owner}/${publicacaoPadrao.repo}`;
if (!/^[\w.-]+\/[\w.-]+$/.test(repositorioDeReleases)) {
  console.error(`[electron:package] ERRO: repositorio de releases invalido: "${repositorioDeReleases}" (esperado dono/repo, ex.: minha-org/irisflow-releases)`);
  process.exit(1);
}
const [dono, repo] = repositorioDeReleases.split('/');
// OBJETO, nao lista: com `publish` em lista no package.json, o electron-builder
// aplica o valor programatico sobre o PRIMEIRO item (deepAssign) — uma lista
// aqui viraria a chave "0" dentro dele e a validacao do schema falha.
const publish = { provider: 'github', owner: dono, repo, releaseType: 'release' };
console.log(`[electron:package] atualizacao automatica: GitHub Releases de ${dono}/${repo}`);

// ── O que o usuario final recebe: o app, nao o codigo ──────────────────────
// (config em package.json → "build"; conferido por scripts/conferir-pacote.mjs)
//   • Sem source map: `electron/build.mjs` (producao) e `frontend/vite.config.ts`
//     nao geram .map, e `files` ainda exclui `**/*.map` — um .map leva o fonte
//     original inteiro (sourcesContent). Bundles minificados e sem comentarios.
//   • DevTools desligadas no app empacotado (`preferenciasWebSeguras`), sem menu
//     de Visualizar/Recarregar, e o main encerra se aberto com --inspect* ou
//     --remote-debugging-* (`src/electronSecurity.ts`).
//   • Fuses do Electron (`electronFuses`), gravados no binario antes da
//     assinatura:
//       runAsNode=false                     ELECTRON_RUN_AS_NODE nao transforma o app num Node
//       enableNodeOptionsEnvironmentVariable=false   NODE_OPTIONS/NODE_EXTRA_CA_CERTS ignorados
//       enableNodeCliInspectArguments=false  --inspect* e SIGUSR1 ignorados pelo Node
//       onlyLoadAppFromAsar=true             so carrega resources/app.asar (os asarUnpack
//                                            — mediapipe, koffi — continuam em app.asar.unpacked)
//     FICARAM DE FORA, de proposito:
//       grantFileProtocolExtraPrivileges    o app carrega o renderer por file:// (loadFile);
//                                            desligar exigiria migrar para protocolo proprio
//       enableEmbeddedAsarIntegrityValidation  exige o hash do asar embutido e conferido por
//                                            plataforma; sem como provar aqui que o app ainda abre
//       enableCookieEncryption              sem cookies a proteger (a sessao vai no cofre
//                                            safeStorage) e e transicao sem volta
//   Nada disso impede um especialista determinado de extrair o app.asar e ler o
//   JavaScript minificado: o que garante e que nao ha codigo-fonte legivel,
//   comentarios, source maps nem ferramenta de depuracao a um clique.

// ── Assinatura ──────────────────────────────────────────────────────────────
// Cada sistema assina com o SEU certificado, e um nunca cai no do outro:
//   macOS   → CSC_LINK + CSC_KEY_PASSWORD (Developer ID) ou CSC_NAME (keychain local);
//   Windows → WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD, ou Azure Trusted Signing.
// Por que isto importa: no Windows o electron-builder le WIN_CSC_LINK e, se ele
// nao existir, RECORRE ao CSC_LINK (app-builder-lib: getCscLink("WIN_CSC_LINK");
// a senha idem, WIN_CSC_KEY_PASSWORD e depois CSC_KEY_PASSWORD). Quem cadastrasse
// so o Developer ID da Apple teria o instalador de Windows assinado com ele — uma
// assinatura sem cadeia de confianca no Windows, e o editor gravado no
// app-update.yml passaria a ser exigido das atualizacoes seguintes.
const temCertificado = ehMac && !!(env('CSC_LINK') || env('CSC_NAME')); // certificado do macOS
const temCertificadoWindows = ehWin && !!env('WIN_CSC_LINK');
const azure = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TRUSTED_SIGNING_ENDPOINT',
  'AZURE_TRUSTED_SIGNING_ACCOUNT', 'AZURE_TRUSTED_SIGNING_PROFILE', 'AZURE_TRUSTED_SIGNING_PUBLISHER'].every((n) => env(n));
const temNotarizacao = !!(env('APPLE_ID') && env('APPLE_APP_SPECIFIC_PASSWORD') && env('APPLE_TEAM_ID'));
if (ehWin) {
  const doMac = ['CSC_LINK', 'CSC_KEY_PASSWORD'].filter((n) => env(n));
  for (const n of doMac) delete process.env[n];
  if (doMac.length > 0) {
    console.warn(
      `[electron:package] ${doMac.join(' e ')} ignorado(s) neste build de Windows: e o certificado do macOS. ` +
        'Para assinar o Windows use WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (ou os AZURE_*).',
    );
  }
}

// koffi (FFI) so e usado pelo Modo Computador no WINDOWS e traz binarios de
// 18 plataformas (~26 MB). Cada instalador leva so o seu — ou nenhum.
// Exclusoes vao na lista de nivel superior: um `files` de plataforma so com
// negacoes faz o electron-builder assumir `**/*` e empacotar o repositorio
// inteiro (site/, app/, docs/...). `src/empacotamento.test.ts` trava isso.
const exclusoesDoKoffi = ehWin
  ? ['!node_modules/koffi/build/koffi/{darwin_*,linux_*,freebsd_*,openbsd_*,musl_*,win32_ia32}/**']
  : ['!node_modules/koffi/**'];
const configDaPlataforma = { files: [...pkg.build.files, ...exclusoesDoKoffi] };
if (ehWin) {
  if (azure) {
    configDaPlataforma.win = {
      ...pkg.build.win,
      azureSignOptions: {
        publisherName: env('AZURE_TRUSTED_SIGNING_PUBLISHER'),
        endpoint: env('AZURE_TRUSTED_SIGNING_ENDPOINT'),
        codeSigningAccountName: env('AZURE_TRUSTED_SIGNING_ACCOUNT'),
        certificateProfileName: env('AZURE_TRUSTED_SIGNING_PROFILE'),
      },
    };
    console.log('[electron:package] assinatura Windows: Azure Trusted Signing');
  } else if (temCertificadoWindows) {
    console.log('[electron:package] assinatura Windows: certificado (WIN_CSC_LINK)');
  } else {
    console.log('[electron:package] assinatura Windows: NENHUMA (SmartScreen vai avisar "editor desconhecido")');
  }
}
if (ehMac) {
  if (temCertificado) {
    // Hardened Runtime so com certificado: ligado sem assinatura de verdade,
    // o Gatekeeper RECUSA o app em vez de so avisar.
    configDaPlataforma.mac = { ...pkg.build.mac, hardenedRuntime: true, notarize: temNotarizacao };
    console.log(`[electron:package] assinatura macOS: Developer ID; notarizacao ${temNotarizacao ? 'LIGADA' : 'desligada (faltam APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID)'}`);
  } else {
    // Assinatura ad-hoc ("-"): sem ela, o bundle modificado pelo builder fica
    // com assinatura invalida e o Apple Silicon diz "o app esta danificado".
    // Ad-hoc roda depois de o usuario liberar em Privacidade e Seguranca.
    configDaPlataforma.mac = { ...pkg.build.mac, identity: '-', hardenedRuntime: false, notarize: false };
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
    console.log('[electron:package] assinatura macOS: ad-hoc (sem Developer ID; o Gatekeeper vai pedir liberacao manual)');
  }
}

console.log(`[electron:package] Plataforma alvo: ${nomeDaPlataforma}${soPasta ? ' (so pasta, --dir)' : ''}`);
console.log(`[electron:package] Versao: ${pkg.version}`);
console.log('[electron:package] Iniciando empacotamento via electron-builder...');
console.log('[electron:package] Output (fora do OneDrive):', output);

const artifacts = await build({
  targets: plataforma.createTarget(soPasta ? ['dir'] : undefined),
  // Nunca publica daqui: so gera os instaladores e os latest*.yml ao lado.
  // Quem publica e o release.yml (um release do GitHub com as tres
  // plataformas de uma vez, so depois de todas passarem).
  publish: 'never',
  config: {
    // Sobrescreve o que depende do ambiente; todo o resto vem do package.json "build".
    directories: { ...pkg.build.directories, output },
    extraResources,
    publish,
    ...configDaPlataforma,
  },
});

console.log('\n[electron:package] Empacotamento concluido. Artefatos:');
for (const artifact of artifacts) {
  console.log('  ', artifact);
}
