import { describe, it, expect } from 'vitest';
import { BlinkDetector, PISCADA_MAX_MS, EAR_THR_MIN } from './extractor';

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
