import { describe, expect, it } from 'vitest';
import {
  DESLOCAMENTO_MAX_DEG,
  EstabilizadorDeFixacao,
  JANELA_MS,
  LIMIAR_FIXACAO_DEG,
  LIMIAR_SACADA_DEG,
  MIN_AMOSTRAS,
  pesoDaMedia,
} from './estabilizadorDeFixacao';
import { pixelsPorGrau, type GeometriaDeTela } from './angularVelocity';

/**
 * A bancada de referência: 1920 px em 52,25 cm (23,6") a 60 cm.
 *
 * `pixelsPorGrau` = (1920/52,25) · 60·tan(1°) ≈ **38,5 px/grau** — o mesmo
 * número que o resto do pipeline usa como geometria de referência. (O
 * comentário anterior dizia "~111 px por grau", que não sai desta geometria
 * nem de nenhuma outra plausível.)
 */
const geometria: GeometriaDeTela = {
  larguraPx: 1920,
  alturaPx: 1080,
  larguraCm: 52.25,
  distanciaCm: 60,
};
const PPG = pixelsPorGrau(geometria)!;

function fabricaDeRuido(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0xffffffff - 0.5;
  };
}

function alimentar(
  e: EstabilizadorDeFixacao,
  pontos: [number, number][],
  t0 = 1000,
  passoMs = 33,
) {
  let ultima = e.processar(pontos[0][0], pontos[0][1], t0);
  for (let i = 1; i < pontos.length; i++) {
    ultima = e.processar(pontos[i][0], pontos[i][1], t0 + i * passoMs);
  }
  return ultima;
}

