import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
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

  it('macOS não liga hardenedRuntime sem notarização', () => {
    // Ligado sem certificado, o Gatekeeper RECUSA o app em vez de só avisar.
    expect(pkg().build.mac.hardenedRuntime).toBe(false);
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
});
