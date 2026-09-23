import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = () => JSON.parse(readFileSync(resolve(RAIZ, 'package.json'), 'utf8'));
const script = () => readFileSync(resolve(RAIZ, 'electron/package-app.mjs'), 'utf8');

/**
 * Configuração de empacotamento.
 *
 * Estes testes existem por causa de um bug que passou despercebido e quebrou o
 * build em TODAS as plataformas: o electron-builder procura, por convenção,
 * uma pasta chamada `app` ou `www` com `package.json` e a adota como raiz do
 * app Electron (`DEFAULT_APP_DIR_NAMES`). Quando o app do cuidador (Expo)
 * entrou neste monorepo como `app/`, o empacotamento passou a ler
 * `app/package.json` e a procurar o entry `expo-router/entry` dentro do asar.
 * O erro só aparecia ao rodar o empacotamento inteiro — nenhum typecheck,
 * lint ou teste pegava.
 */
describe('empacotamento — electron-builder', () => {
  it('a raiz do app Electron é EXPLÍCITA, não por convenção', () => {
    // Sem isto, a pasta `app/` (Expo, do cuidador) é adotada como raiz.
    expect(pkg().build.directories.app).toBe('.');
  });

  it('o entry point do Electron continua sendo o do Electron', () => {
    expect(pkg().main).toBe('dist-electron/main.cjs');
  });

  it('as três plataformas estão configuradas', () => {
    const b = pkg().build;
    expect(b.win.target).toBeTruthy();
    expect(b.mac.target).toBeTruthy();
    expect(b.linux.target).toBeTruthy();
  });

  it('macOS gera zip além do dmg — o updater de mac só sabe usar zip', () => {
    const alvos = pkg().build.mac.target as { target: string; arch: string[] }[];
    const nomes = alvos.map((t) => t.target);
    expect(nomes).toContain('dmg');
    expect(nomes).toContain('zip');
    // Apple Silicon e Intel: um .dmg só de x64 roda sob Rosetta, com a câmera
    // e o ONNX mais lentos justamente onde o orçamento é apertado.
    for (const t of alvos) expect(t.arch).toEqual(['x64', 'arm64']);
  });

  it('macOS não liga hardenedRuntime sem certificado', () => {
    // Ligado sem certificado, o Gatekeeper RECUSA o app em vez de só avisar.
    // O package.json fica em false; o script liga só com CSC_LINK presente.
    expect(pkg().build.mac.hardenedRuntime).toBe(false);
    expect(script()).toMatch(/if \(temCertificado\)[\s\S]*hardenedRuntime: true/);
    expect(script()).toMatch(/identity: '-', hardenedRuntime: false, notarize: false/);
  });

  it('entitlements de câmera e microfone existem para o Hardened Runtime', () => {
    const b = pkg().build.mac;
    expect(b.entitlements).toBe('build/entitlements.mac.plist');
    const plist = readFileSync(resolve(RAIZ, b.entitlements), 'utf8');
    expect(plist).toContain('com.apple.security.device.camera');
    expect(plist).toContain('com.apple.security.device.audio-input');
    expect(plist).toContain('com.apple.security.cs.allow-jit');
    expect(b.extendInfo.NSCameraUsageDescription).toBeTruthy();
    expect(b.extendInfo.NSMicrophoneUsageDescription).toBeTruthy();
  });

  it('Linux declara maintainer — o alvo deb aborta o build sem ele', () => {
    expect(pkg().build.linux.maintainer).toMatch(/.+<.+@.+>/);
  });

  it('Linux gera AppImage, deb e rpm', () => {
    const nomes = (pkg().build.linux.target as { target: string }[]).map((t) => t.target);
    expect(nomes).toEqual(expect.arrayContaining(['AppImage', 'deb', 'rpm']));
  });

  it('Windows continua intocado', () => {
    expect(pkg().build.win.target).toBe('nsis');
    expect(pkg().build.nsis.oneClick).toBe(false);
  });

  it('há um script npm por plataforma, e o genérico continua existindo', () => {
    const s = pkg().scripts;
    expect(s['electron:build']).toContain('package-app.mjs');
    expect(s['electron:build:win']).toContain('--win');
    expect(s['electron:build:mac']).toContain('--mac');
    expect(s['electron:build:linux']).toContain('--linux');
  });

  it('o script recusa --mac fora do macOS em vez de falhar no meio', () => {
    const src = script();
    expect(src).toMatch(/pedido === '--mac' && process\.platform !== 'darwin'/);
    expect(src).toMatch(/process\.exit\(1\)/);
  });

  it('os artefatos são separados por plataforma', () => {
    expect(script()).toMatch(/path\.join\(os\.tmpdir\(\), 'irisflow-release', nomeDaPlataforma\)/);
  });

  it('sem argumento, empacota a plataforma atual — comportamento de antes', () => {
    expect(script()).toMatch(/Platform\.current\(\)/);
  });

  it('nomes FIXOS dos instaladores — o site linka /releases/latest/download/<nome>', () => {
    const b = pkg().build;
    expect(b.nsis.artifactName).toBe('IrisFlow-Setup.${ext}');
    expect(b.dmg.artifactName).toBe('IrisFlow-mac-${arch}.${ext}');
    expect(b.mac.artifactName).toBe('IrisFlow-mac-${arch}.${ext}');
    expect(b.appImage.artifactName).toBe('IrisFlow-linux-x86_64.${ext}');
    expect(b.deb.artifactName).toBe('IrisFlow-linux-amd64.${ext}');
    expect(b.rpm.artifactName).toBe('IrisFlow-linux-x86_64.${ext}');
    // Linux só x64: os nomes acima fixam a arquitetura no texto.
    for (const t of b.linux.target as { arch: string[] }[]) expect(t.arch).toEqual(['x64']);
  });

  it('atualização pelo GitHub Releases, sempre em latest*.yml', () => {
    const b = pkg().build;
    expect(b.publish[0]).toMatchObject({ provider: 'github', releaseType: 'release' });
    expect(b.publish[0].owner).toBeTruthy();
    expect(b.publish[0].repo).toBeTruthy();
    // Sem isto, uma versão 1.0.0-beta.3 geraria beta.yml e o site/updater
    // precisariam saber do canal.
    expect(b.detectUpdateChannel).toBe(false);
    const src = script();
    expect(src).not.toContain('IRISFLOW_UPDATE_URL');
    expect(src).not.toContain('atualizacao.json');
    expect(src).toContain("publish: 'never'");
  });

  it('só o build do app entra no pacote — nada de site/, app/, docs, fontes, testes', () => {
    const b = pkg().build;
    const positivos = (b.files as string[]).filter((f) => !f.startsWith('!'));
    expect(positivos.sort()).toEqual(['dist-electron/**/*', 'frontend/dist/**/*']);
    expect(b.files).toContain('!node_modules/@mediapipe/**');
    // Um `files` de PLATAFORMA só com negações faz o electron-builder assumir
    // `**/*` e empacotar o repositório inteiro (aconteceu: asar de 245 MB com
    // site/, app/ e docs/). Exclusões por plataforma vão no script.
    for (const plat of ['win', 'mac', 'linux']) expect(b[plat].files, plat).toBeUndefined();
    expect(script()).toMatch(/files: \[\.\.\.pkg\.build\.files, \.\.\.exclusoesDoKoffi\]/);
  });

  it('tudo que o processo main carrega em tempo de execução está em dependencies', () => {
    // electron-builder só empacota `dependencies`; um require de algo que
    // está em devDependencies funciona em dev e quebra no instalador.
    const p = pkg();
    const deps = new Set(Object.keys(p.dependencies));
    const fontes: string[] = [];
    const andar = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const f = join(dir, n);
        if (statSync(f).isDirectory()) andar(f);
        else if (/\.ts$/.test(n)) fontes.push(f);
      }
    };
    andar(resolve(RAIZ, 'electron'));
    const externos = new Set<string>();
    for (const f of fontes) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:require\(|from\s+)['"]([^'"./][^'"]*)['"]/g)) {
        const nome = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
        if (nome.startsWith('node:') || nome === 'electron') continue;
        externos.add(nome);
      }
    }
    for (const nome of externos) expect(deps.has(nome), `${nome} usado em electron/ mas fora de dependencies`).toBe(true);
    // E o que o esbuild deixa de fora do bundle também precisa estar lá.
    const build = readFileSync(resolve(RAIZ, 'electron/build.mjs'), 'utf8');
    const ext = /external:\s*\[([^\]]*)\]/.exec(build)![1].match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
    for (const nome of ext) if (nome !== 'electron') expect(deps.has(nome), nome).toBe(true);
  });

  it('versão vem do package.json (o release.yml grava a da tag antes do build)', () => {
    expect(existsSync(resolve(RAIZ, '.github/workflows/release.yml'))).toBe(true);
    const wf = readFileSync(resolve(RAIZ, '.github/workflows/release.yml'), 'utf8');
    expect(wf).toContain('npm version');
    expect(wf).toContain('--no-git-tag-version');
  });
});