describe('EstabilizadorDeFixacao', () => {
  it('sem geometria fica inativo e devolve a entrada intacta', () => {
    const e = new EstabilizadorDeFixacao(null);
    expect(e.ativo).toBe(false);
    const s = e.processar(500, 400, 1000);
    expect(s).toEqual({
      x: 500, y: 400, estado: 'movendo',
      dispersaoDeg: null, amostrasNaMedia: 1, pesoDaMedia: 0,
    });
  });

  it('as primeiras amostras nunca são fixação — janela curta dispersa pouco por construção', () => {
    // Pontos DIFERENTES de propósito: com o mesmo ponto repetido o teste
    // passaria pela guarda de desvio zero, não pela de janela curta.
    const e = new EstabilizadorDeFixacao(geometria);
    const r = fabricaDeRuido(17);
    for (let i = 0; i < MIN_AMOSTRAS - 1; i++) {
      const s = e.processar(500 + r() * 10, 400 + r() * 10, 1000 + i * 33);
      // O ESTADO continua sendo o de antes: janela curta não declara fixação,
      // pela razão do comentário acima.
      expect(s.estado).toBe('movendo');
      // O que mudou é a saída: em vez de ignorar a janela curta e depois
      // adotar a média inteira na quarta amostra (um degrau de até 0,5° =
      // ~19 px), o peso sobe por uma rampa. Aqui ele ainda não chegou a 1.
      expect(s.pesoDaMedia).toBeLessThan(1);
      expect(s.pesoDaMedia).toBeGreaterThanOrEqual(0);
    }
  });

  it('olhar parado com tremor vira média — é aqui que o ruído cai', () => {
    const e = new EstabilizadorDeFixacao(geometria);
    // Tremor de ±10 px, bem abaixo de 1° (~111 px).
    const pontos: [number, number][] = [
      [500, 400], [508, 396], [494, 405], [503, 399], [497, 402], [505, 398],
    ];
    const s = alimentar(e, pontos);
    expect(s.estado).toBe('fixando');
    expect(s.amostrasNaMedia).toBeGreaterThanOrEqual(MIN_AMOSTRAS);
    const mediaX = pontos.reduce((a, p) => a + p[0], 0) / pontos.length;
    expect(s.x).toBeCloseTo(mediaX, 6);
    // A saída está mais perto do centro verdadeiro do que a última amostra.
    expect(Math.abs(s.x - 500)).toBeLessThan(Math.abs(pontos[pontos.length - 1][0] - 500));
  });

  it('a média reduz a dispersão da saída em relação à entrada', () => {
    const e = new EstabilizadorDeFixacao(geometria);
    const saidas: number[] = [];
    const entradas: number[] = [];
    let semente = 12345;
    const r = () => {
      semente = (semente * 1664525 + 1013904223) >>> 0;
      return semente / 0xffffffff - 0.5;
    };
    for (let i = 0; i < 60; i++) {
      const x = 500 + r() * 30;
      const y = 400 + r() * 30;
      entradas.push(x);
      const s = e.processar(x, y, 1000 + i * 33);
      if (i > 10) saidas.push(s.x);
    }
    const dp = (v: number[]) => {
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
    };
    expect(dp(saidas)).toBeLessThan(dp(entradas.slice(11)) * 0.7);
  });

  it('sacada solta na hora: a saída é a amostra, não a média', () => {
    const e = new EstabilizadorDeFixacao(geometria);
    alimentar(e, [[500, 400], [502, 401], [499, 399], [501, 400], [500, 402]]);
    // Salto de 5° — muito acima do limiar.
    const s = e.processar(500 + 5 * PPG, 400, 1000 + 5 * 33 + 33);
    expect(s.estado).toBe('movendo');
    expect(s.x).toBeCloseTo(500 + 5 * PPG, 6);
    expect(s.amostrasNaMedia).toBe(1);
  });

  it('depois da sacada a janela recomeça limpa, sem arrastar a fixação antiga', () => {
    const e = new EstabilizadorDeFixacao(geometria);
    alimentar(e, [[500, 400], [502, 401], [499, 399], [501, 400], [500, 402]]);
    const destino = 500 + 5 * PPG;
    let t = 1000 + 6 * 33;
    e.processar(destino, 400, t);
    // Nova fixação no destino: a média não pode conter nada do ponto anterior.
    let fixou = false;
    for (let i = 0; i < 8; i++) {
      t += 33;
      const s = e.processar(destino + (i % 2 === 0 ? 3 : -3), 400, t);
      if (s.estado === 'fixando') {
        fixou = true;
        expect(Math.abs(s.x - destino)).toBeLessThan(10);
      }
    }
    // Sem isto o teste passaria com zero asserções caso a fixação não ocorresse.
    expect(fixou).toBe(true);
  });

  it('histerese: entra abaixo de 1,0° e só sai acima de 1,5°', () => {
    const e = new EstabilizadorDeFixacao(geometria);
    // Entra em fixação com dispersão baixa.
    alimentar(e, [[500, 400], [503, 400], [497, 400], [501, 400], [499, 400]]);
    // Dispersão entre os dois limiares: a janela desliza para ~1,2° em X.
    const meio = 1.2 * PPG;
    const s = e.processar(500 + meio, 400, 1000 + 6 * 33);
    expect(s.dispersaoDeg).toBeGreaterThan(LIMIAR_FIXACAO_DEG);
    expect(s.dispersaoDeg).toBeLessThan(LIMIAR_SACADA_DEG);
    // Continua fixando: sem histerese, este quadro teria virado sacada.
    expect(s.estado).toBe('fixando');
  });

  it('uma pausa maior que a janela recomeça em vez de acumular', () => {
    const e = new EstabilizadorDeFixacao(geometria);
    alimentar(e, [[500, 400], [502, 401], [499, 399], [501, 400], [500, 402]]);
    const s = e.processar(500, 400, 1000 + JANELA_MS * 10);
    expect(s.amostrasNaMedia).toBe(1);
    expect(s.estado).toBe('movendo');
  });

  it('relógio andando para trás não trava nem explode a janela', () => {
    const e = new EstabilizadorDeFixacao(geometria);
    alimentar(e, [[500, 400], [502, 401], [499, 399], [501, 400], [500, 402]]);
    const s = e.processar(500, 400, 500);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Number.isFinite(s.y)).toBe(true);
  });

  it('entrada não finita passa direto em vez de contaminar a média', () => {
    const e = new EstabilizadorDeFixacao(geometria);
    const s = e.processar(NaN, 400, 1000);
    expect(Number.isNaN(s.x)).toBe(true);
    expect(s.amostrasNaMedia).toBe(1);
    // E a janela não guardou o NaN: a fixação seguinte é limpa.
    const t = alimentar(e, [[500, 400], [502, 401], [499, 399], [501, 400], [500, 402]], 2000);
    expect(Number.isFinite(t.x)).toBe(true);
  });

  it('a saída nunca se afasta meio grau da amostra corrente', () => {
    // O modo de falha: olhar alternando entre dois quadrantes opostos com
    // dispersão ABAIXO do limiar de fixação. Sem o teto, a média cai no meio —
    // um lugar onde o olhar nunca esteve — e parada, o que faz o dwell
    // concluir num botão errado.
    const e = new EstabilizadorDeFixacao(geometria);
    const d = 0.36 * PPG; // dispersão total ~0,72°, abaixo de 1,0°
    let t = 1000;
    let ultima = { x: 0, y: 0 };
    for (let i = 0; i < 12; i++) {
      const x = 500 + (i % 2 === 0 ? -d : d);
      const y = 400 + (i % 2 === 0 ? -d : d);
      const s = e.processar(x, y, t);
      t += 33;
      ultima = { x: s.x - x, y: s.y - y };
      expect(Math.hypot(ultima.x, ultima.y)).toBeLessThanOrEqual(DESLOCAMENTO_MAX_DEG * PPG + 1e-6);
    }
  });

  it('o teto não estraga a média num tremor pequeno', () => {
    // Tremor de ±10 px (~0,09°): bem dentro do teto, então a média sai intacta.
    const e = new EstabilizadorDeFixacao(geometria);
    const pontos: [number, number][] = [
      [500, 400], [508, 396], [494, 405], [503, 399], [497, 402], [505, 398],
    ];
    const s = alimentar(e, pontos);
    const mediaX = pontos.reduce((a, p) => a + p[0], 0) / pontos.length;
    expect(s.x).toBeCloseTo(mediaX, 6);
  });

  // --- Regressão: a saída não pode ter degrau ------------------------------
  //
  // Os dois degraus que existiam, na geometria de referência do produto
  // (1920×1080, 23,6", 60 cm → 38,5 px/grau):
  //   fim da sacada   — cru → média, até 0,5° = ~19 px, de um quadro ao outro
  //   quarta amostra  — idem, porque `MIN_AMOSTRAS` era um portão binário
  // Nas gravações isso aparece junto com os outros saltos: o cursor pousa no
  // alvo e "corrige" sozinho logo depois.
  describe('continuidade da saída', () => {
    it('o peso é contínuo na dispersão: o maior salto encolhe com o passo', () => {
      // ESTE é o teste que distingue rampa de degrau. Numa descontinuidade o
      // maior salto entre amostras vizinhas NÃO encolhe quando a varredura
      // fica mais fina — fica preso no tamanho do degrau.
      const varrer = (passo: number): number => {
        let maior = 0;
        let anterior = pesoDaMedia(6, 0);
        for (let d = 0; d <= 2; d += passo) {
          const w = pesoDaMedia(6, d);
          maior = Math.max(maior, Math.abs(w - anterior));
          anterior = w;
        }
        return maior;
      };
      const grosso = varrer(0.1);
      const fino = varrer(0.0125);
      expect(fino).toBeLessThan(grosso * 0.25);
      expect(fino).toBeLessThan(0.05);
    });

    it('os dois extremos reproduzem o comportamento antigo, exatamente', () => {
      // Abaixo do limiar de fixação, com a janela cheia: média pura.
      expect(pesoDaMedia(MIN_AMOSTRAS, LIMIAR_FIXACAO_DEG)).toBe(1);
      expect(pesoDaMedia(8, 0.3)).toBe(1);
      // Acima do limiar de sacada: amostra crua.
      expect(pesoDaMedia(8, LIMIAR_SACADA_DEG)).toBe(0);
      expect(pesoDaMedia(8, 3)).toBe(0);
      // Uma amostra só: não há média a formar.
      expect(pesoDaMedia(1, 0)).toBe(0);
    });

    it('o peso sobe monotonicamente com a janela e desce com a dispersão', () => {
      let anterior = -1;
      for (let n = 1; n <= MIN_AMOSTRAS + 2; n++) {
        const w = pesoDaMedia(n, 0.2);
        expect(w).toBeGreaterThanOrEqual(anterior);
        anterior = w;
      }
      anterior = 2;
      for (let d = 0; d <= 2; d += 0.05) {
        const w = pesoDaMedia(6, d);
        expect(w).toBeLessThanOrEqual(anterior + 1e-12);
        anterior = w;
      }
    });

    it('a saída é contínua na dispersão: o maior salto encolhe com a varredura', () => {
      // Monta a MESMA fixação em vários estabilizadores independentes e varia
      // só a última amostra, varrendo a região onde a dispersão cruza os
      // limiares. Cada ponto da varredura é um experimento isolado, então o
      // que se mede é a função de transferência do estágio — não o movimento
      // da entrada.
      const correcaoParaOffset = (offsetPx: number): number => {
        const e = new EstabilizadorDeFixacao(geometria);
        alimentar(e, [[500, 400], [502, 400], [499, 400], [501, 400], [500, 400]]);
        const x = 500 + offsetPx;
        const s = e.processar(x, 400, 1000 + 5 * 33);
        // A CORREÇÃO que este estágio acrescenta — é ela que pulava.
        return s.x - x;
      };

      const varrer = (passoPx: number): number => {
        let maior = 0;
        let anterior: number | null = null;
        // 0 a 2,5° de offset: atravessa 1,0° e 1,5° com folga dos dois lados.
        for (let o = 0; o <= 2.5 * PPG; o += passoPx) {
          const c = correcaoParaOffset(o);
          if (anterior !== null) maior = Math.max(maior, Math.abs(c - anterior));
          anterior = c;
        }
        return maior;
      };

      const grosso = varrer(PPG * 0.05);
      const fino = varrer(PPG * 0.00625);   // 8× mais fino
      // Numa comutação o maior salto fica preso no tamanho do degrau (até
      // 0,5° = ~55 px nesta bancada), por menor que seja o passo. Numa função
      // contínua ele encolhe junto com o passo.
      expect(fino).toBeLessThan(grosso * 0.3);
      // E em termos absolutos: o degrau antigo valia o teto do módulo inteiro
      // (0,5° ≈ 19 px nesta bancada) num único quadro. O que sobra é a
      // inclinação local da rampa, vinte vezes menor. O teste de refinamento
      // acima é a garantia de verdade; este número é a ordem de grandeza.
      expect(fino).toBeLessThan(DESLOCAMENTO_MAX_DEG * PPG * 0.05);
    });

    it('depois de uma sacada a média volta por rampa, não de um quadro para o outro', () => {
      const e = new EstabilizadorDeFixacao(geometria);
      alimentar(e, [[500, 400], [502, 401], [499, 399], [501, 400], [500, 402]]);
      const destino = 500 + 5 * PPG;
      let t = 1000 + 6 * 33;
      e.processar(destino, 400, t); // a sacada: janela descartada

      const pesos: number[] = [];
      for (let i = 0; i < 6; i++) {
        t += 33;
        pesos.push(e.processar(destino + (i % 2 === 0 ? 3 : -3), 400, t).pesoDaMedia);
      }
      // Antes: 0, 0, 0, 1 — o degrau na quarta amostra. Agora sobe por partes.
      expect(pesos[0]).toBeGreaterThan(0);
      expect(pesos[0]).toBeLessThan(1);
      expect(pesos[1]).toBeGreaterThan(pesos[0]);
      expect(pesos[pesos.length - 1]).toBeCloseTo(1, 6);
    });
  });

  it('reset volta ao estado inicial', () => {
    const e = new EstabilizadorDeFixacao(geometria);
    alimentar(e, [[500, 400], [502, 401], [499, 399], [501, 400], [500, 402]]);
    e.reset();
    const s = e.processar(800, 300, 5000);
    expect(s.amostrasNaMedia).toBe(1);
    expect(s.estado).toBe('movendo');
  });
});
