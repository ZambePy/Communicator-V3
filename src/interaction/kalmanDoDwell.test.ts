import { describe, expect, it } from 'vitest';
import {
  C_W,
  CHI2_2GL_99,
  ESPALHAMENTO_PLENO,
  GANHO_MAX,
  K_MAX,
  SIGMA_GANHO,
  SIGMA_INF_PX,
  T_MEIA_MS,
  atualizarKalman,
  correcaoNoPonto,
  criarKalman,
  excitacaoDoGanho,
  injecaoPorPostura,
  medirDeslocamento,
  preverKalman,
  ruidoDoRotulo,
  type EstadoDoKalman,
} from './kalmanDoDwell';

const CENTRO = { x: 960, y: 540 };

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

/** Rótulo de um botão de lado `w` px centrado em `c`, com o olhar deslocado por `vies`. */
function rotulo(c: { x: number; y: number }, vies: { x: number; y: number }, w: number, ruido: () => number) {
  // O olhar cai em qualquer ponto do botão (uniforme ≈ w/√12) mais o viés.
  const olharX = c.x - vies.x + C_W * w * ruido();
  const olharY = c.y - vies.y + C_W * w * ruido();
  return {
    centro: c,
    mediana: { x: olharX, y: olharY },
    r: ruidoDoRotulo({ largura: w, altura: w }, { x: 30, y: 30 }, 6),
  };
}

describe('predição Ornstein–Uhlenbeck', () => {
  it('a média cai pela metade numa meia-vida e a variância volta a σ∞² numa pausa longa', () => {
    let e: EstadoDoKalman = { ...criarKalman(), ultimoMs: 0 };
    e = { ...e, x: { ...e.x, o: 100, poo: 25 } };
    const meia = preverKalman(e, T_MEIA_MS);
    expect(meia.x.o).toBeCloseTo(50, 9);
    expect(meia.x.poo).toBeGreaterThan(25);
    const longe = preverKalman(e, 50 * T_MEIA_MS);
    expect(longe.x.o).toBeCloseTo(0, 6);
    expect(longe.x.poo).toBeCloseTo(SIGMA_INF_PX ** 2, 3);
    expect(longe.x.pgg).toBeCloseTo(SIGMA_GANHO ** 2, 9);
  });

  it('a primeira chamada só marca o relógio; tempo para trás não faz nada', () => {
    const e = preverKalman(criarKalman(), 1234);
    expect(e.ultimoMs).toBe(1234);
    expect(preverKalman(e, 1000)).toBe(e);
  });
});

