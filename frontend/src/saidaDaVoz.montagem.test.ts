import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (rel: string) => readFileSync(resolve(AQUI, rel), 'utf8');

/**
 * A saída da voz para as chamadas (roadmap 3, rodada 3, de 21/10/2026) só vale
 * se estiver LIGADA ao app: a seção em Configurações (onde se escolhe) e o
 * aviso global (que põe o ajuste em vigor ao abrir o app e avisa quando o cabo
 * some). Montar `App` e `SettingsScreen` inteiros exige PIN, nuvem, câmera,
 * voz e lembretes; o contrato estrutural é o que importa aqui — as duas
 * ligações estão no lugar e dentro dos provedores de que dependem.
 */
describe('Configurações mostra a seção "Voz nas chamadas"', () => {
  const tela = ler('pages/SettingsScreen.tsx');

  it('importa e monta a seção, com o estilo de cartão das outras', () => {
    expect(tela).toMatch(/import \{ SaidaDaVozSection \} from '\.\/settings\/SaidaDaVozSection';/);
    expect(tela).toMatch(/<SaidaDaVozSection cardStyle=\{cardStyle\} \/>/);
  });

  it('fica logo depois da voz personalizada (a que ela roteia) e antes do assistente de escrita', () => {
    const voz = tela.indexOf('aria-labelledby="voice-title"');
    const secao = tela.indexOf('<SaidaDaVozSection');
    const assistente = tela.indexOf('aria-labelledby="assistente-title"');
    expect(voz).toBeGreaterThan(-1);
    expect(secao).toBeGreaterThan(voz);
    expect(assistente).toBeGreaterThan(secao);
  });
});

describe('o App monta o aviso da saída da voz', () => {
  const app = ler('App.tsx');

  it('importa e monta o aviso', () => {
    expect(app).toMatch(/import \{ AvisoDaSaidaDaVoz \} from '\.\/components\/AvisoDaSaidaDaVoz';/);
    expect(app).toMatch(/<AvisoDaSaidaDaVoz \/>/);
  });

  it('monta dentro dos provedores de que depende (ajustes, olhar, roteador e emergência), ao lado do aviso de gravação', () => {
    const aviso = app.indexOf('<AvisoDaSaidaDaVoz />');
    expect(aviso).toBeGreaterThan(-1);
    for (const abre of ['<SettingsProvider>', '<GazeProvider>', '<AppRouter>', '<EmergencyProvider>']) {
      const i = app.indexOf(abre);
      expect(i, abre).toBeGreaterThan(-1);
      expect(i, abre).toBeLessThan(aviso);
    }
    // Ao lado do aviso de gravação: o mesmo canto, a mesma família de avisos calmos.
    expect(Math.abs(aviso - app.indexOf('<AvisoDeGravacao />'))).toBeLessThan(80);
  });
});
