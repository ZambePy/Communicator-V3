import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const codigo = readFileSync(resolve(AQUI, 'SettingsScreen.tsx'), 'utf8');

/**
 * Montar Configurações inteira exige PIN, nuvem, voz e lembretes; o que importa
 * aqui é o contrato estrutural: a seção de abreviações está na tela, logo depois
 * do Assistente de escrita (é dele que ela depende: sem sugestões ligadas não há
 * chip), com o mesmo cartão das outras.
 */
describe('Configurações mostra as abreviações do paciente', () => {
  it('importa a seção', () => {
    expect(codigo).toMatch(/import \{ AbreviacoesSection \} from '\.\/settings\/AbreviacoesSection';/);
  });

  it('põe a seção logo depois do Assistente de escrita, com o cartão das outras', () => {
    expect(codigo).toMatch(
      /aria-labelledby="assistente-title"[\s\S]*?<\/section>\s*<AbreviacoesSection cardStyle=\{cardStyle\} \/>/,
    );
  });

  it('a seção entra uma vez só', () => {
    expect(codigo.match(/<AbreviacoesSection /g)).toHaveLength(1);
  });
});
