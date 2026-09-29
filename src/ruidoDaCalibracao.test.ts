import { describe, expect, it } from 'vitest';
import {
  amostrasEfetivas,
  covarianciaNoPonto,
  estimarRuido,
  ruidoValido,
  varianciaDaMedia,
  type AmostraDoRuido,
} from './ruidoDaCalibracao';

function gerador(semente: number) {
  // Sementes vizinhas dariam sequências parecidas no xorshift: espalha a
  // semente e descarta as primeiras saídas, para os alvos serem independentes.
  let s = Math.imul(semente, 2654435761) >>> 0 || 1;
  const u = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s + 0.5) / 4294967296;
  };
  for (let i = 0; i < 8; i++) u();
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

/**
 * Ruído AR(1) 2D com covariância estacionária [[sx², ρxy·sx·sy], [·, sy²]] e
 * autocorrelação ρ₁ = `rho` nos dois eixos, em torno de um alvo.
 */
function fixacao(
  grupo: string, alvo: { x: number; y: number }, n: number,
  sx: number, sy: number, rxy: number, rho: number, semente: number,
): AmostraDoRuido[] {
  const z = gerador(semente);
  const inov = Math.sqrt(1 - rho * rho);
  let a = z();
  let b = z();
  const out: AmostraDoRuido[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      a = rho * a + inov * z();
      b = rho * b + inov * z();
    }
    const ex = sx * a;
    const ey = sy * (rxy * a + Math.sqrt(1 - rxy * rxy) * b);
    out.push({ grupo, alvoX: alvo.x, alvoY: alvo.y, x: alvo.x + ex, y: alvo.y + ey });
  }
  return out;
}

describe('varianciaDaMedia / amostrasEfetivas', () => {
  it('ruído branco: variância da média é 1/n', () => {
    expect(varianciaDaMedia(10, 0)).toBeCloseTo(0.1, 12);
    expect(amostrasEfetivas(10, 0)).toBeCloseTo(10, 10);
  });

  it('bate com a redução do desvio da PESQUISA §3.4 (ρ₁ = 0,80 a 30 Hz)', () => {
    // 200/600/1000 ms → 6/18/30 amostras → 17,5/38,5/49,4 % de redução.
    const reducao = (n: number) => 1 - Math.sqrt(varianciaDaMedia(n, 0.8));
    expect(reducao(6)).toBeCloseTo(0.175, 2);
    expect(reducao(18)).toBeCloseTo(0.385, 2);
    expect(reducao(30)).toBeCloseTo(0.494, 2);
  });

  it('uma amostra só vale uma amostra', () => {
    expect(varianciaDaMedia(1, 0.9)).toBe(1);
    expect(amostrasEfetivas(0, 0.5)).toBe(0);
  });
});

