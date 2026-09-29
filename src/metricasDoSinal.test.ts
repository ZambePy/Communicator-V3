import { describe, expect, it } from 'vitest';
import { atrasoDoDegrau, autocorrelacaoLag1, lado95, type AmostraDoDegrau } from './metricasDoSinal';

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

describe('autocorrelacaoLag1', () => {
  it('ruído branco ≈ 0; AR(1) ≈ ρ', () => {
    const z = gerador(1);
    const bx = Array.from({ length: 4000 }, z);
    const by = Array.from({ length: 4000 }, z);
    expect(Math.abs(autocorrelacaoLag1(bx, by)!)).toBeLessThan(0.05);
    const ax: number[] = [];
    const ay: number[] = [];
    let a = 0;
    let b = 0;
    for (let i = 0; i < 4000; i++) {
      a = 0.8 * a + 0.6 * z();
      b = 0.8 * b + 0.6 * z();
      ax.push(a);
      ay.push(b);
    }
    expect(autocorrelacaoLag1(ax, ay)!).toBeCloseTo(0.8, 1);
  });

  it('sem dado ou sem variância: null', () => {
    expect(autocorrelacaoLag1([1, 2], [1, 2])).toBeNull();
    expect(autocorrelacaoLag1([3, 3, 3], [1, 1, 1])).toBeNull();
  });
});

describe('lado95', () => {
  it('é duas vezes o p95 da distância de Chebyshev ao alvo', () => {
    const xs = Array.from({ length: 101 }, (_, i) => i);
    const ys = xs.map(() => 0);
    // Distâncias 0..100 do alvo em 0: p95 = 95.
    expect(lado95(xs, ys, { x: 0, y: 0 })).toBeCloseTo(190, 9);
  });

  it('usa o eixo pior de cada amostra', () => {
    expect(lado95([0, 0], [10, -10], { x: 0, y: 0 })).toBeCloseTo(20, 9);
    expect(lado95([], [], { x: 0, y: 0 })).toBeNull();
  });

  it('por janela: o pior ponto da janela manda, e janela maior nunca pede lado menor', () => {
    // Uma excursão de 3 amostras no meio de uma fixação limpa.
    const xs = Array.from({ length: 40 }, (_, i) => (i >= 20 && i < 23 ? 50 : 1));
    const ys = xs.map(() => 0);
    const alvo = { x: 0, y: 0 };
    const k1 = lado95(xs, ys, alvo)!;
    const k10 = lado95(xs, ys, alvo, 10)!;
    // Por amostra, 3/40 fora: o p95 cai na excursão só parcialmente.
    expect(k10).toBeGreaterThanOrEqual(k1);
    // Com janelas de 10, 12 das 31 janelas contêm a excursão: p95 = 50.
    expect(k10).toBeCloseTo(100, 9);
    expect(lado95(xs.slice(0, 5), ys.slice(0, 5), alvo, 10)).toBeNull();
  });
});

describe('atrasoDoDegrau', () => {
  /** Entrada em degrau no instante `t0`; a saída é a entrada atrasada de `atraso` ms. */
  function serie(atraso: number, salto: number, ruido: number, semente = 3): AmostraDoDegrau[] {
    const z = gerador(semente);
    const dt = 1000 / 30;
    const t0 = 300;
    const out: AmostraDoDegrau[] = [];
    for (let i = 0; i < 60; i++) {
      const t = i * dt;
      const e = t >= t0 ? salto : 0;
      const s = t >= t0 + atraso ? salto : 0;
      out.push({ t, ex: e + ruido * z(), ey: ruido * z(), sx: s, sy: 0 });
    }
    return out;
  }

  it('mede o atraso da saída contra a entrada', () => {
    const r = atrasoDoDegrau(serie(100, 400, 5));
    expect(r).not.toBeNull();
    expect(r!.t50Ms).toBeGreaterThan(60);
    expect(r!.t50Ms).toBeLessThan(140);
    expect(r!.t90Ms).toBeGreaterThan(60);
    expect(r!.t90Ms).toBeLessThan(140);
  });

  it('sem atraso dá zero', () => {
    const r = atrasoDoDegrau(serie(0, 400, 0));
    expect(r).toEqual({ t50Ms: 0, t90Ms: 0 });
  });

  it('salto pequeno demais para o ruído não vale como medida', () => {
    expect(atrasoDoDegrau(serie(100, 30, 20))).toBeNull();
    expect(atrasoDoDegrau(serie(100, 400, 5).slice(0, 5))).toBeNull();
  });
});
