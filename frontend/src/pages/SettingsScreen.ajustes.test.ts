import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const codigo = readFileSync(resolve(AQUI, 'SettingsScreen.tsx'), 'utf8');

/**
 * Pedido explícito: a tela de Acessibilidade NÃO tira nenhum ajuste de
 * Configurações. Montar Configurações inteira exige PIN, nuvem, voz e
 * lembretes; o contrato estrutural é o que importa aqui — cada ajuste
 * continua na tela e continua escrevendo no mesmo `updateSettings`.
 */
describe('Configurações mantém todos os ajustes que a Acessibilidade também mostra', () => {
  it.each([
    ['tempo de permanência', /<ControleDeDwell[\s\S]*?updateSettings\(\{ dwellMs: ms \}\)/],
    ['som', /updateSettings\(\{ soundEnabled: !settings\.soundEnabled \}\)/],
    ['brilho (slider)', /id="brightness-ui"[\s\S]*?updateSettings\(\{ brightnessLevel:/],
    ['filtro âmbar', /updateSettings\(\{ amberFilter: !settings\.amberFilter \}\)/],
    ['tema (atrás de TEMA_FIXO)', /TEMA_FIXO === null &&[\s\S]*?updateSettings\(\{ theme:/],
    ['idioma', /<LanguageSwitcher \/>/],
    ['brilho do monitor', /<MonitorBrightnessSlider \/>/],
    ['suavização (modo dev)', /chooseFilterPreset\(preset\)/],
    ['voz personalizada', /aria-labelledby="voice-title"/],
    ['tamanho do monitor', /updateSettings\(\{ screenDiagonalIn: v, screenGeometrySource: 'manual' \}\)/],
    ['distância', /updateSettings\(\{ viewingDistanceCm: v \}\)/],
  ])('%s', (_nome, padrao) => {
    expect(codigo).toMatch(padrao);
  });

  it('ganhou a seção Sobre (Beta, atualizações, tela cheia)', () => {
    expect(codigo).toMatch(/<SobreOIrisFlow /);
  });
});