describe('estimarRuido', () => {
  const alvos = [
    { x: 400, y: 300 }, { x: 960, y: 300 }, { x: 1520, y: 300 },
    { x: 400, y: 540 }, { x: 960, y: 540 }, { x: 1520, y: 540 },
    { x: 400, y: 780 }, { x: 960, y: 780 }, { x: 1520, y: 780 },
  ];

  it('recupera ρ₁ e a covariância 2×2, corrigindo a janela curta', () => {
    const amostras = alvos.flatMap((a, i) => fixacao(`a${i}`, a, 45, 40, 30, 0.3, 0.8, 100 + i));
    const r = estimarRuido(amostras, 1920, 1080);
    expect(r).not.toBeNull();
    // O ρ₁ amostral de janelas de 45 é enviesado para baixo, pouco.
    expect(r!.rho1).toBeGreaterThan(0.65);
    expect(r!.rho1).toBeLessThan(0.85);
    const med = (f: (a: { sxx: number; syy: number; sxy: number }) => number) => {
      const v = r!.alvos.map(f).sort((p, q) => p - q);
      return v[v.length >> 1];
    };
    expect(Math.sqrt(med((a) => a.sxx))).toBeGreaterThan(28);
    expect(Math.sqrt(med((a) => a.sxx))).toBeLessThan(52);
    expect(Math.sqrt(med((a) => a.syy))).toBeGreaterThan(21);
    expect(Math.sqrt(med((a) => a.syy))).toBeLessThan(39);
    // x maior que y, como no relatório de 28/09 — sem supor o contrário.
    expect(med((a) => a.sxx)).toBeGreaterThan(med((a) => a.syy));
    // Alvos em fração da tela.
    expect(r!.alvos[0].x).toBeCloseTo(400 / 1920, 12);
    expect(r!.alvos[0].y).toBeCloseTo(300 / 1080, 12);
  });

  it('a escala robusta não desfaz a correção da janela: a variância média bate com a verdadeira', () => {
    // 360 alvos de 30 amostras (1 s a 30 Hz) com ρ₁ = 0,8. Os desvios em
    // torno da média da janela têm só ~82 % da variância; sem a correção (ou
    // com a escala robusta aplicada depois dela, que a desfazia) a média
    // ficava em ~0,8 da verdadeira.
    const sxx: number[] = [];
    const syy: number[] = [];
    for (let rep = 0; rep < 40; rep++) {
      const amostras = alvos.flatMap((a, i) => fixacao(`a${i}`, a, 30, 40, 30, 0.3, 0.8, 100 * rep + i + 1));
      for (const a of estimarRuido(amostras, 1920, 1080)!.alvos) {
        sxx.push(a.sxx);
        syy.push(a.syy);
      }
    }
    const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    expect(media(sxx) / 1600).toBeGreaterThan(0.92);
    expect(media(sxx) / 1600).toBeLessThan(1.12);
    expect(media(syy) / 900).toBeGreaterThan(0.92);
    expect(media(syy) / 900).toBeLessThan(1.12);
  });

  it('pico isolado quase não infla a covariância (escala pela mediana)', () => {
    const limpo = fixacao('a', { x: 960, y: 540 }, 60, 40, 40, 0, 0.8, 5);
    const sujo = limpo.map((s, i) => (i === 30 ? { ...s, x: s.x + 900, y: s.y - 700 } : s));
    const rL = estimarRuido(limpo, 1920, 1080)!;
    const rS = estimarRuido(sujo, 1920, 1080)!;
    // Um pico de ~1100 px em 60 amostras multiplica a covariância amostral por
    // ~14. A escala pela mediana sozinha acerta o tamanho, não a forma (o pico
    // é numa direção); com a reponderação, a elipse volta à do ruído limpo.
    expect(rS.alvos[0].sxx / rL.alvos[0].sxx).toBeLessThan(1.5);
    expect(rS.alvos[0].sxx / rL.alvos[0].sxx).toBeGreaterThan(0.67);
  });

  it('alvo com menos de 15 amostras fica de fora; nenhum alvo → null', () => {
    const poucos = fixacao('a', { x: 960, y: 540 }, 10, 40, 40, 0, 0.5, 9);
    expect(estimarRuido(poucos, 1920, 1080)).toBeNull();
    const misto = [...poucos, ...fixacao('b', { x: 400, y: 300 }, 30, 40, 40, 0, 0.5, 10)];
    expect(estimarRuido(misto, 1920, 1080)!.alvos).toHaveLength(1);
  });
});

describe('covarianciaNoPonto', () => {
  const r = {
    rho1: 0.8,
    alvos: [
      { x: 0.1, y: 0.1, sxx: 100, syy: 100, sxy: 0 },
      { x: 0.9, y: 0.9, sxx: 900, syy: 400, sxy: 50 },
    ],
  };

  it('perto de um alvo vale a covariância dele; no meio, uma mistura', () => {
    const perto = covarianciaNoPonto(r, 0.1 * 1920, 0.1 * 1080, 1920, 1080);
    expect(perto.sxx).toBeCloseTo(100, 0);
    const meio = covarianciaNoPonto(r, 960, 540, 1920, 1080);
    expect(meio.sxx).toBeCloseTo(500, 0);
    expect(meio.syy).toBeCloseTo(250, 0);
  });

  it('varia sem degrau ao longo da tela', () => {
    let anterior = covarianciaNoPonto(r, 0, 540, 1920, 1080).sxx;
    for (let x = 10; x <= 1920; x += 10) {
      const v = covarianciaNoPonto(r, x, 540, 1920, 1080).sxx;
      expect(Math.abs(v - anterior)).toBeLessThan(40);
      anterior = v;
    }
  });

  it('muito longe de todos os alvos: média simples, sem NaN', () => {
    const longe = covarianciaNoPonto(r, 1e7, 1e7, 1920, 1080);
    expect(longe.sxx).toBeCloseTo(500, 6);
  });
});

describe('ruidoValido', () => {
  it('aceita o que o treino grava e recusa o resto', () => {
    const ok = { rho1: 0.8, alvos: [{ x: 0.5, y: 0.5, sxx: 10, syy: 20, sxy: 1 }] };
    expect(ruidoValido(ok)).toEqual(ok);
    expect(ruidoValido({ rho1: 0.8, alvos: [{ x: 0.5, y: 0.5, sxx: 10, syy: 20, sxy: 50 }] })).toBeNull();
    expect(ruidoValido({ rho1: 'a', alvos: [] })).toBeNull();
    expect(ruidoValido({ rho1: 2, alvos: ok.alvos })!.rho1).toBe(0.99);
    expect(ruidoValido(undefined)).toBeNull();
  });
});