describe('atualização', () => {
  it('R = (W/√12)² + (π/2)·s²/N_eff', () => {
    const r = ruidoDoRotulo({ largura: 120, altura: 60 }, { x: 40, y: 20 }, 8);
    expect(r.x).toBeCloseTo((120 / Math.sqrt(12)) ** 2 + (Math.PI / 2) * 1600 / 8, 9);
    expect(r.y).toBeCloseTo((60 / Math.sqrt(12)) ** 2 + (Math.PI / 2) * 400 / 8, 9);
  });

  it('um rótulo só nunca move mais que metade do caminho', () => {
    const e = { ...criarKalman(), ultimoMs: 0 };
    const r = atualizarKalman(e, { centro: { x: 1000, y: 500 }, mediana: { x: 940, y: 500 }, r: { x: 1, y: 1 } }, {
      centroDaTela: CENTRO, afim: false,
    });
    expect(r.aceita).toBe(true);
    expect(r.estado.x.o).toBeCloseTo(K_MAX * 60, 9);
    // Joseph com K limitado: variância positiva e menor que antes.
    expect(r.estado.x.poo).toBeGreaterThan(0);
    expect(r.estado.x.poo).toBeLessThan(SIGMA_INF_PX ** 2);
  });

  it('inovação absurda para o modelo é recusada pelo χ² (2 graus, 99 %)', () => {
    let e: EstadoDoKalman = { ...criarKalman(), ultimoMs: 0 };
    e = { ...e, x: { ...e.x, poo: 100 }, y: { ...e.y, poo: 100 } };
    const m = { centro: { x: 1000, y: 500 }, mediana: { x: 700, y: 500 }, r: { x: 100, y: 100 } };
    const r = atualizarKalman(e, m, { centroDaTela: CENTRO, afim: false });
    expect(r.aceita).toBe(false);
    expect(r.motivo).toBe('chi2');
    expect(r.nis!).toBeGreaterThan(CHI2_2GL_99);
    expect(r.estado.x.o).toBe(0);
  });

  it('mudança de postura infla a variância; grande o bastante, o mesmo rótulo passa a ser aceito', () => {
    let e: EstadoDoKalman = { ...criarKalman(), ultimoMs: 0 };
    e = { ...e, x: { ...e.x, poo: 100 }, y: { ...e.y, poo: 100 } };
    const m = { centro: { x: 1000, y: 500 }, mediana: { x: 870, y: 500 }, r: { x: 400, y: 400 } };
    expect(atualizarKalman(e, m, { centroDaTela: CENTRO, afim: false }).aceita).toBe(false);
    // 8° de yaw a 60 cm (2268 px): κ·d·tan Δ ≈ 32 px de desvio a mais — pouco
    // para esta inovação de 130 px, que continua recusada.
    const inj8 = injecaoPorPostura({ yaw: 8 * Math.PI / 180, pitch: 0 }, 2268);
    expect(Math.sqrt(inj8.x)).toBeCloseTo(0.1 * 2268 * Math.tan(8 * Math.PI / 180), 6);
    expect(inj8.y).toBe(0);
    expect(atualizarKalman(e, m, { centroDaTela: CENTRO, afim: false, injecao: inj8 }).aceita).toBe(false);
    // 20° (≈ 83 px a mais): agora o rótulo entra.
    const inj20 = injecaoPorPostura({ yaw: 20 * Math.PI / 180, pitch: 0 }, 2268);
    const r = atualizarKalman(e, m, { centroDaTela: CENTRO, afim: false, injecao: inj20 });
    expect(r.aceita).toBe(true);
    expect(r.estado.x.o).toBeGreaterThan(40);
  });

  it('medida inválida não mexe no estado', () => {
    const e = criarKalman();
    const r = atualizarKalman(e, { centro: { x: Number.NaN, y: 0 }, mediana: { x: 0, y: 0 }, r: { x: 1, y: 1 } }, {
      centroDaTela: CENTRO, afim: false,
    });
    expect(r).toMatchObject({ aceita: false, motivo: 'invalida' });
    expect(r.estado).toBe(e);
  });

  it('reajuste pelo centro com R pequeno é quase a substituição', () => {
    const e = { ...criarKalman(), ultimoMs: 0 };
    const r = medirDeslocamento(e, { x: 80, y: -40 }, { x: 100, y: 100 });
    expect(r.x.o).toBeGreaterThan(75);
    expect(r.y.o).toBeLessThan(-37);
    expect(Math.sqrt(r.x.poo)).toBeLessThan(11);
  });
});

describe('ganho (M16)', () => {
  it('excitação: rampa linear até 40 % do eixo', () => {
    expect(excitacaoDoGanho([500], 1920)).toBe(0);
    expect(excitacaoDoGanho([500, 500 + 0.2 * 1920], 1920)).toBeCloseTo(0.5, 9);
    expect(excitacaoDoGanho([100, 100 + ESPALHAMENTO_PLENO * 1920], 1920)).toBe(1);
  });

  it('rótulos espalhados aprendem o ganho verdadeiro; num lugar só, o ganho fica parado', () => {
    const ruido = gerador(5);
    const ganhoVerdadeiro = 0.06;
    const vies = (c: { x: number; y: number }) => ({ x: 20 + ganhoVerdadeiro * (c.x - CENTRO.x), y: 0 });
    const posicoes = [200, 600, 960, 1320, 1720];
    let e: EstadoDoKalman = { ...criarKalman(), ultimoMs: 0 };
    for (let i = 0; i < 60; i++) {
      const c = { x: posicoes[i % posicoes.length], y: 540 };
      const m = rotulo(c, vies(c), 120, ruido);
      e = atualizarKalman(preverKalman(e, i * 5000), m, {
        centroDaTela: CENTRO, afim: true, excitacao: { x: 1, y: 0 },
      }).estado;
    }
    expect(e.x.g).toBeGreaterThan(0.035);
    expect(e.x.g).toBeLessThanOrEqual(GANHO_MAX);

    let f: EstadoDoKalman = { ...criarKalman(), ultimoMs: 0 };
    for (let i = 0; i < 60; i++) {
      const c = { x: 1700, y: 540 };
      const m = rotulo(c, vies(c), 120, ruido);
      f = atualizarKalman(preverKalman(f, i * 5000), m, {
        centroDaTela: CENTRO, afim: true, excitacao: { x: excitacaoDoGanho([1700], 1920), y: 0 },
      }).estado;
    }
    // Sem excitação o viés do lugar vai todo para o deslocamento.
    expect(Math.abs(f.x.g)).toBeLessThan(1e-9);
    expect(correcaoNoPonto(f, { x: 1700, y: 540 }, CENTRO).x).toBeGreaterThan(45);
  });
});

