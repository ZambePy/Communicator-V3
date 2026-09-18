import { describe, it, expect } from 'vitest';
import { SuavizadorDeAngulos, TAU_MAX_MS, faixaDeSoltura } from './suavizacao';

const RAD = Math.PI / 180;

describe('SuavizadorDeAngulos', () => {
  it('reduz o ruído durante a fixação sem mudar a média', () => {
    const s = new SuavizadorDeAngulos();
    let seed = 3;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
    const cru: number[] = [];
    const suave: number[] = [];
    for (let i = 0; i < 300; i++) {
      const yaw = 5 * RAD + 2 * RAD * rnd();   // ±1° de ruído em torno de 5°
      cru.push(yaw);
      suave.push(s.processar(yaw, 0, i * 100).yaw);
    }
    const desvio = (v: number[]) => {
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    };
    expect(desvio(suave)).toBeLessThan(desvio(cru) * 0.8);
    const mediaSuave = suave.slice(50).reduce((a, b) => a + b, 0) / (suave.length - 50);
    expect(mediaSuave / RAD).toBeCloseTo(5, 0);
  });

  it('solta na sacada: a leitura crua sai inteira, sem atraso', () => {
    const s = new SuavizadorDeAngulos();
    for (let i = 0; i < 10; i++) s.processar(0, 0, i * 100);
    // 15° em 100 ms = 150°/s.
    const r = s.processar(15 * RAD, 0, 1000);
    expect(r.soltou).toBe(true);
    expect(r.yaw).toBe(15 * RAD);
    // E a EMA recomeça dali: a leitura seguinte é suavizada em torno de 15°.
    const r2 = s.processar(15.5 * RAD, 0, 1100);
    expect(r2.soltou).toBe(false);
    expect(r2.yaw / RAD).toBeGreaterThan(15);
    expect(r2.yaw / RAD).toBeLessThan(15.5);
  });

  it('a mesma inferência lida de novo (rAF entre inferências) não move a EMA', () => {
    const s = new SuavizadorDeAngulos();
    s.processar(0, 0, 0);
    const a = s.processar(2 * RAD, 0, 100);
    const b = s.processar(2 * RAD, 0, 100);
    const c = s.processar(2 * RAD, 0, 100);
    expect(b.yaw).toBe(a.yaw);
    expect(c.yaw).toBe(a.yaw);
  });

  it('a constante de tempo nunca passa de 150 ms', () => {
    const s = new SuavizadorDeAngulos({ constanteDeTempoMs: 5000 });
    s.processar(0, 0, 0);
    // Degrau de 3° em 300 ms = 10 °/s: abaixo do início da `faixaDeSoltura`,
    // então `g = 0` e o passo é o da EMA pura. (Antes este caso usava 100 ms =
    // 30 °/s, que hoje cai DENTRO da rampa de soltura e mediria as duas coisas
    // ao mesmo tempo.) Com τ = 150 ms a EMA anda 1 − e^(−300/150) ≈ 86 %.
    const r = s.processar(3 * RAD, 0, 300);
    const fracao = r.yaw / (3 * RAD);
    expect(r.fracaoDeSoltura).toBe(0);
    expect(fracao).toBeCloseTo(1 - Math.exp(-300 / TAU_MAX_MS), 6);
  });

  // --- Regressão: a soltura não pode ser um degrau -------------------------
  //
  // A versão anterior tinha limiar único em 40 °/s. Como a EMA fica ~44 % atrás
  // da leitura crua numa cadência de 100 ms, todo cruzamento do limiar jogava
  // esse atraso na saída de uma vez: a 38,5 px/grau, ~68 px de degrau no termo
  // dominante do vetor de features, antes do Ridge. Nas gravações de tela isso
  // aparecia como o cursor "parando e teleportando".
  describe('soltura contínua (sem degrau no limiar)', () => {
    /** Saída do suavizador para um degrau de `graus` aplicado em `dtMs`. */
    function saidaParaVelocidade(graus: number, dtMs: number): number {
      const s = new SuavizadorDeAngulos();
      // Assenta a EMA em 0 com passos lentos (10 °/s, fora da rampa).
      for (let i = 0; i < 12; i++) s.processar(0, 0, i * 300);
      // Último assentamento em t = 11*300 = 3300; o degrau vem dtMs depois.
      return s.processar(graus * RAD, 0, 11 * 300 + dtMs).yaw / RAD;
    }

    it('velocidades vizinhas produzem saídas vizinhas em torno do meio da rampa', () => {
      // 40 °/s era o limiar antigo. Amostramos 39,5 e 40,5 °/s: no desenho
      // antigo a saída pulava de "EMA" para "cru" entre estes dois pontos.
      const dtMs = 100;
      const a = saidaParaVelocidade(39.5 * (dtMs / 1000), dtMs);
      const b = saidaParaVelocidade(40.5 * (dtMs / 1000), dtMs);
      // Entradas quase iguais (3,95° vs 4,05°) → saídas quase iguais.
      expect(Math.abs(b - a)).toBeLessThan(0.15);
    });

    it('a curva é monótona, e o maior salto encolhe junto com o passo de varredura', () => {
      const dtMs = 100;
      const varrer = (passoDegS: number): number => {
        const saidas: number[] = [];
        for (let v = 0; v <= 90; v += passoDegS) {
          saidas.push(saidaParaVelocidade(v * (dtMs / 1000), dtMs));
        }
        let maior = 0;
        for (let i = 1; i < saidas.length; i++) {
          expect(saidas[i]).toBeGreaterThanOrEqual(saidas[i - 1] - 1e-9); // monótona
          maior = Math.max(maior, saidas[i] - saidas[i - 1]);
        }
        return maior;
      };

      // ESTE é o teste que distingue rampa de degrau. Numa descontinuidade o
      // maior salto NÃO encolhe quando a varredura fica mais fina — ele fica
      // preso no tamanho do degrau. Numa função contínua ele encolhe
      // proporcionalmente ao passo.
      const grosso = varrer(2);
      const fino = varrer(0.25);
      expect(fino).toBeLessThan(grosso * 0.25);

      // Referência do desenho antigo: no limiar de 40 °/s a saída pulava da EMA
      // (0,565 × 4° ≈ 2,26°) para a leitura crua (4°) — ~1,74° de degrau, para
      // qualquer passo de varredura, por menor que fosse.
      expect(fino).toBeLessThan(0.2);
    });

    it('os dois extremos do comportamento antigo foram preservados', () => {
      const s = new SuavizadorDeAngulos();
      for (let i = 0; i < 12; i++) s.processar(0, 0, i * 300);
      // Fixação (10 °/s): EMA pura, nada de soltura.
      const lento = s.processar(1 * RAD, 0, 11 * 300 + 100);
      expect(lento.fracaoDeSoltura).toBe(0);
      expect(lento.soltou).toBe(false);
      // Sacada plena (≫ 60 °/s): saída EXATAMENTE crua, como antes.
      const s2 = new SuavizadorDeAngulos();
      for (let i = 0; i < 12; i++) s2.processar(0, 0, i * 300);
      const rapido = s2.processar(20 * RAD, 0, 11 * 300 + 100);
      expect(rapido.fracaoDeSoltura).toBe(1);
      expect(rapido.soltou).toBe(true);
      expect(rapido.yaw).toBe(20 * RAD);
    });
  });

  it('a faixa acompanha o ponto médio configurado', () => {
    // A versão anterior exportava a faixa como duas constantes absolutas
    // (20 e 60) que o código não lia: ele derivava a faixa do meio. Com
    // qualquer ponto médio diferente do padrão, a documentação passava a
    // descrever um comportamento que não existia.
    expect(faixaDeSoltura()).toEqual({ inicio: 20, plena: 60 });
    expect(faixaDeSoltura(80)).toEqual({ inicio: 40, plena: 120 });
    // E é a MESMA conta que o suavizador usa: a 90 °/s, com meio em 80, a
    // soltura ainda é parcial; com o meio padrão já seria plena.
    const s = new SuavizadorDeAngulos({ velocidadeDeSacadaDegS: 80 });
    for (let i = 0; i < 12; i++) s.processar(0, 0, i * 300);
    const r = s.processar(9 * RAD, 0, 11 * 300 + 100); // 90 °/s
    expect(r.fracaoDeSoltura).toBeGreaterThan(0);
    expect(r.fracaoDeSoltura).toBeLessThan(1);
  });

  it('reiniciar esquece o estado', () => {
    const s = new SuavizadorDeAngulos();
    s.processar(0, 0, 0);
    s.processar(1 * RAD, 0, 100);
    s.reiniciar();
    const r = s.processar(4 * RAD, 0, 200);
    expect(r.yaw).toBe(4 * RAD);
    expect(r.soltou).toBe(false);
  });
});
