import { describe, it, expect } from 'vitest';
import { ordemDaGrade, TOLERANCIA_DE_LINHA_PCT } from './ordemDaGrade';

/**
 * O percurso da bola é o que o paciente segue com os olhos. Um alvo fora de
 * ordem vira um salto atravessando a tela, e o olho chega atrasado ao alvo
 * novo — que é justamente o intervalo em que a coleta está aberta.
 */
describe('ordemDaGrade', () => {
  it('devolve a grade de 9 na ordem de leitura, mesmo embaralhada na entrada', () => {
    // Entrada fora de ordem de propósito.
    const pontos = [
      { x: 90, y: 90 },
      { x: 50, y: 10 },
      { x: 10, y: 50 },
      { x: 90, y: 10 },
      { x: 50, y: 90 },
      { x: 10, y: 10 },
      { x: 90, y: 50 },
      { x: 10, y: 90 },
      { x: 50, y: 50 },
    ];
    const ordem = ordemDaGrade(pontos);
    expect(ordem.map((i) => pontos[i])).toEqual([
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 90, y: 10 },
      { x: 10, y: 50 },
      { x: 50, y: 50 },
      { x: 90, y: 50 },
      { x: 10, y: 90 },
      { x: 50, y: 90 },
      { x: 90, y: 90 },
    ]);
  });

  it('começa sempre pelo canto superior esquerdo', () => {
    const pontos = [
      { x: 90, y: 90 },
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 10, y: 90 },
    ];
    expect(pontos[ordemDaGrade(pontos)[0]]).toEqual({ x: 10, y: 10 });
  });

  it('trata `y` quase igual como a MESMA linha — senão a bola ziguezagueia', () => {
    // Diferença dentro da tolerância: é uma linha só, ordenada por `x`.
    const pontos = [
      { x: 90, y: 12 },
      { x: 10, y: 10 },
      { x: 50, y: 11 },
    ];
    expect(ordemDaGrade(pontos).map((i) => pontos[i].x)).toEqual([10, 50, 90]);
  });

  it('separa linhas quando a distância vertical passa da tolerância', () => {
    const pontos = [
      { x: 50, y: 10 + TOLERANCIA_DE_LINHA_PCT + 1 },
      { x: 10, y: 10 },
    ];
    expect(ordemDaGrade(pontos).map((i) => pontos[i].y)).toEqual([10, 19]);
  });

  it('é uma permutação: nenhum alvo some nem se repete', () => {
    const pontos = Array.from({ length: 13 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 61) % 100 }));
    const ordem = ordemDaGrade(pontos);
    expect([...ordem].sort((a, b) => a - b)).toEqual(pontos.map((_, i) => i));
  });

  it('lista vazia devolve lista vazia', () => {
    expect(ordemDaGrade([])).toEqual([]);
  });
});
