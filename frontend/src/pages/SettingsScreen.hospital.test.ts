import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const codigo = readFileSync(resolve(AQUI, 'SettingsScreen.tsx'), 'utf8');

/**
 * Rodada 3 (21/10/2026): a contagem da Emergência (3 a 10 s) e o modo hospital
 * se ajustam em Configurações, pelo `AjustesDeEmergenciaEHospital`.
 *
 * Montar Configurações inteira exige PIN, nuvem, voz e lembretes (ver
 * `SettingsScreen.ajustes.test.ts`), e um teste que a montasse quebraria a cada
 * contexto novo que as outras tarefas pusessem nela. O COMPORTAMENTO dos dois
 * cartões (a contagem de 3 a 10 s, ligar e desligar o modo, o que ficou salvo)
 * está em `settings/AjustesDeEmergenciaEHospital.test.tsx`, com o provedor de
 * configurações de verdade. Aqui fica só o que não dá para ver sem montar a tela
 * inteira: que ela mostra o componente. Sem exigir ordem, texto de propriedade
 * nem formatação, para não quebrar nos conflitos de merge.
 */
describe('Configurações mostra a contagem da Emergência e o modo hospital', () => {
  it('importa o componente e o usa, uma vez', () => {
    expect(codigo).toMatch(/import \{ AjustesDeEmergenciaEHospital \} from '\.\/settings\/AjustesDeEmergenciaEHospital'/);
    expect(codigo.match(/<AjustesDeEmergenciaEHospital\b/g)).toHaveLength(1);
  });
});
