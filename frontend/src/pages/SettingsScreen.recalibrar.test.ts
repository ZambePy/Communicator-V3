import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const codigo = readFileSync(resolve(AQUI, 'SettingsScreen.tsx'), 'utf8');

/**
 * O painel do teste de precisão tem "Continuar" e "Recalibrar". Rodado pelas
 * Configurações, o callback ignorava a ação: "Recalibrar" fazia o mesmo que
 * "Continuar", e o cuidador que via um erro alto e pedia para recalibrar
 * continuava onde estava (percurso da Fase 8).
 *
 * Contrato estrutural, como em `SettingsScreen.ajustes.test.ts`: montar
 * Configurações inteira exige PIN, nuvem, voz e lembretes. O que importa é o
 * callback do `startAccuracyTest` desta tela receber a ação e levar à
 * calibração quando ela é "redo".
 */
describe('"Recalibrar" no painel do teste rodado pelas Configurações', () => {
  it('leva à calibração', () => {
    expect(codigo).toMatch(
      /startAccuracyTest\(\s*\(r, action\) => \{[\s\S]*?if \(action === 'redo'\) navigate\('\/calibration-check'\);[\s\S]*?\},\s*metaWithUptime,/,
    );
  });
});
