import { describe, it, expect } from 'vitest';
import {
  deslocamentoPorPose,
  DELTA_POSE_MAX_RAD,
  DELTA_POSE_FAIXA_RAD,
  pesoDaCompensacao,
} from './poseCompensation';

// `tan(Δyaw)` explode perto de ±π/2 (a cabeça de perfil ou a matriz
// degenerada) e o pico entraria no filtro antes do softClamp do caller.
// A compensação limita o Δpose e zera fora da faixa plausível.

const DIST = 2000;

describe('Δpose extremo não explode o deslocamento', () => {
  it('Δyaw perto de π/2 não produz deslocamento astronômico', () => {
    // Sem clamp: tan(1.5698) ≈ 10000 → dx ≈ 20 milhões de px.
    const r = deslocamentoPorPose(
      { yaw: 1.5698, pitch: 0, roll: 0 },
      { yaw: 0, pitch: 0, roll: 0 },
      DIST,
    );
    expect(Math.abs(r.dx)).toBeLessThan(DIST * 2);
  });

  it('Δpitch perto de π/2 também é contido', () => {
    const r = deslocamentoPorPose(
      { yaw: 0, pitch: -1.5698, roll: 0 },
      { yaw: 0, pitch: 0, roll: 0 },
      DIST,
    );
    expect(Math.abs(r.dy)).toBeLessThan(DIST * 2);
  });

  it('Δ exatamente π/2 não devolve Infinity nem NaN', () => {
    const r = deslocamentoPorPose(
      { yaw: Math.PI / 2, pitch: Math.PI / 2, roll: 0 },
      { yaw: 0, pitch: 0, roll: 0 },
      DIST,
    );
    expect(Number.isFinite(r.dx)).toBe(true);
    expect(Number.isFinite(r.dy)).toBe(true);
  });

  it('salto de sinal do atan2 (yaw de +π para −π) não explode', () => {
    // O modo de falha concreto: `atan2` salta de +3,14 para −3,14 quando a
    // cabeça cruza o perfil. `dyaw` vira ~6,28 — muito além de qualquer
    // rotação física entre dois frames.
    const r = deslocamentoPorPose(
      { yaw: -Math.PI + 0.01, pitch: 0, roll: 0 },
      { yaw: Math.PI - 0.01, pitch: 0, roll: 0 },
      DIST,
    );
    expect(Number.isFinite(r.dx)).toBe(true);
    expect(Math.abs(r.dx)).toBeLessThan(DIST * 2);
  });
});

describe('fora da faixa plausível, a compensação ZERA', () => {
  it('Δ além do limite devolve zero, não o valor clampado', () => {
    // A escolha de projeto: um Δpose de 60° entre dois frames não é rotação da
    // cabeça, é matriz degenerada. Compensar por um valor que sabemos ser lixo
    // — mesmo clampado — seria fabricar correção. Zerar é o mesmo que dizer
    // "não sei compensar este frame", e o frame seguinte volta ao normal.
    const r = deslocamentoPorPose(
      { yaw: 1.2, pitch: 0, roll: 0 },   // ~69°, muito além de π/6
      { yaw: 0, pitch: 0, roll: 0 },
      DIST,
    );
    expect(r.dx).toBe(0);
  });

  it('os eixos são zerados INDEPENDENTEMENTE', () => {
    // Um yaw absurdo não pode descartar um pitch perfeitamente plausível.
    const r = deslocamentoPorPose(
      { yaw: 1.2, pitch: 0.1, roll: 0 },
      { yaw: 0, pitch: 0, roll: 0 },
      DIST,
    );
    expect(r.dx).toBe(0);
    expect(Math.abs(r.dy)).toBeGreaterThan(0);
  });

  it('o limite declarado é da ordem de π/6', () => {
    // π/6 = 30°. Uma cabeça que girou 30° em relação à calibração já está
    // muito além do que a compensação geométrica modela bem.
    expect(DELTA_POSE_MAX_RAD).toBeGreaterThan(Math.PI / 8);
    expect(DELTA_POSE_MAX_RAD).toBeLessThanOrEqual(Math.PI / 4);
  });
});

