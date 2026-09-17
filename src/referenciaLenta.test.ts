import { describe, it, expect } from 'vitest';
import {
  ReferenciaLenta,
  constanteDeTempoValida,
  deltaDePose,
  TAU_MIN_S,
  TAU_MAX_S,
  TAU_PADRAO_S,
  RESIDUO_MAX_DEG,
  RESIDUO_MAX_CM,
} from './referenciaLenta';
import type { Pose } from './poseCompensation';
import type { EscalaFacial } from './translationCompensation';

const RAD = Math.PI / 180;
const QUADRO_MS = 1000 / 30;

const REF: Pose = { yaw: 0, pitch: 0, roll: 0 };
const CENTRO = { x: 0.5, y: 0.5 };
/** 1920×1080, cantal 250 px ↔ 9 cm → 1 % da largura ≈ 0,69 cm. */
const ESCALA: EscalaFacial = { iodPx: 250, videoWidth: 1920, videoHeight: 1080 };
/** Centro deslocado `cm` na horizontal a partir de `CENTRO`, na escala acima. */
function centroACm(cm: number) {
  return { x: 0.5 + (cm * ESCALA.iodPx) / (9 * ESCALA.videoWidth), y: 0.5 };
}

function nova(opts?: ConstructorParameters<typeof ReferenciaLenta>[0]): ReferenciaLenta {
  const r = new ReferenciaLenta(opts);
  r.iniciar({ pose: REF, centro: CENTRO });
  return r;
}

describe('constante de tempo', () => {
  it('padrão 30 s; aceita 20–45 e corrige o resto para a faixa', () => {
    expect(constanteDeTempoValida(undefined)).toBe(TAU_PADRAO_S);
    expect(constanteDeTempoValida(25)).toBe(25);
    expect(constanteDeTempoValida(45)).toBe(TAU_MAX_S);
    // PROIBIDO 1–2 s: engoliria o próprio olhar.
    expect(constanteDeTempoValida(1.5)).toBe(TAU_MIN_S);
    expect(constanteDeTempoValida(600)).toBe(TAU_MAX_S);
    expect(constanteDeTempoValida(NaN)).toBe(TAU_PADRAO_S);
  });
});

