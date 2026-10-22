import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const codigo = readFileSync(resolve(AQUI, 'SettingsScreen.tsx'), 'utf8');

/**
 * Backup e restauração (rodada 3, 21/10/2026): a seção "Backup" das Configurações é a
 * nova (`settings/BackupSection`), que salva E restaura. O botão antigo baixava só as
 * `irisflow_settings` num `irisflow_backup.json`, sem formato, sem versão e sem volta:
 * quem trocava de computador perdia pacientes, frases e a própria voz.
 *
 * Contrato estrutural, como em `SettingsScreen.ajustes.test.ts`: montar Configurações
 * inteira exige PIN, nuvem, voz e lembretes. O comportamento da seção é testado em
 * `settings/BackupSection.test.tsx`; aqui só se garante que a TELA a usa, uma vez, e que o
 * botão antigo não voltou — por exemplo, num conflito de merge com as outras tarefas da
 * rodada, que também acrescentam linhas a esta tela.
 */
describe('Configurações mostra a seção de Backup e restauração', () => {
  it('importa a seção nova e a mostra uma única vez, com o estilo de cartão da tela', () => {
    expect(codigo).toMatch(/import \{ BackupSection \} from '\.\/settings\/BackupSection';/);
    expect(codigo.match(/<BackupSection\b/g)).toHaveLength(1);
    expect(codigo).toMatch(/<BackupSection cardStyle=\{cardStyle\} \/>/);
  });

  it('não tem mais o botão antigo, que só exportava as configurações e não restaurava nada', () => {
    expect(codigo).not.toMatch(/handleBackup/);
    expect(codigo).not.toMatch(/irisflow_backup\.json/);
    expect(codigo).not.toMatch(/settings\.backup\./);
  });

  // A seção nova tem o texto escrito em pt-BR, direto no componente. As chaves da seção antiga (`settings.backup.title`
  // e `.export`) ficaram sem uso nos dois idiomas; deixá-las ali faz quem traduzir achar que ainda valem (rodada 1, 21/10/2026).
  it('as chaves de tradução do botão antigo (settings.backup.*) saíram dos dois idiomas: não ficam órfãs', () => {
    for (const idioma of ['pt-BR', 'en']) {
      const textos = JSON.parse(readFileSync(resolve(AQUI, '..', 'i18n', 'locales', `${idioma}.json`), 'utf8')) as { settings: Record<string, unknown> };
      expect(textos.settings, idioma).not.toHaveProperty('backup');
    }
  });

  it('tirar as órfãs não leva junto as vizinhas: o resto de "settings" continua nos dois idiomas', () => {
    for (const idioma of ['pt-BR', 'en']) {
      const textos = JSON.parse(readFileSync(resolve(AQUI, '..', 'i18n', 'locales', `${idioma}.json`), 'utf8')) as { settings: Record<string, unknown> };
      for (const vizinha of ['voice', 'dashboardLink', 'logout', 'returnToMenu', 'language']) {
        expect(textos.settings, `${idioma}: ${vizinha}`).toHaveProperty(vizinha);
      }
    }
  });
});
