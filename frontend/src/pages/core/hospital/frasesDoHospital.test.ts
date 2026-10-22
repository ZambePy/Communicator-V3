import { describe, it, expect, vi } from 'vitest';

// -----------------------------------------------------------------------------
// As frases do quarto e o cache da voz clonada (rodada 3, 21/10/2026).
//
// Com a voz clonada ligada, uma frase que nunca foi dita espera até 4 s pela
// geração e depois cai para a voz do sistema; o cuidador "prepara as frases
// rápidas" justamente para isso não acontecer. "Preciso de aspiração" não pode
// esperar 4 s: toda frase que a tela do quarto fala tem de estar na lista que a
// preparação manda para o cache.
// -----------------------------------------------------------------------------

vi.mock('../../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: unknown }) => children,
}));

const { TEXTOS_DO_HOSPITAL, FRASE_DO_CHAMADO, FRASES_DAS_NECESSIDADES } = await import('./frasesDoHospital');
const { CARTOES_DO_HOSPITAL } = await import('../HospitalScreen');

describe('as frases do quarto', () => {
  it('a lista do cache traz toda frase que a tela do quarto fala: as necessidades e o chamado', () => {
    const faladas = CARTOES_DO_HOSPITAL.flatMap((c) => (c.tipo === 'frase' ? [c.frase] : []));
    expect(faladas).toHaveLength(6);
    for (const f of faladas) expect(TEXTOS_DO_HOSPITAL, `a frase "${f}" não está na lista do cache`).toContain(f);
    expect(TEXTOS_DO_HOSPITAL).toContain(FRASE_DO_CHAMADO);
  });

  it('não sobra frase na lista que a tela não fale, nem repetida, nem vazia', () => {
    const faladas = new Set<string>([
      ...CARTOES_DO_HOSPITAL.flatMap((c) => (c.tipo === 'frase' ? [c.frase] : [])),
      FRASE_DO_CHAMADO,
    ]);
    expect(new Set(TEXTOS_DO_HOSPITAL).size).toBe(TEXTOS_DO_HOSPITAL.length);
    for (const t of TEXTOS_DO_HOSPITAL) {
      expect(t.trim()).not.toBe('');
      expect(faladas.has(t), `"${t}" está na lista do cache mas nenhum botão a fala`).toBe(true);
    }
  });

  it('as frases são as combinadas com o produto (primeira pessoa, sem pedir mais do que o botão diz)', () => {
    expect(FRASES_DAS_NECESSIDADES).toEqual({
      aspirar: 'Preciso de aspiração.',
      posicao: 'Preciso mudar de posição.',
      sede: 'Estou com sede.',
      frio: 'Estou com frio.',
      calor: 'Estou com calor.',
      familia: 'Chame a minha família, por favor.',
    });
    expect(FRASE_DO_CHAMADO).toBe('Por favor, chame a enfermagem.');
  });
});
