import { describe, expect, it } from 'vitest';
import {
  EstimadorDeFixacao,
  JANELA_BASE_MS,
  JANELA_MAX_MS,
  RAIO_FIM,
  RAIO_INICIO,
  distanciaDeMahalanobis,
  janelaParaRho,
} from './estimadorDeFixacao';

function gerador(semente: number) {
  let s = semente >>> 0 || 1;
  const u = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

const DT = 1000 / 30;
const SIGMA = 40;
const RUIDO = { sxx: SIGMA * SIGMA, syy: SIGMA * SIGMA, sxy: 0 };

/** Ruído AR(1) com o ρ₁ medido no projeto (0,80), desvio `escala·SIGMA`. */
function serieDeRuido(n: number, escala: number, semente: number) {
  const z = gerador(semente);
  const inov = Math.sqrt(1 - 0.8 * 0.8);
  let a = z();
  let b = z();
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) { a = 0.8 * a + inov * z(); b = 0.8 * b + inov * z(); }
    out.push({ x: escala * SIGMA * a, y: escala * SIGMA * b });
  }
  return out;
}

function dp(v: number[]) {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
}

describe('constantes e janela', () => {
  it('raios são √χ²₂ a 99,9 % e 99,99 %', () => {
    expect(RAIO_INICIO ** 2).toBeCloseTo(13.82, 2);
    expect(RAIO_FIM ** 2).toBeCloseTo(18.42, 2);
  });

  it('janela: 600 ms no ρ₁ medido, cresce com ruído mais correlacionado, teto de 1 s', () => {
    expect(janelaParaRho(0.8)).toBeCloseTo(JANELA_BASE_MS, 0);
    expect(janelaParaRho(0.5)).toBe(JANELA_BASE_MS);
    const j85 = janelaParaRho(0.85);
    expect(j85).toBeGreaterThan(JANELA_BASE_MS);
    expect(j85).toBeLessThanOrEqual(JANELA_MAX_MS);
    expect(janelaParaRho(0.97)).toBe(JANELA_MAX_MS);
  });

  it('distância de Mahalanobis', () => {
    expect(distanciaDeMahalanobis(3, 4, { sxx: 1, syy: 1, sxy: 0 })).toBeCloseTo(5, 12);
    expect(distanciaDeMahalanobis(2, 0, { sxx: 4, syy: 1, sxy: 0 })).toBeCloseTo(1, 12);
    expect(distanciaDeMahalanobis(1, 1, { sxx: 1, syy: 1, sxy: 1 })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('EstimadorDeFixacao', () => {
  it('na fixação reduz o tremor bem mais que o estabilizador de 200 ms', () => {
    const e = new EstimadorDeFixacao(JANELA_BASE_MS);
    const serie = serieDeRuido(600, 1, 3);
    const xs: number[] = [];
    serie.forEach((s, i) => {
      const o = e.processar(960 + s.x, 540 + s.y, i * DT, RUIDO);
      if (i >= 60) xs.push(o.x);
    });
    // Média de 600 ms com ρ₁ = 0,8: ~39 % de redução pela conta da PESQUISA
    // §3.4 (núcleo triangular, um pouco menos). O estabilizador de 200 ms
    // ficava em ~17 %.
    expect(dp(xs) / SIGMA).toBeLessThan(0.75);
  });

  it('sacada de 10σ: a saída chega em até dois quadros, sem arrasto', () => {
    const e = new EstimadorDeFixacao(JANELA_BASE_MS);
    const z = gerador(21);
    let t = 0;
    for (let i = 0; i < 60; i++, t += DT) e.processar(500 + 5 * z(), 500 + 5 * z(), t, RUIDO);
    const alvo = { x: 500 + 10 * SIGMA, y: 500 };
    const saidas: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++, t += DT) saidas.push(e.processar(alvo.x + 5 * z(), alvo.y + 5 * z(), t, RUIDO));
    // Quadro 1: segura (antecipação). Quadro 2: fixação nova com as duas.
    expect(saidas[0].x).toBeLessThan(520);
    expect(Math.abs(saidas[1].x - alvo.x)).toBeLessThan(20);
    expect(Math.abs(saidas[5].x - alvo.x)).toBeLessThan(10);
  });

  it('pico de um quadro é descartado e a saída não se mexe', () => {
    const e = new EstimadorDeFixacao(JANELA_BASE_MS);
    let t = 0;
    let antes = { x: 0, y: 0 };
    for (let i = 0; i < 40; i++, t += DT) antes = e.processar(700, 400, t, RUIDO);
    const noPico = e.processar(700 + 15 * SIGMA, 400 - 10 * SIGMA, t, RUIDO); t += DT;
    const depois = e.processar(700, 400, t, RUIDO);
    expect(noPico.x).toBeCloseTo(antes.x, 6);
    expect(depois.x).toBeCloseTo(700, 6);
    expect(depois.y).toBeCloseTo(400, 6);
  });

  it('ruído maior que o da calibração: a escala sobe e a saída não salta', () => {
    const e = new EstimadorDeFixacao(JANELA_BASE_MS);
    let saltos = 0;
    let anterior: { x: number; y: number } | null = null;
    serieDeRuido(900, 1.6, 8).forEach((s, i) => {
      const o = e.processar(960 + s.x, 540 + s.y, i * DT, RUIDO);
      if (anterior && i > 120 && Math.hypot(o.x - anterior.x, o.y - anterior.y) > 1.5 * SIGMA) saltos++;
      anterior = o;
    });
    expect(e.escala).toBeGreaterThan(1.5);
    expect(e.escala).toBeLessThanOrEqual(4);
    // Em 26 s de fixação, quase nenhum salto maior que 1,5σ da calibração.
    expect(saltos).toBeLessThan(5);
  });

  it('reiniciar recomeça a fixação e mantém a escala da sessão', () => {
    const e = new EstimadorDeFixacao(JANELA_BASE_MS);
    serieDeRuido(300, 1.6, 12).forEach((s, i) => e.processar(s.x, s.y, i * DT, RUIDO));
    const escala = e.escala;
    e.reiniciar();
    expect(e.escala).toBe(escala);
    const o = e.processar(1234, 567, 400 * DT, RUIDO);
    expect(o).toEqual({ x: 1234, y: 567 });
  });

  it('entrada não finita devolve a estimativa atual', () => {
    const e = new EstimadorDeFixacao(JANELA_BASE_MS);
    e.processar(100, 200, 0, RUIDO);
    e.processar(102, 198, DT, RUIDO);
    const o = e.processar(Number.NaN, 5, 2 * DT, RUIDO);
    expect(o.x).toBeCloseTo(101, 0);
    expect(o.y).toBeCloseTo(199, 0);
  });
});
