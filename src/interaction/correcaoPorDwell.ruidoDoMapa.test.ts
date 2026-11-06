import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXPERIMENT } from '../config/experiment';
import {
  aprenderComSelecao,
  corrigirDerivaPeloCentro,
  corrigirPorDwell,
  corrigirPorPontos,
  definirCorrecaoLigada,
  diagnosticoDaCorrecao,
  registrarAcaoDoUsuario,
  reiniciarCorrecao,
} from './correcaoPorDwell';

// M23 — o ruído de PADRÃO do mapa entra no R das medidas deliberadas
// (reajuste pelo centro e recalibração rápida).
//
// Um ponto olhado de propósito mede o deslocamento da sessão MAIS o erro de
// padrão do mapa naquele ponto, que é tão grande quanto o próprio
// deslocamento: nos 15 relatórios reais (05/09–25/10/2026), o desvio do erro
// de padrão foi de 47 px em x e 60 px em y, e o do deslocamento entre sessões,
// 43 e 57 px. Com R só da dispersão amostral, o Kalman tomava o resíduo de um
// ponto como o deslocamento inteiro (ganho ≈ 0,98) e o reajuste pelo centro
// PIORAVA o erro médio dos outros pontos. Os números esperados abaixo foram
// calculados à mão com a fórmula do Kalman escalar k = P/(P + r + σ²):
//   P = 60² = 3600 (prior), r = (π/2)·s²/N_eff, σ = d·tan(1,4°).

const viewport = { largura: 1920, altura: 1080 };
const ctxEm = (distanciaPx: number) => ({ viewport, pose: { yaw: 0, pitch: 0 }, distanciaPx, rho1: 0.8 });

const salvo = {
  kalman: EXPERIMENT.correcaoPorDwellKalman,
  afim: EXPERIMENT.correcaoPorDwellAfim,
  m23: EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada,
};

function ligarM23(v: boolean) {
  EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = v;
}

beforeEach(() => {
  EXPERIMENT.correcaoPorDwellKalman = true;
  EXPERIMENT.correcaoPorDwellAfim = false;
  ligarM23(true);
  reiniciarCorrecao();
  definirCorrecaoLigada(true);
});
afterEach(() => {
  EXPERIMENT.correcaoPorDwellKalman = salvo.kalman;
  EXPERIMENT.correcaoPorDwellAfim = salvo.afim;
  ligarM23(salvo.m23);
  reiniciarCorrecao();
});

describe('M23 — reajuste pelo centro com o ruído do mapa', () => {
  // Resíduo de (0,03; −0,02) da tela = (57,6; −21,6) px; 60 quadros com
  // dispersão de 20 px e ρ₁ = 0,8 → N_eff = 7,2 e r = (π/2)·400/7,2 = 87,3 px².
  const medida = { amostras: 60, dispersao: { x: 20 / 1920, y: 20 / 1080 } };

  it('a 2268 px da tela (60 cm na tela de 24"), toma pouco mais da metade do resíduo', () => {
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctxEm(2268));
    expect(corrigirDerivaPeloCentro({ x: 0.03, y: -0.02 }, 5000, medida)).toBe(true);
    // σ = 2268·tan(1,4°) = 55,4 px → k = 3600/(3600 + 87,3 + 3072,3) = 0,533.
    const d = diagnosticoDaCorrecao().deslocamentoPx!;
    expect(d.x).toBeCloseTo(30.7, 0);
    expect(d.y).toBeCloseTo(-11.5, 0);
  });

  it('o ruído do mapa é um ângulo: com a tela mais perto em px, ele pesa menos', () => {
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctxEm(1100));
    expect(corrigirDerivaPeloCentro({ x: 0.03, y: -0.02 }, 5000, medida)).toBe(true);
    // σ = 1100·tan(1,4°) = 26,9 px → k = 3600/(3600 + 87,3 + 722,7) = 0,816.
    expect(diagnosticoDaCorrecao().deslocamentoPx!.x).toBeCloseTo(47.0, 0);
  });

  it('sem a distância da tela, vale o desvio medido de 55 px', () => {
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctxEm(0));
    expect(corrigirDerivaPeloCentro({ x: 0.03, y: -0.02 }, 5000, medida)).toBe(true);
    // σ = 55 px → k = 3600/(3600 + 87,3 + 3025) = 0,536.
    expect(diagnosticoDaCorrecao().deslocamentoPx!.x).toBeCloseTo(30.9, 0);
  });

  it('desligada (pipeline base): quase a substituição, como antes', () => {
    ligarM23(false);
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctxEm(2268));
    expect(corrigirDerivaPeloCentro({ x: 0.03, y: -0.02 }, 5000, medida)).toBe(true);
    // k = 3600/(3600 + 87,3) = 0,976.
    expect(diagnosticoDaCorrecao().deslocamentoPx!.x).toBeCloseTo(56.2, 0);
  });
});

