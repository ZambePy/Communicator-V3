import { afterEach, describe, it, expect } from 'vitest';
import { BlinkDetector, PISCADA_MAX_MS, EAR_THR_MIN, DECISAO_DA_PALPEBRA_MS } from './extractor';
import { EXPERIMENT } from './config/experiment';

/**
 * PÁLPEBRA BAIXA NÃO É PISCADA — e confundir as duas congela o cursor.
 *
 * O limiar do detector é adaptativo (`média do repouso × 0,8`), e o histórico
 * de repouso só recebia quadros classificados como NÃO-piscada. Isso trancava
 * o detector: olhar para baixo — que é o que se faz o tempo todo no teclado
 * ocular — abaixa a pálpebra, o EAR cai abaixo do limiar, o quadro vira
 * "piscada", por ser piscada não entra no histórico, a média não desce, o
 * limiar não desce, e o episódio dura enquanto a pessoa olhar para baixo.
 *
 * Do lado de fora: o cursor CONGELA. Medido numa gravação de 24 s no teclado,
 * 30 % dos quadros parados; em t ≈ 8,6 s a posição ficou idêntica por 15
 * quadros (500 ms) com o cursor vermelho sobre uma tecla.
 */

const DT = 1000 / 30;

/** Alimenta `n` quadros de repouso para o limiar adaptativo se formar. */
function assentar(d: BlinkDetector, earRepouso: number, n = 40, t0 = 1000): number {
  let t = t0;
  for (let i = 0; i < n; i++) { d.update(earRepouso, t); t += DT; }
  return t;
}

describe('olhar para baixo não pode virar piscada permanente', () => {
  it('o episódio termina sozinho: o limiar desce até a pálpebra nova', () => {
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);           // repouso olhando para a frente
    // Olha para baixo: o EAR cai para 0,22 — abaixo de 0,31×0,8 = 0,248,
    // mas MUITO acima do piso de 0,12. É pálpebra, não olho fechado.
    const estados: boolean[] = [];
    for (let i = 0; i < 90; i++) { estados.push(d.update(0.22, t)); t += DT; }

    // Começa como piscada (é o que o limiar antigo diz)...
    expect(estados[0]).toBe(true);
    // ...e PARA, depois de o limiar adaptar. Antes disto, os 90 quadros
    // (3 segundos) saíam todos como piscada e o cursor ficava congelado.
    expect(estados.at(-1)).toBe(false);
    const parou = estados.indexOf(false);
    expect(parou).toBeGreaterThan(0);
    // No teto FISIOLÓGICO, não quando o limiar terminar de adaptar. A versão
    // anterior levava ~1,1 s aqui (e 1,7 s com EAR 0,15), que é o
    // congelamento de 0,7–1,1 s medido na gravação de 22/09 com óculos.
    expect(parou * DT).toBeLessThanOrEqual(PISCADA_MAX_MS + DT);
    // E não volta a congelar enquanto a pálpebra fica baixa.
    expect(estados.slice(parou).every((b) => b === false)).toBe(true);
  });

  it('a pálpebra muito baixa (mas aberta) também solta no teto fisiológico', () => {
    for (const baixo of [0.2, 0.18, 0.15, EAR_THR_MIN]) {
      const d = new BlinkDetector();
      let t = assentar(d, 0.31);
      let congelado = 0;
      for (let i = 0; i < 90; i++) {
        if (!d.update(baixo, t)) break;
        congelado++;
        t += DT;
      }
      expect(congelado * DT, `EAR ${baixo}`).toBeLessThanOrEqual(PISCADA_MAX_MS + DT);
    }
  });

  it('uma piscada real DURANTE a pálpebra baixa ainda é detectada', () => {
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    for (let i = 0; i < 60; i++) { d.update(0.22, t); t += DT; }   // olhando para baixo, já solto
    expect(d.update(0.22, t)).toBe(false);
    t += DT;
    // Fechar o olho leva o EAR abaixo do piso: é piscada, sem esperar nada.
    expect(d.update(0.06, t)).toBe(true);
  });

  it('uma piscada de verdade continua sendo piscada do começo ao fim', () => {
    // 300 ms abaixo do limiar: dentro de `PISCADA_MAX_MS`. Nenhum quadro pode
    // escapar, senão o dwell volta a contar no meio da piscada e a posição de
    // olho fechado entra no modelo.
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    const n = Math.round(300 / DT);
    for (let i = 0; i < n; i++) {
      expect(d.update(0.08, t), `quadro ${i}`).toBe(true);
      t += DT;
    }
    expect(PISCADA_MAX_MS).toBeGreaterThanOrEqual(300);
  });

  it('olho REALMENTE fechado continua sendo piscada, por mais que dure', () => {
    // A guarda que torna a adaptação segura: com o olho fechado o EAR fica
    // abaixo do piso do limiar (`EAR_THR_MIN`), então adaptar não muda nada e
    // o `BlinkHold` segue cuidando do teto de 2 s.
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    const fechado = EAR_THR_MIN * 0.5;
    for (let i = 0; i < 150; i++) {       // 5 segundos
      expect(d.update(fechado, t), `quadro ${i}`).toBe(true);
      t += DT;
    }
  });

  it('o teto é o fisiológico, não um número solto', () => {
    // Piscada espontânea: 100–400 ms. O teto tem que caber essa faixa inteira
    // e ficar bem abaixo dos 2 s do `BlinkHold`.
    expect(PISCADA_MAX_MS).toBeGreaterThanOrEqual(300);
    expect(PISCADA_MAX_MS).toBeLessThanOrEqual(600);
  });

  it('voltar a olhar para a frente não deixa resíduo', () => {
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    for (let i = 0; i < 90; i++) { d.update(0.22, t); t += DT; }   // olha para baixo
    for (let i = 0; i < 30; i++) { d.update(0.31, t); t += DT; }   // volta
    // E uma piscada real logo depois ainda é detectada.
    expect(d.update(0.08, t)).toBe(true);
  });

  it('reset limpa o relógio do episódio', () => {
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    for (let i = 0; i < 20; i++) { d.update(0.22, t); t += DT; }
    d.reset();
    t = assentar(d, 0.31, 40, t);
    // Depois do reset, o primeiro quadro baixo é o começo de um episódio novo.
    expect(d.update(0.22, t)).toBe(true);
  });
});

