import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POR_QUE_TELA_CHEIA, instrucaoDeSaida } from './telaCheia';

const AQUI = dirname(fileURLToPath(import.meta.url));

describe('aviso de tela cheia', () => {
  it('explica o porquê', () => {
    expect(POR_QUE_TELA_CHEIA).toMatch(/tela cheia para que os alvos fiquem grandes e o olhar seja medido corretamente/);
  });

  it('Windows/Linux: F11 alterna, Alt+F4 fecha', () => {
    const s = instrucaoDeSaida({ electron: true, mac: false });
    expect(s.texto).toContain('F11');
    expect(s.texto).toContain('Alt + F4');
  });

  it('macOS: Ctrl+Cmd+F alterna, Cmd+Q fecha', () => {
    const s = instrucaoDeSaida({ electron: true, mac: true });
    expect(s.texto).toContain('Ctrl + Cmd + F');
    expect(s.texto).toContain('Cmd + Q');
  });

  it('o atalho descrito é o que o Electron de fato implementa', () => {
    // Se `alternaTelaCheia` mudar, este texto mente para o cuidador.
    const seguranca = readFileSync(resolve(AQUI, '../../../src/electronSecurity.ts'), 'utf8');
    expect(seguranca).toMatch(/t\.key === 'F11'/);
    expect(seguranca).toMatch(/t\.control && t\.meta && \(t\.key === 'f'/);
  });
});
