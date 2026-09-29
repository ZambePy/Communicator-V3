import { describe, expect, it } from 'vitest';
import {
  estimarFusao,
  fundirPorCovariancia,
  fusaoValida,
  pesoDoOlhoEsquerdo,
  PESO_MINIMO,
  type ResiduoBinocular,
} from './fusaoBinocular';

/** Gerador determinístico (xorshift32) e normal por Box–Muller. */
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

/** Resíduos de dois olhos com desvios σE, σD e correlação ρ, em G alvos. */
function residuos(sE: number, sD: number, rho: number, G: number, porAlvo: number, semente = 7): ResiduoBinocular[] {
  const n = gerador(semente);
  const out: ResiduoBinocular[] = [];
  for (let g = 0; g < G; g++) {
    for (let i = 0; i < porAlvo; i++) {
      const eixo = () => {
        const z1 = n();
        const z2 = n();
        return { e: sE * z1, d: sD * (rho * z1 + Math.sqrt(1 - rho * rho) * z2) };
      };
      const x = eixo();
      const y = eixo();
      out.push({ grupo: `g${g}`, e: { x: x.e, y: y.e }, d: { x: x.d, y: y.d } });
    }
  }
  return out;
}

/** Peso de variância mínima sem encolher, para comparar. */
function pesoCru(rs: ResiduoBinocular[], eixo: 'x' | 'y'): number {
  const m = (f: (r: ResiduoBinocular) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  const e = m((r) => r.e[eixo] ** 2);
  const d = m((r) => r.d[eixo] ** 2);
  const ed = m((r) => r.e[eixo] * r.d[eixo]);
  return Math.max(0, Math.min(1, (d - ed) / (e + d - 2 * ed)));
}

describe('pesoDoOlhoEsquerdo', () => {
  it('sem abertura nem dominância é o peso estático', () => {
    expect(pesoDoOlhoEsquerdo({ e: 1, d: 1, ed: 0.5, peso: 0.3 })).toBeCloseTo(0.3, 12);
    expect(pesoDoOlhoEsquerdo({ e: 1, d: 1, ed: 0.5, peso: 0.5 })).toBeCloseTo(0.5, 12);
  });

  it('olho fechando perde peso de forma contínua, e fechado sai da média', () => {
    const c = { e: 1, d: 1, ed: 0.3, peso: 0.5 };
    const aberto = pesoDoOlhoEsquerdo(c, { left: 1, right: 1 });
    const meio = pesoDoOlhoEsquerdo(c, { left: 0.5, right: 1 });
    const fechado = pesoDoOlhoEsquerdo(c, { left: 0, right: 1 });
    expect(aberto).toBeCloseTo(0.5, 12);
    expect(meio).toBeLessThan(aberto);
    expect(fechado).toBeLessThan(0.01);
    // Sem degrau: meio fio de abertura muda o peso pouco.
    expect(Math.abs(pesoDoOlhoEsquerdo(c, { left: 0.51, right: 1 }) - meio)).toBeLessThan(0.02);
  });

  it('o olho de peso mínimo assume a média quando o outro fecha', () => {
    const c = { e: 1, d: 1, ed: 0.3, peso: PESO_MINIMO };
    expect(pesoDoOlhoEsquerdo(c, { left: 1, right: 0 })).toBeGreaterThan(0.9);
  });

  it('dominância reduz a variância do olho dominante', () => {
    const c = { e: 1, d: 1, ed: 0, peso: 0.5 };
    expect(pesoDoOlhoEsquerdo(c, undefined, { left: 1.5, right: 1 })).toBeCloseTo(0.6, 12);
  });
});

describe('estimarFusao', () => {
  it('recupera variâncias e covariância com muitos dados, e o olho de menor variância pesa mais', () => {
    const rs = residuos(2, 1, 0.6, 13, 400);
    const f = estimarFusao(rs);
    expect(f).not.toBeNull();
    expect(f!.x.e).toBeGreaterThan(3.4);
    expect(f!.x.e).toBeLessThan(4.6);
    expect(f!.x.d).toBeGreaterThan(0.85);
    expect(f!.x.d).toBeLessThan(1.15);
    expect(f!.x.ed / Math.sqrt(f!.x.e * f!.x.d)).toBeCloseTo(0.6, 1);
    // Com dado de sobra quase nada é encolhido: o peso é o de Bates & Granger.
    expect(f!.x.peso).toBeLessThan(0.3);
    expect(Math.abs(f!.x.peso - Math.max(PESO_MINIMO, pesoCru(rs, 'x')))).toBeLessThan(0.02);
  });

  it('com os olhos correlacionados e poucos alvos, o peso incerto volta para perto de ½', () => {
    // Olhos iguais, ρ = 0,9, 5 alvos: a fórmula amplifica o ruído da diferença
    // das variâncias por 1/(1 − ρ) e o peso cru vai longe do meio.
    let encolheu = 0;
    let total = 0;
    for (let semente = 1; semente <= 40; semente++) {
      const rs = residuos(1, 1, 0.9, 5, 6, semente);
      const f = estimarFusao(rs)!;
      const cru = pesoCru(rs, 'x');
      if (Math.abs(cru - 0.5) < 0.1) continue;
      total++;
      if (Math.abs(f.x.peso - 0.5) < Math.abs(cru - 0.5)) encolheu++;
    }
    expect(total).toBeGreaterThan(10);
    expect(encolheu).toBe(total);
  });

  it('nenhum olho fica abaixo do peso mínimo', () => {
    // σE muito maior: o peso cru do esquerdo é 0.
    const f = estimarFusao(residuos(10, 1, 0.95, 13, 200))!;
    expect(f.x.peso).toBeGreaterThanOrEqual(PESO_MINIMO);
    expect(f.x.peso).toBeLessThan(0.1);
  });

  it('menos de 3 alvos ou resíduos não finitos: null / ignorados', () => {
    expect(estimarFusao(residuos(1, 1, 0, 2, 50))).toBeNull();
    const rs = residuos(1, 1, 0, 5, 20);
    rs.push({ grupo: 'g0', e: { x: Number.NaN, y: 0 }, d: { x: 0, y: 0 } });
    expect(estimarFusao(rs)).not.toBeNull();
  });
});

describe('fundirPorCovariancia e fusaoValida', () => {
  it('funde eixo a eixo com os pesos de cada eixo', () => {
    const f = { x: { e: 1, d: 1, ed: 0, peso: 0.5 }, y: { e: 1, d: 3, ed: 0, peso: 0.75 } };
    const p = fundirPorCovariancia(f, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(p.x).toBeCloseTo(0.5, 12);
    expect(p.y).toBeCloseTo(0.25, 12);
  });

  it('valida o que vem de um perfil salvo', () => {
    expect(fusaoValida({ x: { e: 1, d: 1, ed: 0, peso: 0.5 }, y: { e: 1, d: 1, ed: 0.2, peso: 0.4 } })).not.toBeNull();
    expect(fusaoValida({ x: { e: 0, d: 1, ed: 0, peso: 0.5 }, y: { e: 1, d: 1, ed: 0, peso: 0.5 } })).toBeNull();
    // Perfil da versão anterior, sem o peso encolhido: recalibrar.
    expect(fusaoValida({ x: { e: 1, d: 1, ed: 0 }, y: { e: 1, d: 1, ed: 0.2 } })).toBeNull();
    expect(fusaoValida({ x: { e: 1, d: 1, ed: 0, peso: 0 }, y: { e: 1, d: 1, ed: 0, peso: 0.5 } })).toBeNull();
    expect(fusaoValida(null)).toBeNull();
    expect(fusaoValida('x')).toBeNull();
  });
});