describe('M23 — recalibração rápida (M20) com o ruído do mapa', () => {
  // Cinco pontos com o mesmo deslocamento puro de (30; −20) px, 36 quadros e
  // dispersão de 25 px: N_eff = 4,56 e r = (π/2)·625/4,56 = 215,1 px². Cinco
  // medidas iguais com R = r + σ² dão, na forma de informação,
  // fração = (5/R)/(1/3600 + 5/R).
  const pontos = [
    { x: 960, y: 540 }, { x: 480, y: 270 }, { x: 1440, y: 270 }, { x: 1440, y: 810 }, { x: 480, y: 810 },
  ].map((alvo) => ({
    alvo,
    mediana: { x: alvo.x - 30, y: alvo.y + 20 },
    dispersao: { x: 25, y: 25 },
    amostras: 36,
  }));

  it('cinco pontos pesam mais que um, mas não substituem tudo', () => {
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctxEm(2268));
    expect(corrigirPorPontos(pontos, 1000, viewport)).toBe(true);
    // R = 215,1 + 3072,3 = 3287,4 → fração = 0,8456.
    const d = diagnosticoDaCorrecao().deslocamentoPx!;
    expect(d.x).toBeCloseTo(25.4, 0);
    expect(d.y).toBeCloseTo(-16.9, 0);
  });

  it('com o afim, o ganho de cinco pontos sai encolhido para o prior', () => {
    // Ganho verdadeiro de 5 % em x. Cada ponto informa o ganho com braço de
    // ~480 px e ruído de padrão de ~55 px, ~0,11 de ganho por ponto: com cinco,
    // ~0,05 — o mesmo que o desvio do prior (0,05). O ganho aprendido fica
    // perto da metade do verdadeiro; sem M23 passava de 0,03.
    EXPERIMENT.correcaoPorDwellAfim = true;
    const comGanho = pontos.map(({ alvo, dispersao, amostras }) => ({
      alvo,
      mediana: { x: (alvo.x - 30 + 0.05 * 960) / 1.05, y: alvo.y + 20 },
      dispersao,
      amostras,
    }));
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctxEm(2268));
    expect(corrigirPorPontos(comGanho, 1000, viewport)).toBe(true);
    const g = diagnosticoDaCorrecao().ganho!.x;
    expect(g).toBeGreaterThan(0.01);
    expect(g).toBeLessThan(0.03);
  });

  it('desligada: a medida amostral domina e o deslocamento sai quase inteiro', () => {
    ligarM23(false);
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctxEm(2268));
    expect(corrigirPorPontos(pontos, 1000, viewport)).toBe(true);
    // R = 215,1 → fração = 0,9882.
    expect(diagnosticoDaCorrecao().deslocamentoPx!.x).toBeCloseTo(29.6, 0);
  });
});

describe('M23 não mexe nos rótulos do dwell', () => {
  // Nos relatórios reais, somar o ruído do mapa ao R dos rótulos de uso não
  // ajudou (1,95° → 1,97°): o termo do tamanho do botão já faz esse papel.
  function umRotulo(): number {
    reiniciarCorrecao();
    definirCorrecaoLigada(true);
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctxEm(2268));
    const centro = { x: 1000, y: 500 };
    aprenderComSelecao({
      centroDoAlvo: centro,
      olhar: { x: 940, y: 500 },
      agoraMs: 1000,
      viewport,
      medida: { mediana: { x: 940, y: 500 }, dispersao: { x: 30, y: 30 }, n: 30, saturada: false },
      ladoDoAlvoPx: { largura: 200, altura: 200 },
    });
    registrarAcaoDoUsuario({ desfazer: false, agoraMs: 1500 });
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 10_000, ctxEm(2268));
    return diagnosticoDaCorrecao().deslocamentoPx!.x;
  }

  it('o mesmo rótulo dá o mesmo deslocamento com M23 ligada ou desligada', () => {
    ligarM23(true);
    const com = umRotulo();
    ligarM23(false);
    const sem = umRotulo();
    expect(com).toBeGreaterThan(20);
    expect(com).toBeCloseTo(sem, 9);
  });
});