// M27 — o teto de 400 ms continuava congelando o cursor a CADA vez que a
// pessoa olhava para baixo: o vídeo de 06/11/2026 tem congelamentos de
// exatamente 12–13 quadros (400 ms + o quadro pendente do estimador) seguidos
// de saltos de 115–360 px, um a cada poucos segundos no teclado. Piscada de
// verdade fecha: o EAR cai abaixo de ~0,45× o repouso em 2–3 quadros. A
// pálpebra baixa fica na faixa do meio. Se o episódio não chega lá no fundo em
// `DECISAO_DA_PALPEBRA_MS`, é pálpebra, e o cursor volta a andar.
describe('pálpebra baixa solta cedo (M27)', () => {
  const salvo = EXPERIMENT.palpebraBaixaRapida;
  afterEach(() => { EXPERIMENT.palpebraBaixaRapida = salvo; });

  /** Quantos ms o detector segura a pálpebra baixa (EAR `baixo`, repouso 0,31). */
  function congelamento(baixo: number, rapida: boolean): number {
    EXPERIMENT.palpebraBaixaRapida = rapida;
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    let congelado = 0;
    for (let i = 0; i < 90; i++) {
      if (!d.update(baixo, t)) break;
      congelado++;
      t += DT;
    }
    return congelado * DT;
  }

  it('olhando para baixo (EAR 0,22 e 0,18 com repouso 0,31): solta em até ~170 ms, não em 400', () => {
    for (const baixo of [0.22, 0.18]) {
      expect(congelamento(baixo, false), `antes, EAR ${baixo}`).toBeGreaterThan(350);
      expect(congelamento(baixo, true), `M27, EAR ${baixo}`).toBeLessThanOrEqual(DECISAO_DA_PALPEBRA_MS + DT);
    }
  });

  it('a decisão não chega antes do fim de uma piscada rápida, nem de uma parcial', () => {
    EXPERIMENT.palpebraBaixaRapida = true;
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    // ~130 ms abaixo do limiar sem chegar ao fundo (0,45 × 0,31 ≈ 0,14): uma
    // piscada incompleta, que segue piscada do começo ao fim.
    for (const ear of [0.24, 0.2, 0.17, 0.19, 0.23]) {
      expect(d.update(ear, t), `EAR ${ear}`).toBe(true);
      t += DT;
    }
    expect(d.update(0.31, t)).toBe(false);
  });

  it('piscada de verdade, que passa pela faixa do meio ao fechar e ao abrir: todos os quadros abaixo do limiar são piscada', () => {
    EXPERIMENT.palpebraBaixaRapida = true;
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    // Fecha em ~3 quadros, fica fechada, abre devagar (a abertura é a parte lenta).
    const perfil = [0.24, 0.15, 0.07, 0.05, 0.05, 0.06, 0.09, 0.13, 0.17, 0.2, 0.23, 0.31];
    const limiar = 0.31 * 0.8;
    for (const ear of perfil) {
      const piscada = d.update(ear, t);
      if (ear < limiar) expect(piscada, `EAR ${ear}`).toBe(true);
      t += DT;
    }
  });

  it('pálpebra que desce devagar até a faixa do meio também solta cedo', () => {
    EXPERIMENT.palpebraBaixaRapida = true;
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    const estados: boolean[] = [];
    for (const ear of [0.29, 0.27, 0.25, 0.24, 0.23, 0.22, 0.22, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21]) {
      estados.push(d.update(ear, t));
      t += DT;
    }
    const congelados = estados.filter(Boolean).length;
    expect(congelados * DT).toBeLessThanOrEqual(DECISAO_DA_PALPEBRA_MS + DT);
    expect(estados.at(-1)).toBe(false);
  });

  it('uma piscada DEPOIS de a pálpebra baixa soltar continua piscada até reabrir', () => {
    // Fechou (abaixo do fundo): a reabertura, que passa devagar pela faixa do
    // meio, ainda é piscada. Antes, com o episódio de pálpebra baixa aberto
    // havia mais de 400 ms, a reabertura acima do piso saía como olhar válido
    // — o olho meio fechado entrava no cursor.
    EXPERIMENT.palpebraBaixaRapida = true;
    const d = new BlinkDetector();
    let t = assentar(d, 0.31);
    for (let i = 0; i < 30; i++) { d.update(0.22, t); t += DT; }
    for (const ear of [0.1, 0.06, 0.05, 0.06, 0.1, 0.14, 0.17]) {
      expect(d.update(ear, t), `EAR ${ear}`).toBe(true);
      t += DT;
    }
  });
});