describe('deriva sintética (erro um passo à frente)', () => {
  /**
   * Viés verdadeiro: passeio aleatório lento + um degrau de 90 px quando a
   * pessoa muda de posição aos 10 min. Um rótulo a cada 5 s num botão de
   * 150 px. Compara o erro do deslocamento ANTES de cada rótulo (o que o
   * cursor carrega) entre o Kalman e o integrador de k = 0,05.
   */
  function simular(semente: number) {
    const ruido = gerador(semente);
    const dt = 5000;
    let vies = { x: 0, y: 0 };
    let e: EstadoDoKalman = { ...criarKalman(), ultimoMs: 0 };
    let integ = { x: 0, y: 0 };
    let erroK = 0;
    let erroI = 0;
    let n = 0;
    for (let i = 0; i < 240; i++) {
      const t = i * dt;
      vies = { x: vies.x + 1.5 * ruido(), y: vies.y + 1.5 * ruido() };
      if (i === 120) vies = { x: vies.x + 90, y: vies.y - 60 };
      e = preverKalman(e, t);
      if (i > 20) {
        erroK += (e.x.o - vies.x) ** 2 + (e.y.o - vies.y) ** 2;
        erroI += (integ.x - vies.x) ** 2 + (integ.y - vies.y) ** 2;
        n++;
      }
      const c = { x: 300 + (i % 7) * 200, y: 300 + (i % 3) * 200 };
      const m = rotulo(c, vies, 150, ruido);
      e = atualizarKalman(e, m, { centroDaTela: CENTRO, afim: false }).estado;
      // Integrador de antes, no mesmo rótulo (malha aberta equivalente).
      integ = {
        x: integ.x + 0.05 * (m.centro.x - m.mediana.x - integ.x),
        y: integ.y + 0.05 * (m.centro.y - m.mediana.y - integ.y),
      };
    }
    return { kalman: Math.sqrt(erroK / n), integrador: Math.sqrt(erroI / n) };
  }

  it('segue a deriva e a mudança de postura melhor que o integrador de k = 0,05', () => {
    const r = [1, 2, 3, 4, 5].map(simular);
    const media = (k: 'kalman' | 'integrador') => r.reduce((s, x) => s + x[k], 0) / r.length;
    expect(media('kalman')).toBeLessThan(media('integrador'));
  });

  it('rótulos errados descartados pelo desfazer não puxam a correção para o vizinho', () => {
    // Viés de 120 px e vizinho a 230 px (botões de 215): no começo boa parte
    // dos dwells cai no vizinho. O rótulo de uma seleção errada aponta para o
    // vizinho (z = vizinho − olhar), e é esse o puxão que trava a correção.
    const simular = (descartarErradas: boolean, semente: number) => {
      const ruido = gerador(semente);
      let e: EstadoDoKalman = { ...criarKalman(), ultimoMs: 0 };
      const vies = 120;
      const passo = 230;
      const w = 215;
      const c = { x: 960, y: 540 };
      for (let i = 0; i < 300; i++) {
        e = preverKalman(e, i * 5000);
        const cursor = c.x - (vies - e.x.o) + 40 * ruido();
        const noVizinho = cursor < c.x - passo / 2;
        if (noVizinho && descartarErradas) continue;
        const m = {
          centro: noVizinho ? { x: c.x - passo, y: c.y } : c,
          // A pessoa olhava o alvo pretendido: a predição sem correção está nele menos o viés.
          mediana: { x: c.x - vies + 10 * ruido(), y: c.y + 10 * ruido() },
          r: ruidoDoRotulo({ largura: w, altura: w }, { x: 30, y: 30 }, 6),
        };
        e = atualizarKalman(e, m, { centroDaTela: CENTRO, afim: false }).estado;
      }
      return Math.abs(e.x.o - vies);
    };
    const sessoes = Array.from({ length: 20 }, (_, k) => k + 1);
    const travadas = (descartar: boolean) => sessoes.filter((k) => simular(descartar, k) > 100).length;
    // Aqui TODA seleção errada é desfeita — o melhor caso do descarte. O
    // mecanismo que descarta (quarentena de 4 s e `registrarAcaoDoUsuario`) é
    // testado em `correcaoPorDwell.kalman.test.ts`; este teste mostra o que ele
    // compra: com o descarte, nenhuma das 20 sessões trava, e todas terminam
    // perto do viés.
    expect(travadas(true)).toBe(0);
    expect(Math.max(...sessoes.map((k) => simular(true, k)))).toBeLessThan(25);
    // Sem ela, parte das sessões termina presa no vizinho (erro ≈ o passo).
    expect(travadas(false)).toBeGreaterThan(0);
  });
});
