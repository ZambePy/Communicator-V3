import { describe, it, expect } from 'vitest';
import { OneEuroFilter2D, FILTER_PRESETS, FILTER_PRESETS_V2, DCUTOFF_V2_HZ } from './oneEuroFilter';

/**
 * `dcutoff` dos presets v2 (2 Hz): a estimativa de velocidade reage mais cedo
 * no começo da sacada, e o cursor sai do lugar antes. Na fixação (velocidade
 * ~0) o `dcutoff` não entra na conta da posição, então o repouso não muda.
 */

const FPS = 30;

/** Degrau de 0 → 0,3 (normalizado) em t = 1 s; devolve quadros até 90 %. */
function quadrosAte90(dcutoff: number): number {
  const cfg = FILTER_PRESETS_V2['balanceado-v2'];
  const f = new OneEuroFilter2D(60, cfg.mincutoff, cfg.beta, dcutoff);
  for (let i = 0; i < FPS; i++) f.filter(0.5, 0.5, i / FPS);
  for (let i = 0; i < 60; i++) {
    const s = f.filter(0.8, 0.5, (FPS + i) / FPS);
    if (s.x >= 0.5 + 0.9 * 0.3) return i + 1;
  }
  return Infinity;
}

describe('dcutoff dos presets v2', () => {
  it('os três presets v2 usam DCUTOFF_V2_HZ; os v1 (pixel, legado) mantêm 1 Hz', () => {
    expect(DCUTOFF_V2_HZ).toBe(2);
    for (const p of Object.values(FILTER_PRESETS_V2)) expect(p.dcutoff).toBe(DCUTOFF_V2_HZ);
    for (const p of Object.values(FILTER_PRESETS)) expect(p.dcutoff).toBe(1);
  });

  it('com 2 Hz o degrau chega a 90 % em menos quadros que com 1 Hz', () => {
    expect(quadrosAte90(2)).toBeLessThan(quadrosAte90(1));
  });

  it('setParams troca o dcutoff sem zerar o estado filtrado', () => {
    const cfg = FILTER_PRESETS_V2['balanceado-v2'];
    const f = new OneEuroFilter2D(60, cfg.mincutoff, cfg.beta, 1);
    let s = { x: 0, y: 0 };
    for (let i = 0; i < 30; i++) s = f.filter(0.4, 0.6, i / FPS);
    f.setParams(cfg.mincutoff, cfg.beta, 2);
    const depois = f.filter(0.4, 0.6, 30 / FPS);
    // Mesma entrada estável: sem salto.
    expect(Math.abs(depois.x - s.x)).toBeLessThan(1e-6);
    expect(Math.abs(depois.y - s.y)).toBeLessThan(1e-6);
  });

  it('setParams sem dcutoff preserva o dcutoff anterior', () => {
    const a = new OneEuroFilter2D(60, 0.5, 5, 2);
    const b = new OneEuroFilter2D(60, 0.5, 5, 2);
    a.setParams(0.5, 5);
    for (let i = 0; i < 40; i++) {
      const x = i < 20 ? 0.5 : 0.8;
      expect(a.filter(x, 0.5, i / FPS)).toEqual(b.filter(x, 0.5, i / FPS));
    }
  });
});
