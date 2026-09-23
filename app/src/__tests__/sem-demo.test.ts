/**
 * O app se comporta como o produto real: não existe modo demonstração, dado de
 * exemplo nem provedor simulado no código que vai para o celular (`app/` e
 * `src/`, fora dos testes). Este teste impede que isso volte por engano.
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '../..');
const PASTAS = ['app', 'src'];
const PROIBIDO = [/modo demonstra/i, /dados de exemplo/i, /mockProvider/, /MockProvider/, /isDemo/, /DemoBanner/, /mariana@exemplo/i, /Supabase não conectado/i, /forceMock/];

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : arquivos(p);
    return /\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('sem modo demonstração no bundle', () => {
  const lista = PASTAS.flatMap((p) => arquivos(path.join(RAIZ, p)));

  it('encontra os arquivos do app', () => {
    expect(lista.length).toBeGreaterThan(20);
  });

  it.each(PROIBIDO.map((re) => [re.source, re] as const))('nenhum arquivo contém %s', (_nome, re) => {
    const achados = lista.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(RAIZ, f));
    expect(achados).toEqual([]);
  });

  it('o provedor simulado não existe mais', () => {
    expect(fs.existsSync(path.join(RAIZ, 'src/data/mockProvider.ts'))).toBe(false);
    expect(fs.existsSync(path.join(RAIZ, 'src/components/DemoBanner.tsx'))).toBe(false);
  });
});
