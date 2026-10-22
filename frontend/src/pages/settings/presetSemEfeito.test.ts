import { describe, it, expect } from 'vitest';
import { textoDoPresetSemEfeito } from './presetSemEfeito';

// Auditoria A2 (19/10/2026): com o estimador de fixação (M9) governando o
// cursor, escolher um preset do One Euro não muda nada — e a tela marcava o
// botão como se valesse.

describe('textoDoPresetSemEfeito', () => {
  it('o preset passou a governar: nenhuma nota', () => {
    expect(textoDoPresetSemEfeito({ aplicado: true, emVigor: 'oneEuro' })).toBeNull();
  });

  it('sem engine: nada a dizer', () => {
    expect(textoDoPresetSemEfeito(null)).toBeNull();
    expect(textoDoPresetSemEfeito(undefined)).toBeNull();
  });

  it('M9 em vigor: diz quem suaviza o cursor e que o preset fica guardado', () => {
    const t = textoDoPresetSemEfeito({ aplicado: false, emVigor: 'fixacao' });
    expect(t).toMatch(/estimador de fixação/);
    expect(t).toMatch(/fica guardado e não muda o cursor/);
  });

  it('cadeia Kalman em vigor: o nome dela, sem código interno', () => {
    expect(textoDoPresetSemEfeito({ aplicado: false, emVigor: 'kalman' })).toMatch(/filtro de Kalman:/);
    const ema = textoDoPresetSemEfeito({ aplicado: false, emVigor: 'kalmanEma' });
    expect(ema).toMatch(/Kalman com média móvel/);
    expect(ema).not.toMatch(/kalmanEma/);
  });
});
