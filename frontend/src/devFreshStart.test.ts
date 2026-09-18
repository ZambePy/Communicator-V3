import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const config = () => readFileSync(resolve(AQUI, '../vite.config.ts'), 'utf8');
const raiz = () => readFileSync(resolve(AQUI, '../../package.json'), 'utf8');

/**
 * Modo "instalação nova" do desenvolvimento.
 *
 * É temporário e existe para testar onboarding e calibração repetidamente.
 * O risco de um mecanismo assim é ele vazar para produção e apagar os dados
 * de um paciente. Estes testes travam as três guardas que impedem isso.
 */
describe('estado limpo em desenvolvimento', () => {
  it('o plugin só existe no dev server — `vite build` nunca o executa', () => {
    const src = config();
    const i = src.indexOf('function devFreshStartPlugin');
    expect(i).toBeGreaterThan(-1);
    const corpo = src.slice(i, src.indexOf('\n}', i));
    expect(corpo).toMatch(/apply:\s*'serve'/);
  });

  it('é preciso pedir explicitamente: sem a variável, não faz nada', () => {
    const src = config();
    const i = src.indexOf('function devFreshStartPlugin');
    const corpo = src.slice(i, src.indexOf('\n}', i));
    expect(corpo).toMatch(/process\.env\.IRISFLOW_DEV_FRESH === '1'/);
    expect(corpo).toMatch(/if \(!ligado\) return \[\]/);
  });

  it('preserva o id do dispositivo — apagá-lo CONSOME uma ativação de licença', () => {
    expect(config()).toContain("'irisflow_device_id'");
  });

  it('preserva a geometria física da tela — sem ela você testaria noutra tela', () => {
    const src = config();
    for (const campo of ['screenDiagonalIn', 'viewingDistanceCm']) {
      expect(src).toContain(campo);
    }
  });

  it('há script npm para os dois fluxos, e o wrapper é multiplataforma', () => {
    const pkg = JSON.parse(raiz()) as { scripts: Record<string, string> };
    expect(pkg.scripts['dev:limpo']).toBe('node scripts/limpo.mjs dev');
    expect(pkg.scripts['electron:dev:limpo']).toBe('node scripts/limpo.mjs electron:dev');
    // `VAR=1 npm run ...` não funciona no cmd/PowerShell — e é lá que este
    // projeto é desenvolvido.
    for (const s of Object.values(pkg.scripts)) expect(s).not.toMatch(/^IRISFLOW_DEV_FRESH=/);
  });

  it('os scripts normais continuam intocados', () => {
    const pkg = JSON.parse(raiz()) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toBe('npm --prefix frontend run dev');
    expect(pkg.scripts['electron:dev']).toBe('node electron/dev.mjs');
  });
});