describe('a faixa normal de operação não muda', () => {
  it('Δ pequeno produz o mesmo valor de antes', () => {
    // Regressão: o clamp não pode alterar o caminho saudável. Δ = 0,1 rad
    // (~5,7°) é o regime típico de deriva postural numa sessão.
    const r = deslocamentoPorPose(
      { yaw: 0.1, pitch: -0.05, roll: 0 },
      { yaw: 0, pitch: 0, roll: 0 },
      DIST,
    );
    expect(r.dx).toBeCloseTo(-DIST * Math.tan(0.1), 9);
    expect(r.dy).toBeCloseTo(-DIST * Math.tan(0.05), 9);
  });

  it('Δ zero continua devolvendo zero sem -0', () => {
    const r = deslocamentoPorPose(
      { yaw: 0.3, pitch: 0.3, roll: 0 },
      { yaw: 0.3, pitch: 0.3, roll: 0 },
      DIST,
    );
    expect(Object.is(r.dx, 0)).toBe(true);
    expect(Object.is(r.dy, 0)).toBe(true);
  });

  it('pose ausente continua devolvendo zero', () => {
    expect(deslocamentoPorPose(null, { yaw: 0, pitch: 0, roll: 0 }, DIST)).toEqual({ dx: 0, dy: 0 });
    expect(deslocamentoPorPose({ yaw: 0, pitch: 0, roll: 0 }, null, DIST)).toEqual({ dx: 0, dy: 0 });
  });

  it('NaN na pose continua devolvendo zero', () => {
    const r = deslocamentoPorPose(
      { yaw: NaN, pitch: 0, roll: 0 },
      { yaw: 0, pitch: 0, roll: 0 },
      DIST,
    );
    expect(r).toEqual({ dx: 0, dy: 0 });
  });
});

// --- Regressão: a rejeição não pode ser um degrau ---------------------------
//
// O portão binário em 30° era a maior descontinuidade do pipeline. Na geometria
// de referência (distanciaPx ≈ 2205) a correção no limiar vale
// 2205 · tan(30°) ≈ 1273 px, e ela ligava/desligava entre dois quadros. Um
// Δpose oscilando em torno de 30° — o que a matriz facial do MediaPipe faz
// quando fica instável — arremessava o cursor de um lado ao outro da tela.
describe('desvanecimento contínuo na borda da faixa plausível', () => {
  const DIST = 2205; // px, geometria de referência 1920×1080 / 23,6" / 60 cm
  const ref = { yaw: 0, pitch: 0, roll: 0 };
  const dxPara = (yaw: number) => deslocamentoPorPose({ yaw, pitch: 0, roll: 0 }, ref, DIST).dx;

  it('o peso é 1 bem antes do limiar e 0 bem depois — a rejeição continua', () => {
    expect(pesoDaCompensacao(0)).toBe(1);
    expect(pesoDaCompensacao(DELTA_POSE_MAX_RAD - DELTA_POSE_FAIXA_RAD)).toBe(1);
    expect(pesoDaCompensacao(DELTA_POSE_MAX_RAD + DELTA_POSE_FAIXA_RAD)).toBe(0);
    expect(pesoDaCompensacao(Math.PI / 3)).toBe(0); // 60° = matriz degenerada
    expect(dxPara(Math.PI / 3)).toBe(0);
  });

  it('no meio da faixa o peso é 0,5 — leitura honesta de "não sei"', () => {
    expect(pesoDaCompensacao(DELTA_POSE_MAX_RAD)).toBeCloseTo(0.5, 6);
  });

  it('o maior salto encolhe junto com o passo da varredura (é rampa, não degrau)', () => {
    const varrer = (passoRad: number): number => {
      let maior = 0;
      let anterior = dxPara(0);
      for (let a = passoRad; a <= Math.PI / 2.5; a += passoRad) {
        const v = dxPara(a);
        maior = Math.max(maior, Math.abs(v - anterior));
        anterior = v;
      }
      return maior;
    };
    const grosso = varrer(0.01);
    const fino = varrer(0.001);
    // Numa descontinuidade o maior salto fica preso no tamanho do degrau
    // (~1273 px) por menor que seja o passo. Numa rampa, ele encolhe.
    expect(fino).toBeLessThan(grosso * 0.3);
    expect(fino).toBeLessThan(20);
  });

  it('o sinal é contínuo ao cruzar o limiar antigo em passos minúsculos', () => {
    const antes = dxPara(DELTA_POSE_MAX_RAD - 1e-4);
    const depois = dxPara(DELTA_POSE_MAX_RAD + 1e-4);
    // Antes desta correção, estes dois pontos diferiam em ~1273 px — o degrau
    // inteiro. Agora diferem pelo declive local da rampa, ~2 px, ou seja
    // ~600× menos. O que importa é que o número encolhe com o passo (teste
    // acima); este aqui fixa a ordem de grandeza.
    expect(Math.abs(depois - antes)).toBeLessThan(5);
  });
});
