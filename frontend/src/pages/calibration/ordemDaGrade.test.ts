import { describe, it, expect } from 'vitest';
import {
  metricasDaOrdem,
  ordemDaGrade,
  ordemDaSequencia,
  ordemDescorrelacionada,
  TOLERANCIA_DE_LINHA_PCT,
  type PontoDaGrade,
} from './ordemDaGrade';

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

/**
 * A ordem descorrelacionada (M1) tem de cumprir três coisas ao mesmo tempo:
 * não andar junto com x nem com y (senão a deriva da cabeça vira ganho no
 * ajuste), começar no centro (o baseline de pose nasce no primeiro alvo) e não
 * fazer a bola atravessar a tela mais do que a ordem de leitura fazia.
 */
describe('ordemDescorrelacionada', () => {
  /** Grade padrão numa geometria: colunas `xs`, linhas `ys` (em %), cantos a 5 %. */
  function gradePadrao(xs: number[], ys: number[], comAlvoInferior = false): PontoDaGrade[] {
    const pts: PontoDaGrade[] = [];
    for (const y of ys) for (const x of xs) pts.push({ x, y });
    pts.push({ x: 5, y: 5 }, { x: 95, y: 5 }, { x: 5, y: 95 }, { x: 95, y: 95 });
    if (comAlvoInferior) pts.push({ x: 50, y: 95 });
    return pts;
  }

  // Referência: 23,6" 1920×1080 a 60 cm → colunas a 17,1/50/82,9 % e linhas a
  // 5/50/83,75 % (calibration.ts, orçamento de 16°/12°).
  const REFERENCIA = gradePadrao([17.1, 50, 82.9], [5, 50, 83.75]);

  const GEOMETRIAS: Array<{ nome: string; pontos: PontoDaGrade[]; proporcao: number; limite: number }> = [
    { nome: 'referência 23,6" 16:9', pontos: REFERENCIA, proporcao: 16 / 9, limite: 0.1 },
    {
      nome: 'referência com o 14º alvo',
      pontos: gradePadrao([17.1, 50, 82.9], [5, 50, 83.75], true),
      proporcao: 16 / 9,
      limite: 0.1,
    },
    // Tela pequena: o orçamento angular satura e a grade encosta nos cantos.
    { nome: '14" 1366×768', pontos: gradePadrao([5, 50, 95], [5, 50, 83.75]), proporcao: 1366 / 768, limite: 0.15 },
    { nome: '16:10', pontos: gradePadrao([10, 50, 90], [5, 50, 83.75]), proporcao: 16 / 10, limite: 0.15 },
    { nome: '27" a 70 cm', pontos: gradePadrao([20, 50, 80], [10, 50, 80], true), proporcao: 16 / 9, limite: 0.15 },
  ];

  for (const g of GEOMETRIAS) {
    it(`${g.nome}: sem correlação com x nem y, caminho e maior salto menores que os da leitura`, () => {
      const ordem = ordemDescorrelacionada(g.pontos, g.proporcao);
      const m = metricasDaOrdem(g.pontos, ordem, g.proporcao);
      const leitura = metricasDaOrdem(g.pontos, ordemDaGrade(g.pontos), g.proporcao);
      expect(Math.abs(m.rTx)).toBeLessThanOrEqual(g.limite);
      expect(Math.abs(m.rTy)).toBeLessThanOrEqual(g.limite);
      // A leitura anda junto com y (r ≈ 0,95): é exatamente o que se evita.
      expect(Math.abs(leitura.rTy)).toBeGreaterThan(0.9);
      expect(m.caminho).toBeLessThan(leitura.caminho);
      expect(m.maiorTrecho).toBeLessThanOrEqual(leitura.maiorTrecho + 1e-9);
      // Deriva que curva e volta, e os termos quadráticos do modelo.
      expect(Math.abs(m.rT2x)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(m.rT2y)).toBeLessThanOrEqual(0.15);
      expect(m.rTQuadMax).toBeLessThanOrEqual(0.15);
    });
  }

  it('começa no alvo do centro', () => {
    const ordem = ordemDescorrelacionada(REFERENCIA, 16 / 9);
    expect(REFERENCIA[ordem[0]]).toEqual({ x: 50, y: 50 });
  });

  it('é determinística: a mesma entrada dá sempre a mesma ordem', () => {
    const a = ordemDescorrelacionada(REFERENCIA, 16 / 9);
    const b = ordemDescorrelacionada([...REFERENCIA], 16 / 9);
    expect(a).toEqual(b);
  });

  it('é uma permutação, também no perfil do computador (13 alvos a 2 %)', () => {
    const pts: PontoDaGrade[] = [];
    for (const y of [2, 50, 98]) for (const x of [2, 50, 98]) pts.push({ x, y });
    pts.push({ x: 26, y: 26 }, { x: 74, y: 26 }, { x: 26, y: 74 }, { x: 74, y: 74 });
    const ordem = ordemDescorrelacionada(pts, 16 / 9);
    expect([...ordem].sort((a, b) => a - b)).toEqual(pts.map((_, i) => i));
    const m = metricasDaOrdem(pts, ordem, 16 / 9);
    expect(Math.abs(m.rTx)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(m.rTy)).toBeLessThanOrEqual(0.1);
  });

  it('modo rápido (4 cantos): busca exaustiva, menos correlação vertical que a leitura', () => {
    const pts = [
      { x: 17, y: 5 },
      { x: 83, y: 5 },
      { x: 17, y: 84 },
      { x: 83, y: 84 },
    ];
    const ordem = ordemDescorrelacionada(pts, 16 / 9);
    expect([...ordem].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    const m = metricasDaOrdem(pts, ordem, 16 / 9);
    const leitura = metricasDaOrdem(pts, ordemDaGrade(pts), 16 / 9);
    expect(Math.abs(m.rTy)).toBeLessThan(Math.abs(leitura.rTy));
  });

  it('um ou dois alvos: devolve na ordem recebida', () => {
    expect(ordemDescorrelacionada([{ x: 10, y: 10 }])).toEqual([0]);
    expect(ordemDescorrelacionada([{ x: 10, y: 10 }, { x: 90, y: 90 }])).toEqual([0, 1]);
  });

  it('ordemDaSequencia: com a flag desligada é a ordem de leitura, bit a bit', () => {
    expect(ordemDaSequencia(REFERENCIA, false)).toEqual(ordemDaGrade(REFERENCIA));
    expect(ordemDaSequencia(REFERENCIA, true, 16 / 9)).toEqual(ordemDescorrelacionada(REFERENCIA, 16 / 9));
  });
});
