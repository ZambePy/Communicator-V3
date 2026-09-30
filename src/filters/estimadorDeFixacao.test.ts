import { describe, expect, it } from 'vitest';
import {
  EstimadorDeFixacao,
  JANELA_BASE_MS,
  JANELA_MAX_MS,
  RAIO_FIM,
  RAIO_INICIO,
  distanciaDeMahalanobis,
  janelaParaRho,
  varianciaDaInovacao,
  varianciaDoDeslocamento,
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

/** Ruído AR(1) com o ρ₁ medido no projeto (0,80, ou `rho`), desvio `escala·SIGMA`. */
function serieDeRuido(n: number, escala: number, semente: number, rho = 0.8) {
  const z = gerador(semente);
  const inov = Math.sqrt(1 - rho * rho);
  let a = z();
  let b = z();
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) { a = rho * a + inov * z(); b = rho * b + inov * z(); }
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

// Revisão de 30/09 (gravação com o cursor "travando"): o portão supunha
// amostras independentes, mas o ruído do olhar tem ρ₁ ≈ 0,8. O portão ficava
// largo demais — passos médios escorregavam até o destino por 250–430 ms — e a
// escala da sessão saía abaixo da verdadeira.
describe('variância da inovação com ruído correlacionado', () => {
  /** Janela cheia de amostras a 30 Hz terminando em `t`, todas com peso 1. */
  const janela = (n: number, t: number) => Array.from({ length: n }, (_, i) => ({ t: t - (n - i) * DT, w: 1 }));

  it('sem correlação é 1 + Σŵ² — o 1 + 1/n de antes com pesos iguais', () => {
    const amostras = [{ t: 0, w: 1 }, { t: 1, w: 1 }, { t: 2, w: 1 }, { t: 3, w: 1 }];
    // Janela enorme: o núcleo triangular fica ~plano e os pesos, iguais.
    expect(varianciaDaInovacao(amostras, 4, 1e9, 0)).toBeCloseTo(1 + 1 / 4, 6);
  });

  it('bate com a conta direta O(n²)', () => {
    const amostras = janela(18, 1000).map((a, i) => ({ ...a, w: i % 3 === 0 ? 0.5 : 1 }));
    const rho = 0.8;
    const c = (dt: number) => rho ** (Math.abs(dt) / DT);
    const w = amostras.map((a) => Math.max(0, 1 - (1000 - a.t) / JANELA_BASE_MS) * a.w);
    const sw = w.reduce((a, b) => a + b, 0);
    let v = 0;
    let cov = 0;
    for (let i = 0; i < w.length; i++) {
      cov += (w[i] / sw) * c(1000 - amostras[i].t);
      for (let j = 0; j < w.length; j++) v += (w[i] / sw) * (w[j] / sw) * c(amostras[i].t - amostras[j].t);
    }
    expect(varianciaDaInovacao(amostras, 1000, JANELA_BASE_MS, rho)).toBeCloseTo(1 + v - 2 * cov, 10);
  });

  it('com ρ₁ = 0,8 a diferença entre a amostra e a média varia bem menos que σ²', () => {
    const f = varianciaDaInovacao(janela(18, 1000), 1000, JANELA_BASE_MS, 0.8);
    expect(f).toBeGreaterThan(0.45);
    expect(f).toBeLessThan(0.8);
  });

  it('é a variância certa: com ruído AR(1) de verdade, d² médio ≈ 2 (χ² com 2 graus)', () => {
    // A conta de antes (1 + 1/n) dava d² médio ~1,3: o portão ficava ~25 %
    // mais largo que o nominal e a escala, abaixo da verdadeira.
    const serie = serieDeRuido(6000, 1, 5);
    const t = serie.map((_, i) => i * DT);
    let soma = 0;
    let n = 0;
    for (let i = 20; i < serie.length; i++) {
      const amostras = [];
      for (let j = i - 18; j < i; j++) amostras.push({ t: t[j], w: 1 });
      let sw = 0, mx = 0, my = 0;
      for (const [k, a] of amostras.entries()) {
        const w = Math.max(0, 1 - (t[i] - a.t) / JANELA_BASE_MS);
        sw += w; mx += w * serie[i - 18 + k].x; my += w * serie[i - 18 + k].y;
      }
      const f = varianciaDaInovacao(amostras, t[i], JANELA_BASE_MS, 0.8);
      soma += ((serie[i].x - mx / sw) ** 2 + (serie[i].y - my / sw) ** 2) / (SIGMA * SIGMA * f);
      n++;
    }
    expect(soma / n).toBeGreaterThan(1.8);
    expect(soma / n).toBeLessThan(2.2);
  });
});

describe('passos médios chegam sem escorregar', () => {
  /** t90 (ms) de um passo de `passoSigmas` σ na horizontal, com ruído AR(1), em `n` sementes. */
  function t90s(passoSigmas: number, n: number): number[] {
    const out: number[] = [];
    for (let semente = 1; semente <= n; semente++) {
      const e = new EstimadorDeFixacao(JANELA_BASE_MS, 0.8);
      let t90 = 3000;
      serieDeRuido(150, 1, semente * 13).forEach((q, i) => {
        const alvo = i < 60 ? 0 : passoSigmas * SIGMA;
        const o = e.processar(700 + alvo + q.x, 500 + q.y, i * DT, RUIDO);
        if (i >= 60 && t90 === 3000 && o.x - 700 >= 0.9 * passoSigmas * SIGMA) t90 = (i - 60) * DT;
      });
      out.push(t90);
    }
    return out.sort((a, b) => a - b);
  }

  it('passo de 4σ: metade chega em até 200 ms (eram ~270 ms, escorregando)', () => {
    const t = t90s(4, 60);
    expect(t[30]).toBeLessThanOrEqual(200);
  });

  it('passo de 3,5σ: em média chega mais cedo (era ~475 ms)', () => {
    const t = t90s(3.5, 60);
    expect(t.reduce((a, b) => a + b, 0) / t.length).toBeLessThanOrEqual(430);
  });

  it('sacada grande continua chegando em até dois quadros', () => {
    const t = t90s(6, 60);
    expect(t[30]).toBeLessThanOrEqual(67);
  });

  it('com o olhar parado, o detector de deslocamento não reinicia a fixação à toa', () => {
    // 60 s de puro ruído, na escala da calibração: nenhum reinício — cada um
    // seria um pulo do cursor parado.
    for (const semente of [3, 8, 12]) {
      const e = new EstimadorDeFixacao(JANELA_BASE_MS, 0.8);
      let anterior: { x: number; y: number } | null = null;
      let pulos = 0;
      serieDeRuido(1800, 1, semente).forEach((q, i) => {
        const o = e.processar(960 + q.x, 540 + q.y, i * DT, RUIDO);
        if (anterior && i > 60 && Math.hypot(o.x - anterior.x, o.y - anterior.y) > 0.5 * SIGMA) pulos++;
        anterior = o;
      });
      expect(pulos).toBe(0);
    }
  });

  it('o detector não dispara à toa com ruído POUCO correlacionado (ρ₁ de 0 a 0,5)', () => {
    // A variância da estatística do detector é a exata, com a covariância
    // entre as duas médias: a taxa de alarme falso fica a mesma qualquer que
    // seja o ρ₁. Somar as variâncias das duas médias, como numa primeira
    // versão, dava ~2,5 pulos por minuto com ρ₁ = 0.
    for (const rho of [0, 0.3, 0.5]) {
      let pulos = 0;
      for (const semente of [2, 5, 9, 14, 20]) {
        const e = new EstimadorDeFixacao(JANELA_BASE_MS, rho);
        let anterior: { x: number; y: number } | null = null;
        serieDeRuido(3600, 1, semente, rho).forEach((q, i) => {
          const o = e.processar(960 + q.x, 540 + q.y, i * DT, RUIDO);
          if (anterior && i > 60 && Math.hypot(o.x - anterior.x, o.y - anterior.y) > SIGMA) pulos++;
          anterior = o;
        });
      }
      // 10 min de olhar parado por ρ₁.
      expect(pulos).toBeLessThanOrEqual(3);
    }
  });

  it('a variância do deslocamento bate com a conta direta, com a covariância entre as médias', () => {
    const rho = 0.7;
    const amostras = Array.from({ length: 14 }, (_, i) => ({ t: 1000 - (14 - i) * DT, w: i % 4 === 0 ? 0.6 : 1 }));
    const k = 4;
    const c = (dt: number) => rho ** (Math.abs(dt) / DT);
    const antigas = amostras.slice(0, 10);
    const recentes = amostras.slice(10);
    const w = antigas.map((a) => Math.max(0, 1 - (1000 - a.t) / JANELA_BASE_MS) * a.w);
    const sw = w.reduce((a, b) => a + b, 0);
    // Coeficientes da combinação linear D = média(recentes) − Σ ŵ antigas.
    const coef = [...w.map((x) => -x / sw), ...recentes.map(() => 1 / k)];
    const todas = [...antigas, ...recentes];
    let v = 0;
    for (let i = 0; i < todas.length; i++) for (let j = 0; j < todas.length; j++) v += coef[i] * coef[j] * c(todas[i].t - todas[j].t);
    expect(varianciaDoDeslocamento(amostras, k, 1000, JANELA_BASE_MS, rho)).toBeCloseTo(v, 10);
  });

  it('ruído maior que o da calibração: a escala chega perto da razão verdadeira das variâncias', () => {
    // 1,6× o desvio → 2,56× a variância. A conta de antes subestimava.
    const escalas: number[] = [];
    for (const semente of [3, 8, 12, 21, 33]) {
      const e = new EstimadorDeFixacao(JANELA_BASE_MS, 0.8);
      serieDeRuido(900, 1.6, semente).forEach((q, i) => {
        e.processar(960 + q.x, 540 + q.y, i * DT, RUIDO);
        if (i > 200 && i % 30 === 0) escalas.push(e.escala);
      });
    }
    const media = escalas.reduce((a, b) => a + b, 0) / escalas.length;
    expect(media).toBeGreaterThan(2.1);
    expect(media).toBeLessThan(3.4);
  });
});
