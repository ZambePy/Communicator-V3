import { describe, it, expect } from 'vitest';
import {
  SeguidorDeCursor,
  IDADE_MAXIMA_MS,
  DISTANCIA_DE_SALTO_PX,
} from './seguidorDeCursor';

/**
 * O contrato central: o seguidor converte UM passo grande por amostra em
 * VÁRIOS passos pequenos por quadro de display, sem mudar onde o cursor chega
 * nem quando.
 *
 * A medição que motivou o módulo (duas gravações de tela a 30 fps, mesma
 * máquina, durante movimento real):
 *   build antiga: 19,3 Hz efetivos, 0,9 % dos quadros com salto > 30 px
 *   build atual:  21,2 Hz efetivos, 11,8 % dos quadros com salto > 30 px
 * A taxa é a mesma; o que mudou foi o tamanho do passo.
 */
describe('SeguidorDeCursor', () => {
  /** Simula amostras a `hz` e render a 60 Hz; devolve os passos desenhados. */
  function simular(opts: {
    hz: number;
    passoPx: number;
    amostras: number;
  }): { passos: number[]; posicoes: number[] } {
    const s = new SeguidorDeCursor();
    const intervalo = 1000 / opts.hz;
    const quadro = 1000 / 60;
    const passos: number[] = [];
    const posicoes: number[] = [];
    let anterior: number | null = null;
    let t = 0;
    let proximaAmostra = 0;
    let x = 0;
    for (let i = 0; i < opts.amostras * (intervalo / quadro); i++) {
      if (t >= proximaAmostra) {
        s.aoReceberAmostra({ x, y: 0, tMs: t });
        x += opts.passoPx;
        proximaAmostra += intervalo;
      }
      const r = s.render(t);
      if (r) {
        if (anterior !== null) passos.push(Math.abs(r.x - anterior));
        anterior = r.x;
        posicoes.push(r.x);
      }
      t += quadro;
    }
    return { passos, posicoes };
  }

  it('reduz drasticamente o maior passo desenhado, mantendo a mesma distância total', () => {
    // 21 Hz de amostras, 48 px por amostra (≈ o regime medido na gravação).
    const { passos, posicoes } = simular({ hz: 21, passoPx: 48, amostras: 30 });

    // Sem seguidor, TODO passo desenhado seria de 48 px e ~65 % dos quadros
    // teriam passo zero. Com ele, o maior passo cai para uma fração disso.
    const maior = Math.max(...passos);
    expect(maior).toBeLessThan(48 * 0.6);

    // E o cursor de fato percorre o caminho: chega perto do último alvo.
    const percorrido = posicoes[posicoes.length - 1] - posicoes[0];
    expect(percorrido).toBeGreaterThan(48 * 20);
  });

  it('elimina os quadros completamente parados durante movimento contínuo', () => {
    const { passos } = simular({ hz: 21, passoPx: 20, amostras: 30 });
    const parados = passos.filter((p) => p < 0.05).length;
    // Antes: ~65 % dos quadros de display sem movimento nenhum (60 Hz de
    // display contra 21 Hz de amostra). Agora a esmagadora maioria anda.
    expect(parados / passos.length).toBeLessThan(0.2);
  });

  it('não atrasa a sacada: um passo grande vai quase inteiro de uma vez', () => {
    const s = new SeguidorDeCursor();
    s.aoReceberAmostra({ x: 0, y: 0, tMs: 0 });
    s.render(0);
    s.aoReceberAmostra({ x: 100, y: 0, tMs: 33 });
    s.render(33);
    s.aoReceberAmostra({ x: 100, y: 0, tMs: 66 });
    // Salto de 500 px: bem acima de DISTANCIA_DE_SALTO_PX.
    s.aoReceberAmostra({ x: 600, y: 0, tMs: 99 });
    const r = s.render(99)!;
    // Já cobriu a maior parte do caminho no mesmo quadro.
    expect(r.x).toBeGreaterThan(400);
    expect(DISTANCIA_DE_SALTO_PX).toBeLessThan(500);
  });

  it('chega exatamente no alvo e fica — a fixação não fica escorregando', () => {
    const s = new SeguidorDeCursor();
    s.aoReceberAmostra({ x: 0, y: 0, tMs: 0 });
    s.render(0);
    s.aoReceberAmostra({ x: 10, y: 20, tMs: 48 });
    // Renderiza muito além do prazo de chegada, mas DENTRO do teto de idade
    // (passado ele o contrato muda: ver o teste de predição velha).
    for (let t = 48; t <= 300; t += 16) s.render(t);
    const r = s.render(300)!;
    expect(r.x).toBeCloseTo(10, 6);
    expect(r.y).toBeCloseTo(20, 6);
    expect(r.parado).toBe(false);
  });

  it('NÃO segura predição velha: passado o teto de idade, para e avisa', () => {
    const s = new SeguidorDeCursor();
    s.aoReceberAmostra({ x: 0, y: 0, tMs: 0 });
    s.render(0);
    s.aoReceberAmostra({ x: 500, y: 0, tMs: 33 });

    const dentro = s.render(33 + IDADE_MAXIMA_MS - 10)!;
    expect(dentro.parado).toBe(false);

    const fora = s.render(33 + IDADE_MAXIMA_MS + 10)!;
    expect(fora.parado).toBe(true);
    const xCongelado = fora.x;

    // E congela mesmo: não continua deslizando para o alvo velho.
    const bemDepois = s.render(33 + IDADE_MAXIMA_MS + 5000)!;
    expect(bemDepois.x).toBe(xCongelado);
    expect(bemDepois.parado).toBe(true);
  });

  it('a primeira amostra aparece no lugar, sem travessia desde a origem', () => {
    const s = new SeguidorDeCursor();
    s.aoReceberAmostra({ x: 800, y: 400, tMs: 0 });
    const r = s.render(0)!;
    expect(r.x).toBe(800);
    expect(r.y).toBe(400);
  });

  it('fixarEm teleporta: descontinuidade legítima não é desenhada como travessia', () => {
    const s = new SeguidorDeCursor();
    s.aoReceberAmostra({ x: 0, y: 0, tMs: 0 });
    s.render(0);
    s.fixarEm(1200, 700, 50);
    const r = s.render(50)!;
    expect(r.x).toBe(1200);
    expect(r.y).toBe(700);
  });

  it('ignora releitura da mesma amostra (o rAF lê o cache várias vezes)', () => {
    const s = new SeguidorDeCursor();
    s.aoReceberAmostra({ x: 0, y: 0, tMs: 0 });
    s.render(0);
    s.aoReceberAmostra({ x: 100, y: 0, tMs: 48 });
    const a = s.render(60)!.x;
    // Mesmo tMs: não deve reprogramar a chegada nem contar como intervalo.
    s.aoReceberAmostra({ x: 100, y: 0, tMs: 48 });
    const b = s.render(60)!.x;
    expect(b).toBe(a);
  });

  it('valores não-finitos não contaminam o estado', () => {
    const s = new SeguidorDeCursor();
    s.aoReceberAmostra({ x: 10, y: 10, tMs: 0 });
    s.render(0);
    s.aoReceberAmostra({ x: NaN, y: 10, tMs: 33 });
    const r = s.render(33)!;
    expect(Number.isFinite(r.x)).toBe(true);
    expect(Number.isFinite(r.y)).toBe(true);
  });

  it('reiniciar volta ao estado vazio', () => {
    const s = new SeguidorDeCursor();
    s.aoReceberAmostra({ x: 5, y: 5, tMs: 0 });
    s.reiniciar();
    expect(s.render(10)).toBeNull();
    expect(s.posicaoAtual()).toBeNull();
  });
});