// Revisão de 06/11/2026: o episódio de EAR baixo "fechava" uma vez só (o
// primeiro quadro no fundo) e só reabria acima do limiar — que a pálpebra
// baixa nunca cruza. Uma piscada enquanto a pessoa olha o teclado voltava a
// segurar o cursor ~400 ms; a segunda piscada do mesmo episódio deixava passar
// o olho meio fechado; e uma descida lenta do EAR saía como olhar aos 150 ms, no
// meio do fechamento.
describe('M27: piscada dentro da pálpebra baixa e as transições', () => {
  const salvo = EXPERIMENT.palpebraBaixaRapida;
  afterEach(() => { EXPERIMENT.palpebraBaixaRapida = salvo; });

  /** Detector com repouso 0,31 e o M27 ligado; devolve o detector e o relógio. */
  function comM27(): { d: BlinkDetector; t: number } {
    EXPERIMENT.palpebraBaixaRapida = true;
    const d = new BlinkDetector();
    return { d, t: assentar(d, 0.31) };
  }

  /** Alimenta a sequência e devolve o estado de cada quadro. */
  function passar(d: BlinkDetector, t0: number, ears: number[]): { estados: boolean[]; t: number } {
    let t = t0;
    const estados = ears.map((ear) => { const b = d.update(ear, t); t += DT; return b; });
    return { estados, t };
  }

  const repetir = (ear: number, n: number) => Array.from({ length: n }, () => ear);

  it('um quadro no fundo durante a pálpebra baixa já solta segura só a piscada, não 400 ms', () => {
    const { d, t } = comM27();
    // 400 ms de pálpebra baixa: solta, e o limiar ainda acima dela.
    const antes = passar(d, t, repetir(0.2, 12));
    expect(antes.estados.at(-1)).toBe(false);                 // já solta
    const depois = passar(d, antes.t, [0.09, ...repetir(0.2, 15)]);
    // O quadro no fundo é piscada; a volta ao nível da pálpebra, não.
    expect(depois.estados[0]).toBe(true);
    expect(depois.estados.filter(Boolean).length).toBeLessThanOrEqual(2);
  });

  it('duas piscadas no mesmo episódio: o fechamento e a reabertura das duas são piscada, a pálpebra entre elas não', () => {
    const { d, t } = comM27();
    // Pálpebra em 0,18: o limiar adaptado (~0,22–0,23) continua acima dela, e o
    // episódio de EAR baixo segue aberto pelas duas piscadas.
    const piscada = [0.13, 0.07, 0.05, 0.07, 0.12, 0.15];
    let r = passar(d, t, repetir(0.18, 12));
    for (let k = 0; k < 2; k++) {
      r = passar(d, r.t, piscada);
      r.estados.forEach((b, i) => expect(b, `piscada ${k + 1}, EAR ${piscada[i]}`).toBe(true));
      r = passar(d, r.t, repetir(0.18, 12));                   // 400 ms olhando para baixo
      r.estados.forEach((b, i) => expect(b, `pálpebra depois da piscada ${k + 1}, quadro ${i}`).toBe(false));
    }
  });

  it('piscada junto com a descida do olhar: solta quando a pálpebra assenta, não 400 ms depois do fundo', () => {
    const { d, t } = comM27();
    // Fecha, reabre já olhando para baixo e a pálpebra fica em 0,22.
    const perfil = [0.2, 0.1, 0.05, 0.06, 0.1, 0.15, 0.19, 0.21, 0.22, ...repetir(0.22, 12)];
    const { estados } = passar(d, t, perfil);
    // Do fechamento à reabertura (até 0,19), piscada.
    for (let i = 0; i <= 6; i++) expect(estados[i], `quadro ${i}, EAR ${perfil[i]}`).toBe(true);
    // Solta até 3 quadros depois de a pálpebra chegar ao nível (0,21 no quadro 7).
    const solta = estados.indexOf(false);
    expect(solta).toBeGreaterThan(6);
    expect(solta).toBeLessThanOrEqual(10);
    expect(estados.slice(solta).every((b) => !b)).toBe(true);
  });

  it('fechamento lento, que leva mais de 150 ms do limiar ao fundo: nenhum quadro do fechamento sai como olhar', () => {
    const { d, t } = comM27();
    // ~0,018 por quadro: 0,245 → 0,14 em ~6 quadros (200 ms). Depois fecha, abre.
    const perfil = [0.245, 0.227, 0.209, 0.191, 0.173, 0.155, 0.137, 0.11, 0.07, 0.05, 0.06, 0.1, 0.15, 0.2, 0.24];
    const { estados } = passar(d, t, perfil);
    estados.forEach((b, i) => expect(b, `quadro ${i}, EAR ${perfil[i]}`).toBe(true));
  });

  it('depois de um fechamento longo, a reabertura continua piscada até voltar acima do limiar', () => {
    const { d, t } = comM27();
    const perfil = [...repetir(0.05, 18), 0.09, 0.14, 0.18, 0.21, 0.24];   // 600 ms fechado
    const { estados } = passar(d, t, perfil);
    estados.forEach((b, i) => expect(b, `quadro ${i}, EAR ${perfil[i]}`).toBe(true));
  });

  it('pálpebra baixa com o ruído do EAR (±0,01): solta cedo e não volta a segurar', () => {
    const { d, t } = comM27();
    const ruido = [0, 0.008, -0.006, 0.01, -0.01, 0.004, -0.008, 0.006, -0.002, 0.009, -0.007, 0.003];
    const perfil = Array.from({ length: 90 }, (_, i) => 0.21 + ruido[i % ruido.length]);
    const { estados } = passar(d, t, perfil);
    const solta = estados.indexOf(false);
    expect(solta * DT).toBeLessThanOrEqual(DECISAO_DA_PALPEBRA_MS + 2 * DT);
    expect(estados.slice(solta).filter(Boolean).length).toBe(0);
  });
});
