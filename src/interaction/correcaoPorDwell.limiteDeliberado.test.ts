import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXPERIMENT } from '../config/experiment';
import {
  TETO_NORMALIZADO,
  corrigirDerivaPeloCentro,
  corrigirPorDwell,
  corrigirPorPontos,
  definirCorrecaoLigada,
  diagnosticoDaCorrecao,
  reiniciarCorrecao,
} from './correcaoPorDwell';

// M24 — uma medida DELIBERADA (reajuste pelo centro, recalibração rápida) é
// aceita até o DOBRO do teto; o deslocamento aprendido continua no teto.
//
// Antes, um resíduo acima do teto (8 % da tela: ~150 px na horizontal, ~86 px
// na vertical) era recusado inteiro. Nos 15 relatórios reais de 05/09–25/10/2026
// isso recusava o reajuste pelo centro em 8 sessões — justamente as de erro
// maior, onde corrigir mais importa. Aceitando até o dobro, com o deslocamento
// limitado ao teto como sempre: reajuste pelo centro 2,15° → 1,97° (6 sessões
// melhoram, 1 piora 0,05°) e recalibração pelos 4 cantos internos 2,02° → 1,76°
// (3 melhoram de 0,6° a 1,7°, nenhuma piora) — docs/MEDICOES.md §14.8.

const viewport = { largura: 1920, altura: 1080 };
const ctx = { viewport, pose: { yaw: 0, pitch: 0 }, distanciaPx: 2268, rho1: 0.8 };
const medida = { amostras: 60, dispersao: { x: 20 / 1920, y: 20 / 1080 } };

const salvo = {
  kalman: EXPERIMENT.correcaoPorDwellKalman,
  afim: EXPERIMENT.correcaoPorDwellAfim,
  m23: EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada,
  m24: EXPERIMENT.medidaDeliberadaAteODobroDoTeto,
};
beforeEach(() => {
  EXPERIMENT.correcaoPorDwellKalman = true;
  EXPERIMENT.correcaoPorDwellAfim = false;
  EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = true;
  EXPERIMENT.medidaDeliberadaAteODobroDoTeto = true;
  reiniciarCorrecao();
  definirCorrecaoLigada(true);
  corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctx);
});
afterEach(() => {
  EXPERIMENT.correcaoPorDwellKalman = salvo.kalman;
  EXPERIMENT.correcaoPorDwellAfim = salvo.afim;
  EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = salvo.m23;
  EXPERIMENT.medidaDeliberadaAteODobroDoTeto = salvo.m24;
  reiniciarCorrecao();
});

describe('M24 — reajuste pelo centro acima do teto', () => {
  it('resíduo de 12 % da tela (entre o teto e o dobro): aplica', () => {
    expect(corrigirDerivaPeloCentro({ x: 0.12, y: 0 }, 5000, medida)).toBe(true);
    // Com M23, k = 3600/(3600 + 87,3 + 3072,3) = 0,5326 → 0,12·1920·0,5326 = 122,7 px.
    expect(diagnosticoDaCorrecao().deslocamentoPx!.x).toBeCloseTo(122.7, 0);
  });

  it('o deslocamento aprendido continua no teto', () => {
    // Sem M23 o reajuste toma quase tudo (k = 0,976): 0,15·1920·0,976 = 281 px,
    // e o teto o leva a 0,08·1920 = 153,6 px.
    EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = false;
    expect(corrigirDerivaPeloCentro({ x: 0.15, y: 0 }, 5000, medida)).toBe(true);
    expect(diagnosticoDaCorrecao().deslocamentoPx!.x).toBeCloseTo(TETO_NORMALIZADO * 1920, 0);
  });

  it('acima do dobro do teto, recusa: é caso de calibrar de novo', () => {
    expect(corrigirDerivaPeloCentro({ x: 0.17, y: 0 }, 5000, medida)).toBe(false);
  });

  it('desligada (pipeline base): recusa acima do teto, como antes', () => {
    EXPERIMENT.medidaDeliberadaAteODobroDoTeto = false;
    expect(corrigirDerivaPeloCentro({ x: 0.12, y: 0 }, 5000, medida)).toBe(false);
  });

  it('sem o Kalman (integrador), o limite é o teto: lá o resíduo SUBSTITUI o deslocamento, sem teto depois', () => {
    EXPERIMENT.correcaoPorDwellKalman = false;
    reiniciarCorrecao();
    definirCorrecaoLigada(true);
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctx);
    expect(corrigirDerivaPeloCentro({ x: 0.12, y: 0 }, 5000, medida)).toBe(false);
  });
});

describe('M24 — recalibração rápida acima do teto', () => {
  // Quatro pontos com o mesmo resíduo de (−0,12; 0) da tela = 230,4 px.
  const pontos = [
    { x: 480, y: 270 }, { x: 1440, y: 270 }, { x: 1440, y: 810 }, { x: 480, y: 810 },
  ].map((alvo) => ({ alvo, mediana: { x: alvo.x + 230.4, y: alvo.y }, dispersao: { x: 25, y: 25 }, amostras: 36 }));

  it('aplica entre o teto e o dobro, e o deslocamento fica no teto', () => {
    expect(corrigirPorPontos(pontos, 1000, viewport)).toBe(true);
    // R = 215,1 + 3072,3; 4 medidas → fração 0,814 → −187,6 px → teto −153,6 px.
    expect(diagnosticoDaCorrecao().deslocamentoPx!.x).toBeCloseTo(-TETO_NORMALIZADO * 1920, 0);
  });

  it('desligada: recusa, como antes', () => {
    EXPERIMENT.medidaDeliberadaAteODobroDoTeto = false;
    expect(corrigirPorPontos(pontos, 1000, viewport)).toBe(false);
  });
});
