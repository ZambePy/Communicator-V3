import { describe, it, expect } from 'vitest';
import { SuavizadorDeAngulos, TAU_MAX_MS } from './suavizacao';

const RAD = Math.PI / 180;

describe('SuavizadorDeAngulos', () => {
  it('reduz o ruído durante a fixação sem mudar a média', () => {
    const s = new SuavizadorDeAngulos();
    let seed = 3;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
    const cru: number[] = [];
    const suave: number[] = [];
    for (let i = 0; i < 300; i++) {
      const yaw = 5 * RAD + 2 * RAD * rnd();   // ±1° de ruído em torno de 5°
      cru.push(yaw);
      suave.push(s.processar(yaw, 0, i * 100).yaw);
    }
    const desvio = (v: number[]) => {
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    };
    expect(desvio(suave)).toBeLessThan(desvio(cru) * 0.8);
    const mediaSuave = suave.slice(50).reduce((a, b) => a + b, 0) / (suave.length - 50);
    expect(mediaSuave / RAD).toBeCloseTo(5, 0);
  });

  it('solta na sacada: a leitura crua sai inteira, sem atraso', () => {
    const s = new SuavizadorDeAngulos();
    for (let i = 0; i < 10; i++) s.processar(0, 0, i * 100);
    // 15° em 100 ms = 150°/s.
    const r = s.processar(15 * RAD, 0, 1000);
    expect(r.soltou).toBe(true);
    expect(r.yaw).toBe(15 * RAD);
    // E a EMA recomeça dali: a leitura seguinte é suavizada em torno de 15°.
    const r2 = s.processar(15.5 * RAD, 0, 1100);
    expect(r2.soltou).toBe(false);
    expect(r2.yaw / RAD).toBeGreaterThan(15);
    expect(r2.yaw / RAD).toBeLessThan(15.5);
  });

  it('a mesma inferência lida de novo (rAF entre inferências) não move a EMA', () => {
    const s = new SuavizadorDeAngulos();
    s.processar(0, 0, 0);
    const a = s.processar(2 * RAD, 0, 100);
    const b = s.processar(2 * RAD, 0, 100);
    const c = s.processar(2 * RAD, 0, 100);
    expect(b.yaw).toBe(a.yaw);
    expect(c.yaw).toBe(a.yaw);
  });

  it('a constante de tempo nunca passa de 150 ms', () => {
    const s = new SuavizadorDeAngulos({ constanteDeTempoMs: 5000 });
    s.processar(0, 0, 0);
    // Um degrau lento (abaixo do limiar de sacada) a 100 ms: com τ = 150 ms
    // a EMA já andou 1 − e^(−100/150) ≈ 49 % do caminho.
    const r = s.processar(3 * RAD, 0, 100);
    const fracao = r.yaw / (3 * RAD);
    expect(fracao).toBeCloseTo(1 - Math.exp(-100 / TAU_MAX_MS), 6);
  });

  it('reiniciar esquece o estado', () => {
    const s = new SuavizadorDeAngulos();
    s.processar(0, 0, 0);
    s.processar(1 * RAD, 0, 100);
    s.reiniciar();
    const r = s.processar(4 * RAD, 0, 200);
    expect(r.yaw).toBe(4 * RAD);
    expect(r.soltou).toBe(false);
  });
});
