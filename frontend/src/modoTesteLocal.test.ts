import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { modoTesteLocal, PORTA_DO_TESTE_LOCAL } from './modoTesteLocal';

// O `npm run teste-local` mede o rastreamento: precisa rodar no build de
// produção, como o app instalado e o dia de medição (`vite preview`). O
// servidor de desenvolvimento (React em modo dev, módulos sem empacotar) disputa
// a thread principal com o MediaPipe; o relatório de 06/11/2026 (1,72°) foi
// gerado nele.

afterEach(() => vi.unstubAllEnvs());

function noModo(dev: boolean, modo: string): boolean {
  vi.stubEnv('DEV', dev);
  vi.stubEnv('MODE', modo);
  return modoTesteLocal();
}

describe('modoTesteLocal', () => {
  it('liga no build de produção feito com --mode teste-local', () => {
    expect(noModo(false, 'teste-local')).toBe(true);
  });

  it('não liga no build do instalador (modo production)', () => {
    expect(noModo(false, 'production')).toBe(false);
  });

  it('não liga no npm run dev de sempre', () => {
    expect(noModo(true, 'development')).toBe(false);
  });
});

describe('o comando npm run teste-local', () => {
  const raiz = path.resolve(__dirname, '..', '..');
  const scripts = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).scripts as Record<string, string>;
  const comando = scripts['teste-local'] ?? '';
  const pastas = [...comando.matchAll(/--outDir\s+(\S+)/g)].map((m) => m[1]);

  it('gera o build de produção e serve com o vite preview, não com o servidor de desenvolvimento', () => {
    expect(comando).toMatch(/run build -- --mode teste-local/);
    expect(comando).toMatch(/run preview -- --mode teste-local/);
    expect(comando).not.toMatch(/run dev\b/);
  });

  it('serve numa porta própria e fixa, fora da 4173 do build de medição', () => {
    // A origem (`http://127.0.0.1:<porta>`) é o que separa o localStorage. Na
    // 4173 do `vite preview` de medição, o termo aceito em nome do teste local
    // e o paciente "Teste local" passariam a valer na sessão de medição, e as
    // flags gravadas pela URL contaminariam o A/B. Sem `--strictPort`, com a
    // porta ocupada o Vite subiria noutra, com outro armazenamento.
    const preview = comando.slice(comando.indexOf('run preview'));
    const porta = preview.match(/--port\s+(\d+)/)?.[1];
    expect(porta).toBe(String(PORTA_DO_TESTE_LOCAL));
    expect(porta).not.toBe('4173');
    expect(preview).toMatch(/--strictPort\b/);
  });

  it('escreve numa pasta própria, nunca na frontend/dist que vai para o instalador', () => {
    // Uma no build e a mesma no preview.
    expect(pastas).toHaveLength(2);
    expect(new Set(pastas).size).toBe(1);
    expect(pastas[0]).not.toBe('dist');
    // A pasta própria fica fora do git, como a dist.
    const ignorados = fs.readFileSync(path.join(raiz, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
    expect(ignorados).toContain(pastas[0]);
  });
});