describe('referência lenta', () => {
  it('(a) nasce na referência da calibração', () => {
    const r = nova();
    expect(r.pose).toEqual(REF);
    expect(r.centro).toEqual(CENTRO);
    expect(r.iniciada).toBe(true);
  });

  it('deriva de 5° em 30 min é absorvida — Δ → 0', () => {
    const r = nova();
    const total = 30 * 60 * 1000;
    let t = 0;
    let pose: Pose = REF;
    while (t <= total) {
      const frac = t / total;
      pose = { yaw: 5 * RAD * frac, pitch: 5 * RAD * frac, roll: 0 };
      r.atualizar({ pose, centro: { x: 0.5 + 0.03 * frac, y: 0.5 } }, t, true);
      t += QUADRO_MS;
    }
    const d = deltaDePose(pose, r.pose);
    // Rampa de 5° em 1800 s com τ = 30 s: atraso de regime ≈ 5°·(30/1800) ≈ 0,08°.
    expect(Math.abs(d.yaw) / RAD).toBeLessThan(0.2);
    expect(Math.abs(d.pitch) / RAD).toBeLessThan(0.2);
    expect(Math.abs(0.53 - (r.centro?.x ?? 0))).toBeLessThan(0.002);
  });

  it('virada rápida de 15° em 200 ms entra INTEIRA no Δ', () => {
    const r = nova();
    let t = 0;
    // 3 s parado, para a EMA estar em regime.
    for (; t < 3000; t += QUADRO_MS) r.atualizar({ pose: REF, centro: CENTRO }, t, true);
    // Virada: 15° em 200 ms (75°/s).
    const t0 = t;
    let pose: Pose = REF;
    for (let k = 1; k <= 6; k++) {
      t = t0 + k * QUADRO_MS;
      pose = { yaw: 15 * RAD * Math.min(1, (t - t0) / 200), pitch: 0, roll: 0 };
      r.atualizar({ pose, centro: CENTRO }, t, true);
    }
    expect(pose.yaw / RAD).toBeCloseTo(15, 6);
    expect(r.motivoDoCongelamento).toBe('movimento_rapido');
    const d = deltaDePose(pose, r.pose);
    expect(d.yaw / RAD).toBeCloseTo(15, 3);
  });

  it('(e) SEGURAR a virada não é absorvido: a EMA para no resíduo grande', () => {
    // Este é o caso que a guarda de velocidade sozinha não pega: depois que a
    // cabeça para na pose desviada, a velocidade é zero e a EMA recomeçaria a
    // perseguir, comendo a compensação com a pessoa ainda olhando para lá.
    const r = nova();
    const virada: Pose = { yaw: 10 * RAD, pitch: 0, roll: 0 };
    let t = 0;
    for (; t < 120_000; t += QUADRO_MS) r.atualizar({ pose: virada, centro: CENTRO }, t, true);
    expect(r.motivoDoCongelamento).toBe('residuo_grande');
    expect(r.pose).toEqual(REF);
    // O Δ continua valendo os 10° inteiros depois de 4τ.
    expect(deltaDePose(virada, r.pose).yaw / RAD).toBeCloseTo(10, 6);
    expect(r.residuoPoseDeg).toBeCloseTo(10, 6);
    expect(r.msCongeladoPorResiduo).toBeGreaterThan(100_000);
  });

  it('(e) a guarda se desfaz sozinha quando a cabeça volta', () => {
    const r = nova();
    const virada: Pose = { yaw: 10 * RAD, pitch: 0, roll: 0 };
    let t = 0;
    for (; t < 30_000; t += QUADRO_MS) r.atualizar({ pose: virada, centro: CENTRO }, t, true);
    expect(r.motivoDoCongelamento).toBe('residuo_grande');
    // Volta devagar o bastante para não acionar (d), até um desvio pequeno.
    const perto: Pose = { yaw: 2 * RAD, pitch: 0, roll: 0 };
    for (let k = 0; k < 40; k++, t += QUADRO_MS) {
      const frac = Math.min(1, k / 39);
      r.atualizar({ pose: { yaw: (10 - 8 * frac) * RAD, pitch: 0, roll: 0 }, centro: CENTRO }, t, true);
    }
    for (; t < 60_000; t += QUADRO_MS) r.atualizar({ pose: perto, centro: CENTRO }, t, true);
    expect(r.motivoDoCongelamento).toBeNull();
    expect(r.msCongeladoPorResiduo).toBe(0);
    expect(r.passosDados).toBeGreaterThan(0);
    // Com o resíduo pequeno a EMA volta a absorver normalmente.
    expect(r.pose!.yaw / RAD).toBeGreaterThan(1);
  });

  it('(e) tem histerese: o jitter em torno do limiar não vira catraca', () => {
    // Virada mantida logo acima do limiar, com o jitter de ~0,3°/quadro do
    // MediaPipe. Sem histerese, os quadros que caem sob 8° dão um passo cada,
    // cada passo encurta o resíduo, e a virada inteira acaba absorvida.
    const r = nova();
    let semente = 1;
    const ruido = () => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return ((semente / 2147483648) - 0.5) * 0.8; // ±0,4°
    };
    let t = 0;
    for (; t < 120_000; t += QUADRO_MS) {
      r.atualizar({ pose: { yaw: (8.3 + ruido()) * RAD, pitch: 0, roll: 0 }, centro: CENTRO }, t, true);
    }
    // A referência de pose não pode ter sido raspada.
    expect(Math.abs(r.pose!.yaw) / RAD).toBeLessThan(0.05);
  });

  it('(e) é POR EIXO: escorregar na cadeira não desliga o relógio da pose', () => {
    // O argumento de julgar os dois eixos juntos é de (d) — a virada mexe nos
    // dois. Aqui o tronco anda e a cabeça não: congelar a pose junto deixaria
    // a deriva do estimador de pose sem absorção pelo resto da sessão.
    const r = nova();
    let t = 0;
    const longe = centroACm(RESIDUO_MAX_CM + 2);
    // Escorrega devagar o bastante para (d) deixar passar... e mesmo assim a
    // pose deriva 3° (sob o limiar) e precisa continuar sendo absorvida.
    const deriva: Pose = { yaw: 3 * RAD, pitch: 0, roll: 0 };
    for (; t < 90_000; t += QUADRO_MS) {
      r.atualizar({ pose: deriva, centro: longe, escala: ESCALA }, t, true);
    }
    expect(r.congeladoPorResiduo).toEqual({ pose: false, centro: true });
    expect(r.centro).toEqual(CENTRO);
    expect(r.pose!.yaw / RAD).toBeGreaterThan(2.5);
  });

  it('(e) mede a translação em cm, não em fração do quadro', () => {
    // Em 16:9 a mesma fração vale ~1,8× mais cm na horizontal que na vertical.
    // Medir em fração faria o eixo vertical — o do tronco que afunda — disparar
    // com metade do deslocamento físico do horizontal.
    const r = nova();
    const dentro = centroACm(RESIDUO_MAX_CM - 1.5);
    let t = 0;
    for (; t < 30_000; t += QUADRO_MS) r.atualizar({ pose: REF, centro: dentro, escala: ESCALA }, t, true);
    expect(r.congeladoPorResiduo.centro).toBe(false);
    expect(r.residuoCentroCm).toBeLessThan(RESIDUO_MAX_CM);
    // Um τ absorve ~63 % do caminho; o que importa é que a EMA ANDOU.
    expect(r.centro!.x - CENTRO.x).toBeGreaterThan((dentro.x - CENTRO.x) * 0.5);
  });

  it('sem escala o eixo de translação não congela por (e)', () => {
    const r = nova();
    let t = 0;
    const longe = centroACm(20);
    for (; t < 30_000; t += QUADRO_MS) r.atualizar({ pose: REF, centro: longe }, t, true);
    expect(r.congeladoPorResiduo.centro).toBe(false);
    expect(r.residuoCentroCm).toBe(0);
  });

  it('o relógio de (e) conta tempo de parede, inclusive quadros inválidos', () => {
    const r = nova();
    const virada: Pose = { yaw: 12 * RAD, pitch: 0, roll: 0 };
    let t = 0;
    for (; t < 3000; t += QUADRO_MS) r.atualizar({ pose: virada, centro: CENTRO }, t, true);
    expect(r.msCongeladoPorResiduo).toBeGreaterThan(2900);
    // 20 s sem rosto, com a cabeça na mesma pose: o relógio não para.
    const antes = r.msCongeladoPorResiduo;
    for (; t < 23_000; t += QUADRO_MS) r.atualizar({ pose: null, centro: null }, t, false);
    expect(r.msCongeladoPorResiduo).toBeGreaterThan(antes + 19_000);
  });

  it('deriva postural rápida (10° em 1 min) ainda é absorvida: fica sob o limiar', () => {
    // O atraso de regime de uma rampa de 0,17°/s com τ = 30 s é ~5°, abaixo de
    // RESIDUO_MAX_DEG — a guarda (e) não pode confundir escorregão com gesto.
    const r = nova();
    const total = 60_000;
    let t = 0;
    let pose: Pose = REF;
    let congelou = false;
    while (t <= total) {
      pose = { yaw: 10 * RAD * (t / total), pitch: 0, roll: 0 };
      r.atualizar({ pose, centro: CENTRO }, t, true);
      if (r.motivoDoCongelamento === 'residuo_grande') congelou = true;
      t += QUADRO_MS;
    }
    expect(congelou).toBe(false);
    expect(r.residuoPoseDeg).toBeLessThan(RESIDUO_MAX_DEG);
    expect(r.pose!.yaw / RAD).toBeGreaterThan(4);
  });

  it('(b) quadro inválido não entra', () => {
    const r = nova();
    const longe: Pose = { yaw: 20 * RAD, pitch: 20 * RAD, roll: 0 };
    let t = 0;
    for (; t < 60_000; t += QUADRO_MS) r.atualizar({ pose: longe, centro: { x: 0.9, y: 0.9 } }, t, false);
    expect(r.pose).toEqual(REF);
    expect(r.centro).toEqual(CENTRO);
    expect(r.passosDados).toBe(0);
    expect(r.motivoDoCongelamento).toBe('invalido');
  });

  it('(c) perda de rosto congela; a retomada não salta', () => {
    const r = nova();
    const pose: Pose = { yaw: 2 * RAD, pitch: 0, roll: 0 };
    let t = 0;
    for (; t < 5000; t += QUADRO_MS) r.atualizar({ pose, centro: CENTRO }, t, true);
    const antesDoBuraco = r.pose!.yaw;
    // 20 s sem rosto.
    for (; t < 25_000; t += QUADRO_MS) r.atualizar({ pose: null, centro: null }, t, false);
    expect(r.pose!.yaw).toBe(antesDoBuraco);
    // Rosto volta numa pose diferente, mas dentro do limiar de resíduo. Sem o
    // limite de dt, o primeiro passo usaria 20 s de dt e a referência pularia
    // ~49 % do caminho de uma vez.
    const nova2: Pose = { yaw: 6 * RAD, pitch: 0, roll: 0 };
    r.atualizar({ pose: nova2, centro: CENTRO }, t, true);
    expect(r.motivoDoCongelamento).toBe('retomada');
    expect(r.pose!.yaw).toBe(antesDoBuraco);
    t += QUADRO_MS;
    r.atualizar({ pose: nova2, centro: CENTRO }, t, true);
    const passo = r.pose!.yaw - antesDoBuraco;
    // Um passo de 33 ms com τ = 30 s move ~0,11 % dos 4° restantes.
    expect(passo / RAD).toBeLessThan(0.02);
    expect(passo).toBeGreaterThan(0);
  });

  it('(c)+(e) voltar de um buraco numa pose MUITO diferente não é absorvido', () => {
    // "Sentei diferente enquanto o rosto estava fora": a EMA não pode decidir
    // sozinha que a pose nova é a certa — quem resolve isso é a reancoragem.
    const r = nova();
    let t = 0;
    for (; t < 5000; t += QUADRO_MS) r.atualizar({ pose: REF, centro: CENTRO }, t, true);
    for (; t < 25_000; t += QUADRO_MS) r.atualizar({ pose: null, centro: null }, t, false);
    const outra: Pose = { yaw: 14 * RAD, pitch: 0, roll: 0 };
    r.atualizar({ pose: outra, centro: CENTRO }, t, true);
    for (let k = 0; k < 300; k++) {
      t += QUADRO_MS;
      r.atualizar({ pose: outra, centro: CENTRO }, t, true);
    }
    expect(r.motivoDoCongelamento).toBe('residuo_grande');
    expect(r.pose!.yaw).toBe(0);
  });

  it('reinício (`iniciar`) volta à referência dada, sem histórico', () => {
    const r = nova();
    let t = 0;
    for (; t < 60_000; t += QUADRO_MS) {
      r.atualizar({ pose: { yaw: 8 * RAD, pitch: 0, roll: 0 }, centro: CENTRO }, t, true);
    }
    expect(r.pose!.yaw).toBeGreaterThan(0);
    const novaRef: Pose = { yaw: 3 * RAD, pitch: 1 * RAD, roll: 0 };
    r.iniciar({ pose: novaRef, centro: { x: 0.4, y: 0.6 } });
    expect(r.pose).toEqual(novaRef);
    expect(r.passosDados).toBe(0);
    // O quadro seguinte não pode saltar por causa do relógio antigo.
    r.atualizar({ pose: novaRef, centro: { x: 0.4, y: 0.6 } }, t + 100_000, true);
    expect(r.pose).toEqual(novaRef);
  });

  it('não iniciada, `atualizar` é inerte', () => {
    const r = new ReferenciaLenta();
    r.atualizar({ pose: REF, centro: CENTRO }, 0, true);
    r.atualizar({ pose: REF, centro: CENTRO }, 33, true);
    expect(r.iniciada).toBe(false);
    expect(r.pose).toBeNull();
  });

  it('escorregão rápido na cadeira (translação) também congela', () => {
    const r = nova();
    let t = 0;
    for (; t < 2000; t += QUADRO_MS) r.atualizar({ pose: REF, centro: CENTRO }, t, true);
    // 8 % do quadro em 200 ms = 0,4/s, bem acima do limiar.
    r.atualizar({ pose: REF, centro: { x: 0.5 + 0.08 * (QUADRO_MS / 200), y: 0.5 } }, t, true);
    expect(r.motivoDoCongelamento).toBe('movimento_rapido');
    expect(r.centro).toEqual(CENTRO);
  });
});
