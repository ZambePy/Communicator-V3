import { describe, expect, it } from 'vitest';
import { FRACAO_DO_ESPACO, FRACAO_MINIMA, calcularCascata, palavraEmComposicao } from './dwellEmCascata';

const BASE = 1500;

describe('dwell em cascata (M17)', () => {
  it('piso cai 10 % por letra da palavra e volta no espaço', () => {
    const c0 = calcularCascata({ texto: '', candidatas: [], palavraConhecida: false, baseMs: BASE });
    expect(c0.pisoMs).toBe(BASE);
    const c3 = calcularCascata({ texto: 'OLA TUD', candidatas: [], palavraConhecida: false, baseMs: BASE });
    expect(c3.pisoMs).toBeCloseTo(BASE * 0.7, 9);
    const depois = calcularCascata({ texto: 'TUDO ', candidatas: [], palavraConhecida: false, baseMs: BASE });
    expect(depois.pisoMs).toBe(BASE);
  });

  it('nunca abaixo de 10 % da base (a razão 100/1000 ms do estudo)', () => {
    const c = calcularCascata({ texto: 'ANTICONSTITUCIONAL', candidatas: ['ANTICONSTITUCIONALMENTE'], palavraConhecida: false, baseMs: BASE });
    expect(c.pisoMs).toBeCloseTo(BASE * FRACAO_MINIMA, 9);
    expect(c.dwellDaLetra('M')).toBeCloseTo(BASE * FRACAO_MINIMA, 9);
  });

  it('só as letras que continuam uma candidata aceleram; as outras ficam na base', () => {
    const c = calcularCascata({ texto: 'QUE', candidatas: ['QUERO', 'QUEM', 'QUENTE', 'ÁGUA'], palavraConhecida: true, baseMs: BASE });
    expect([...c.letrasProvaveis].sort()).toEqual(['M', 'N', 'R']);
    expect(c.dwellDaLetra('R')).toBeCloseTo(BASE * 0.7, 9);
    expect(c.dwellDaLetra('X')).toBe(BASE);
    expect(c.dwellDoGrupo(['M', 'N', 'O'])).toBeCloseTo(BASE * 0.7, 9);
    expect(c.dwellDoGrupo(['S', 'T', 'U'])).toBe(BASE);
  });

  it('acento não atrapalha: "Ã" continua "A"', () => {
    const c = calcularCascata({ texto: 'NA', candidatas: ['NÃO'], palavraConhecida: false, baseMs: BASE });
    expect(c.letrasProvaveis.has('O')).toBe(true);
    const d = calcularCascata({ texto: 'N', candidatas: ['NÃO'], palavraConhecida: false, baseMs: BASE });
    expect(d.dwellDaLetra('ã')).toBeCloseTo(BASE * 0.9, 9);
  });

  it('espaço a 2/3 da base depois de palavra conhecida; na base sem palavra', () => {
    const c = calcularCascata({ texto: 'CASA', candidatas: [], palavraConhecida: true, baseMs: BASE });
    expect(c.espacoMs).toBeCloseTo(BASE * FRACAO_DO_ESPACO, 9);
    expect(calcularCascata({ texto: 'CASA', candidatas: [], palavraConhecida: false, baseMs: BASE }).espacoMs).toBe(BASE);
    expect(calcularCascata({ texto: '', candidatas: [], palavraConhecida: true, baseMs: BASE }).espacoMs).toBe(BASE);
  });

  it('nunca abaixo do mínimo do app, e o mínimo nunca atrasa quem já está abaixo dele', () => {
    // Base de 800 ms (o atalho "rápido") e palavra longa: 10 % dariam 80 ms,
    // abaixo dos 400 ms em que o clique dispara antes de a fixação estabilizar.
    const c = calcularCascata({
      texto: 'COMUNICA', candidatas: ['COMUNICAR'], palavraConhecida: true, baseMs: 800, minimoMs: 400,
    });
    expect(c.pisoMs).toBe(400);
    expect(c.dwellDaLetra('R')).toBe(400);
    expect(c.espacoMs).toBe(Math.max(400, 800 * FRACAO_DO_ESPACO));
    // Com base abaixo do mínimo, a cascata não acelera nem atrasa: fica na base.
    const lenta = calcularCascata({ texto: 'COMUNICA', candidatas: ['COMUNICAR'], palavraConhecida: true, baseMs: 300, minimoMs: 400 });
    expect(lenta.dwellDaLetra('R')).toBe(300);
  });

  it('palavra em composição é o que vem depois do último espaço', () => {
    expect(palavraEmComposicao('EU QUERO AG')).toBe('AG');
    expect(palavraEmComposicao('EU ')).toBe('');
  });
});
