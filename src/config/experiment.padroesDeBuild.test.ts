import { describe, it, expect } from 'vitest';
import { aplicarPadroesDeBuild, DEFAULTS } from './experiment';

/**
 * Padrões de EMPACOTAMENTO (release.yml → IRISFLOW_BUILD_L2CS → `define` do
 * Vite → `aplicarPadroesDeBuild`). O release da beta passa `auto` (com os
 * pesos, desde a 1.0.0-beta.10); `off` sai sem o L2CS. Fora de um build do
 * Vite nada muda. O padrão do release.yml tem teste em src/empacotamento.test.ts.
 */
describe('padrões de build', () => {
  it('fora de um build do Vite (testes, Node) os padrões são os do código', () => {
    expect(DEFAULTS.l2cs).toBe('auto');
  });

  it('o release sem L2CS troca só o l2cs', () => {
    const r = aplicarPadroesDeBuild(DEFAULTS, { l2cs: 'off' });
    expect(r.l2cs).toBe('off');
    expect({ ...r, l2cs: DEFAULTS.l2cs }).toEqual(DEFAULTS);
  });

  it('não altera o objeto recebido', () => {
    const base = { ...DEFAULTS };
    aplicarPadroesDeBuild(base, { l2cs: 'off' });
    expect(base.l2cs).toBe('auto');
  });

  it('valor fora da lista fechada, chave desconhecida ou lixo não mudam nada', () => {
    expect(aplicarPadroesDeBuild(DEFAULTS, { l2cs: 'desligado' })).toEqual(DEFAULTS);
    expect(aplicarPadroesDeBuild(DEFAULTS, { cursorSizePx: 999, blinkClick: true })).toEqual(DEFAULTS);
    expect(aplicarPadroesDeBuild(DEFAULTS, undefined)).toEqual(DEFAULTS);
    expect(aplicarPadroesDeBuild(DEFAULTS, 'off')).toEqual(DEFAULTS);
    expect(aplicarPadroesDeBuild(DEFAULTS, ['off'])).toEqual(DEFAULTS);
  });
});
