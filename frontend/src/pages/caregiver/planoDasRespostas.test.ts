import { describe, expect, it } from 'vitest';
import { planejarRespostas } from './planoDasRespostas';

/* 193 px é o alvo de 5° numa tela de 23,6" 1920×1080 a 60 cm. A coluna da
   direita tem ~850 px de largura nessa tela. */
const PISO = 193;

describe('planejarRespostas', () => {
  it('sem medida, mostra tudo (primeiro quadro e testes sem layout)', () => {
    expect(planejarRespostas({ largura: 0, altura: 0, piso: PISO, quantidade: 8 })).toEqual({
      alturaTopo: null,
      simNaoNaGrade: false,
      colunas: 3,
      linhas: 3,
      porPagina: null,
      fixos: 0,
    });
  });

  it('tela cheia, sem faixas: os oito alvos cabem em duas linhas, sem páginas', () => {
    const plano = planejarRespostas({ largura: 850, altura: 800, piso: PISO, quantidade: 8 });
    expect(plano.porPagina).toBeNull();
    expect(plano.colunas).toBe(4);
    expect(plano.linhas).toBe(2);
    // Sim/Não + vão + duas linhas no piso cabem na altura.
    expect(plano.alturaTopo! + 16 + 2 * PISO + 12).toBeLessThanOrEqual(800);
  });

  it('com a faixa do tutorial e a dica abertas: uma linha embaixo, com "Mais"', () => {
    const plano = planejarRespostas({ largura: 850, altura: 545, piso: PISO, quantidade: 8 });
    expect(plano).toMatchObject({ colunas: 4, linhas: 1, fixos: 1, porPagina: 2 });
    // Nada passa da altura da coluna.
    expect(plano.alturaTopo! + 16 + PISO).toBeLessThanOrEqual(545);
  });

  it('nenhum alvo fica abaixo do piso de 5°', () => {
    for (const [largura, altura] of [[600, 420], [850, 545], [1000, 700], [700, 900]]) {
      const plano = planejarRespostas({ largura, altura, piso: PISO, quantidade: 8 });
      expect((largura - (plano.colunas - 1) * 12) / plano.colunas).toBeGreaterThanOrEqual(PISO);
      expect(plano.alturaTopo!).toBeGreaterThanOrEqual(PISO);
      expect(altura - plano.alturaTopo! - 16 - (plano.linhas - 1) * 12).toBeGreaterThanOrEqual(plano.linhas * PISO);
    }
  });

  it('tela baixa (notebook com as duas faixas): Sim e Não vão para a mesma fileira', () => {
    // 1366×768: alvo de 137 px e ~272 px de altura na coluna — não cabem 2 linhas.
    const plano = planejarRespostas({ largura: 607, altura: 272, piso: 137, quantidade: 8 });
    expect(plano).toMatchObject({ simNaoNaGrade: true, alturaTopo: null, colunas: 4, linhas: 1, fixos: 2, porPagina: 1 });
  });

  it('coluna estreita: duas colunas, e a página nunca fica vazia', () => {
    const plano = planejarRespostas({ largura: 420, altura: 430, piso: PISO, quantidade: 8 });
    expect(plano.colunas).toBe(2);
    expect(plano.porPagina).toBeGreaterThanOrEqual(1);
  });
});
