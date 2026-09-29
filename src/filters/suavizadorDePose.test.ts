import { describe, expect, it } from 'vitest';
import { SuavizadorDePose } from './suavizadorDePose';

const deg = (d: number) => (d * Math.PI) / 180;

describe('SuavizadorDePose', () => {
  it('primeira pose passa intacta e pose constante continua constante', () => {
    const s = new SuavizadorDePose();
    const p = { yaw: deg(5), pitch: deg(-3), roll: deg(1) };
    const a = s.processar(p, 0);
    expect(a.pitch).toBeCloseTo(p.pitch, 12);
    let b = a;
    for (let i = 1; i < 60; i++) b = s.processar(p, i * 33.3);
    expect(b.yaw).toBeCloseTo(p.yaw, 9);
    expect(b.pitch).toBeCloseTo(p.pitch, 9);
  });

  it('reduz o tremor de pitch com a cabeça parada', () => {
    const s = new SuavizadorDePose();
    let semente = 11;
    const ruido = () => {
      semente = (semente * 1664525 + 1013904223) >>> 0;
      return (semente / 0xffffffff - 0.5) * deg(0.5);
    };
    const saidas: number[] = [];
    const entradas: number[] = [];
    for (let i = 0; i < 300; i++) {
      const pitch = deg(-10) + ruido();
      entradas.push(pitch);
      saidas.push(s.processar({ yaw: 0, pitch, roll: 0 }, i * 33.3).pitch);
    }
    const dp = (v: number[]) => {
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    };
    expect(dp(saidas.slice(60))).toBeLessThan(0.6 * dp(entradas.slice(60)));
  });

  it('segue uma mudança de postura real em poucas centenas de ms, sem degrau', () => {
    const s = new SuavizadorDePose();
    for (let i = 0; i < 30; i++) s.processar({ yaw: 0, pitch: 0, roll: 0 }, i * 33.3);
    // Virada de 10° a 30 °/s.
    let ultimo = 0;
    let maiorPasso = 0;
    for (let i = 30; i < 90; i++) {
      const alvo = Math.min(deg(10), deg(30) * ((i - 30) * 0.0333));
      const y = s.processar({ yaw: alvo, pitch: 0, roll: 0 }, i * 33.3).yaw;
      maiorPasso = Math.max(maiorPasso, Math.abs(y - ultimo));
      ultimo = y;
    }
    expect(ultimo).toBeCloseTo(deg(10), 3);
    // Sem degrau: ao alcançar a cabeça, o filtro anda no máximo um pouco mais
    // que a própria virada anda num quadro (1°).
    expect(maiorPasso).toBeLessThanOrEqual(deg(1.5));
  });

  it('reiniciar recomeça do valor cru', () => {
    const s = new SuavizadorDePose();
    for (let i = 0; i < 30; i++) s.processar({ yaw: deg(20), pitch: 0, roll: 0 }, i * 33.3);
    s.reiniciar();
    expect(s.processar({ yaw: deg(-5), pitch: 0, roll: 0 }, 2000).yaw).toBeCloseTo(deg(-5), 12);
  });
});
