import { describe, expect, it } from 'vitest';
import {
  ALTURA_DO_TITULO_DA_FAIXA,
  ALTURA_MINIMA_DO_REGISTRO,
  VAO_DA_FAIXA,
  VAO_ENTRE_REGISTRO_E_FAIXA,
  faixaCabeNaColuna,
  planejarFaixa,
} from './planoDaFaixaDeRespostas';

// A faixa de respostas fica numa coluna que pode ser estreita (1366 px de tela).
// Cada alvo tem piso no mínimo de 5° (`alvoMinimoPx`): abaixo disso não é alcançável
// pelo olhar. Então o que não cabe numa fileira SAI — as primeiras sugestões, que
// são as mais prováveis, ficam; o "Nenhuma" fica sempre.

const PISO = 198;

describe('planejarFaixa', () => {
  it('sem medida (primeiro quadro, testes sem layout): todas as sugestões e o Nenhuma', () => {
    expect(planejarFaixa({ largura: 0, piso: PISO, quantidade: 4 })).toEqual({ colunas: 5, sugestoes: 4 });
    expect(planejarFaixa({ largura: 0, piso: PISO, quantidade: 2 })).toEqual({ colunas: 3, sugestoes: 2 });
  });

  it('coluna de 1366 px de tela (~650 px): cabem 3 alvos — 2 sugestões e o Nenhuma', () => {
    expect(planejarFaixa({ largura: 653, piso: PISO, quantidade: 4 })).toEqual({ colunas: 3, sugestoes: 2 });
  });

  it('coluna de ~900 px: 3 sugestões e o Nenhuma', () => {
    expect(planejarFaixa({ largura: 900, piso: PISO, quantidade: 4 })).toEqual({ colunas: 4, sugestoes: 3 });
  });

  it('coluna larga: as 4 sugestões e o Nenhuma', () => {
    expect(planejarFaixa({ largura: 1150, piso: PISO, quantidade: 4 })).toEqual({ colunas: 5, sugestoes: 4 });
  });

  it('nunca mais colunas do que sugestões + Nenhuma', () => {
    expect(planejarFaixa({ largura: 1150, piso: PISO, quantidade: 1 })).toEqual({ colunas: 2, sugestoes: 1 });
  });

  it('coluna estreita demais: pelo menos uma sugestão e o Nenhuma', () => {
    expect(planejarFaixa({ largura: 300, piso: PISO, quantidade: 4 })).toEqual({ colunas: 2, sugestoes: 1 });
  });

  it('o piso maior (TV, 100 cm) deixa caber menos', () => {
    expect(planejarFaixa({ largura: 1000, piso: 300, quantidade: 4 })).toEqual({ colunas: 3, sugestoes: 2 });
  });

  it('sem sugestões não há faixa para planejar', () => {
    expect(planejarFaixa({ largura: 900, piso: PISO, quantidade: 0 })).toEqual({ colunas: 1, sugestoes: 0 });
  });

  it('o vão entre alvos é o da conversa', () => {
    expect(VAO_DA_FAIXA).toBe(12);
  });
});

// A pergunta do cuidador é o que o paciente precisa LER. A faixa ocupa ~232 px
// de uma coluna que também guarda o registro de mensagens; se sobrar pouco
// para ele (tela baixa, ou a dica de primeira vez aberta), a faixa não entra —
// uma sugestão que esconde a pergunta que ela responde não serve a ninguém.
// Medido num Chromium com a Conversa montada (21/10/2026).
describe('faixaCabeNaColuna', () => {
  const necessaria = ALTURA_MINIMA_DO_REGISTRO + VAO_ENTRE_REGISTRO_E_FAIXA + ALTURA_DO_TITULO_DA_FAIXA + PISO;

  it('sem medida (primeiro quadro, testes sem layout): cabe, como sempre foi', () => {
    expect(faixaCabeNaColuna({ alturaDaColuna: 0, piso: PISO })).toBe(true);
  });

  it('a conta: registro mínimo, vão, título e um alvo de 5° — nem um pixel a menos', () => {
    expect(faixaCabeNaColuna({ alturaDaColuna: necessaria, piso: PISO })).toBe(true);
    expect(faixaCabeNaColuna({ alturaDaColuna: necessaria - 1, piso: PISO })).toBe(false);
  });

  it.each([
    ['1366×768 com a dica de primeira vez aberta (coluna de 398 px)', 398, true],
    ['1280×720 com a dica aberta (355 px): o registro ficaria com 107 px', 355, false],
    ['1093×614 (1366×768 a 125%) com a dica aberta (282 px): o registro ficaria com 34 px', 282, false],
    ['1093×614 depois da dica (437 px)', 437, true],
    ['1920×1080 (679 px)', 679, true],
  ])('%s', (_nome, alturaDaColuna, cabe) => {
    expect(faixaCabeNaColuna({ alturaDaColuna, piso: PISO })).toBe(cabe);
  });

  it('o piso maior (TV, 100 cm) pede mais altura', () => {
    expect(faixaCabeNaColuna({ alturaDaColuna: 450, piso: 300 })).toBe(false);
    expect(faixaCabeNaColuna({ alturaDaColuna: 490, piso: 300 })).toBe(true);
  });

  it('o registro mínimo cabe a pergunta de duas linhas e o título tem a altura medida', () => {
    expect(ALTURA_MINIMA_DO_REGISTRO).toBe(140);
    expect(ALTURA_DO_TITULO_DA_FAIXA).toBe(34);
    expect(VAO_ENTRE_REGISTRO_E_FAIXA).toBe(16);
  });
});
