import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildL2CSBlock,
  ultimoDiagnosticoDoBloco,
  L2CS_CONFIDENCE_MIN,
  reiniciarReusoDoBloco,
  setReusoMaxMs,
  REUSO_MAX_MS,
} from './block';

/**
 * As três causas de bloco zerado produzem sete zeros idênticos. Quem consome o
 * vetor (a calibração) só via "tudo zero" e reportava as três como "o sistema
 * perdeu o olhar" — que só descreve UMA delas. Culpar o olhar do paciente por
 * um limiar de confiança do modelo faz a pessoa tentar se mexer menos, sem
 * efeito nenhum, porque a causa não é movimento.
 */
describe('buildL2CSBlock — motivo do bloco zerado', () => {
  const DIST = 1;
  const zerado = (b: number[]) => b.every((v) => v === 0);

  it('leitura obsoleta é "stale"', () => {
    expect(zerado(buildL2CSBlock(0.1, 0.1, false, DIST, 0.9))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('stale');
  });

  it('ângulo fora da faixa é "implausivel", com o pitch em graus', () => {
    // 0,9 rad ≈ 51°, acima do limite de plausibilidade (~35°).
    expect(zerado(buildL2CSBlock(0.1, 0.9, true, DIST, 0.9))).toBe(true);
    const d = ultimoDiagnosticoDoBloco();
    expect(d.motivo).toBe('implausivel');
    expect(Math.abs(d.pitchDeg)).toBeGreaterThan(50);
  });

  it('softmax difusa é "confianca", e carrega o valor medido', () => {
    const conf = L2CS_CONFIDENCE_MIN - 0.01;
    expect(zerado(buildL2CSBlock(0.05, 0.05, true, DIST, conf))).toBe(true);
    const d = ultimoDiagnosticoDoBloco();
    expect(d.motivo).toBe('confianca');
    expect(d.confidence).toBeCloseTo(conf, 5);
  });

  it('bloco válido não marca motivo', () => {
    expect(zerado(buildL2CSBlock(0.05, 0.05, true, DIST, 0.9))).toBe(false);
    expect(ultimoDiagnosticoDoBloco().motivo).toBeNull();
  });
});

/**
 * Reuso do último ângulo válido (item "leitura velha"): stale e confiança
 * baixa isolada deixam de virar sete zeros — o degrau que fazia o Ridge saltar
 * e o One Euro travar — enquanto o último ângulo bom tiver menos de 600 ms.
 */
describe('buildL2CSBlock — reuso do último ângulo válido', () => {
  const DIST = 1;
  const zerado = (b: number[]) => b.every((v) => v === 0);

  beforeEach(() => reiniciarReusoDoBloco());

  it('stale dentro de 600 ms reutiliza o ângulo anterior e marca "stale-reuso"', () => {
    const bom = buildL2CSBlock(0.2, -0.1, true, DIST, 0.9, 1000);
    expect(ultimoDiagnosticoDoBloco().motivo).toBeNull();
    const reusado = buildL2CSBlock(0, 0, false, DIST, undefined, 1400);
    expect(reusado).toEqual(bom);
    const d = ultimoDiagnosticoDoBloco();
    expect(d.motivo).toBe('stale-reuso');
    expect(d.reusoDeMs).toBe(400);
    expect(d.yawDeg).toBeCloseTo(0.2 * 180 / Math.PI, 6);
  });

  it('passados 600 ms, volta a zerar com "stale"', () => {
    buildL2CSBlock(0.2, -0.1, true, DIST, 0.9, 1000);
    expect(zerado(buildL2CSBlock(0, 0, false, DIST, undefined, 1601))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('stale');
    expect(ultimoDiagnosticoDoBloco().reusoDeMs).toBeNull();
  });

  it('confiança baixa isolada (1–2 leituras) reutiliza; persistente, zera', () => {
    const bom = buildL2CSBlock(0.1, 0.05, true, DIST, 0.9, 0);
    const conf = L2CS_CONFIDENCE_MIN - 0.01;
    expect(buildL2CSBlock(0.3, 0.3, true, DIST, conf, 100)).toEqual(bom);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('stale-reuso');
    expect(buildL2CSBlock(0.3, 0.3, true, DIST, conf, 260)).toEqual(bom);
    // Quarta inferência ruim seguida a 160 ms: já passou dos 600 ms.
    expect(zerado(buildL2CSBlock(0.3, 0.3, true, DIST, conf, 640))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('confianca');
  });

  it('ângulo implausível NUNCA é reutilizado — lixo não é atraso', () => {
    buildL2CSBlock(0.1, 0.05, true, DIST, 0.9, 0);
    expect(zerado(buildL2CSBlock(0.1, 0.9, true, DIST, 0.9, 100))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('implausivel');
  });

  it('sem `nowMs` (gravações, chamadores antigos) não há reuso', () => {
    buildL2CSBlock(0.1, 0.05, true, DIST, 0.9);
    expect(zerado(buildL2CSBlock(0, 0, false, DIST, 0.9))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('stale');
  });

  it('a janela é configurável', () => {
    setReusoMaxMs(100);
    buildL2CSBlock(0.1, 0.05, true, DIST, 0.9, 0);
    expect(zerado(buildL2CSBlock(0, 0, false, DIST, undefined, 150))).toBe(true);
    setReusoMaxMs(REUSO_MAX_MS);
  });
});
