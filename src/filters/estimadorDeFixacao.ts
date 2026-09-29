/**
 * Estimador de fixação (M9 em docs/PESQUISA.md).
 *
 * ## Por que trocar One Euro + estabilizador
 *
 * A cadeia de antes quase não filtrava. O β do One Euro abre o filtro com o
 * próprio ruído (corte efetivo de ~1,7 Hz em x e ~2,4 Hz em y, contra 0,5 Hz
 * nominais), e os limiares fixos do estabilizador (1,0°/1,5°) ficam abaixo da
 * dispersão do ruído — seis amostras de puro ruído já se espalham por 3,3° de
 * mediana. Na simulação calibrada pelo relatório de 28/09, a cadeia reduzia o
 * desvio só ×0,84; o relatório mediu ×0,89.
 *
 * A literatura de interação converge noutra forma: detectar o estado (fixação
 * ou sacada) e tirar a média dentro da fixação, recomeçando na sacada. No
 * único estudo que comparou 13 filtros de olhar frente a frente, os que
 * detectam o estado ficaram melhores e o Kalman, entre os piores (Špakov,
 * ETRA 2012). Com média + sacada + correção de pico, Feit et al. (CHI 2017)
 * mediram precisão 45–47 % melhor que o dado bruto e alvo até 42 % menor.
 *
 * ## Como funciona
 *
 *  - **Portão de Mahalanobis.** Cada amostra nova é comparada com a estimativa
 *    atual da fixação (não com a amostra anterior — Kumar et al. 2008) pela
 *    distância d² = νᵀS⁻¹ν, com S = Σ·(1 + 1/n) e Σ a covariância do ruído
 *    medida na calibração naquele ponto da tela (`ruidoDaCalibracao.ts`).
 *    O peso da amostra cai numa rampa contínua de 1 (d = 3,72, ou
 *    χ²₂ = 13,82, 99,9 %) a 0 (d = 4,29, 99,99 %). As rampas estão em
 *    unidades de σ: acompanham o ruído de cada pessoa sozinhas.
 *  - **Uma amostra de antecipação.** A amostra que zera o peso fica pendente
 *    e a saída segura a fixação por um quadro. Se a seguinte volta para a
 *    fixação, era pico e é descartada; se fica longe e perto da pendente, é
 *    sacada: a fixação recomeça com as duas. Custo: 33 ms nas sacadas.
 *  - **Média que cresce.** Dentro da fixação a saída é a média das amostras
 *    com núcleo triangular no tempo (a mais velha pesa menos e sai da janela
 *    com peso zero, sem degrau). A janela cresce até `janelaMs`: 600 ms é o
 *    ótimo de Feit et al. (36–40 quadros a 60 Hz); com ruído mais
 *    correlacionado que o medido (ρ₁ = 0,80) ela cresce até 1000 ms, para
 *    manter o mesmo número efetivo de amostras (`janelaParaRho`).
 *
 *  - **Escala que acompanha a sessão.** A Σ é a da calibração; com fadiga,
 *    outra postura ou menos luz o ruído cresce, e um portão justo demais
 *    confundiria ruído com sacada (a 1,5× o desvio medido, cerca de 1 amostra
 *    em 20 passaria de 3,72σ e a saída saltaria). A mediana dos d² das
 *    últimas amostras aceitas diz quanto: com o modelo certo ela fica perto de
 *    2·ln 2, e a Σ do portão é multiplicada por mediana/(2·ln 2), presa em
 *    [1, 4] — nunca mais justa que a calibração, no máximo o dobro do desvio.
 *
 * Um Kalman de posição constante sem ruído de processo, reiniciado na sacada,
 * é exatamente esta média — é o formalismo sem o modelo de velocidade que o
 * Špakov achou ruim.
 */

import { amostrasEfetivas, MEDIANA_CHI2_2GL } from '../ruidoDaCalibracao';
import { passoSuave } from '../estatistica';

/** √χ²₂(0,999): até aqui a amostra pesa 1. */
export const RAIO_INICIO = Math.sqrt(-2 * Math.log(1 - 0.999));
/** √χ²₂(0,9999): daqui em diante a amostra pesa 0 e fica pendente. */
export const RAIO_FIM = Math.sqrt(-2 * Math.log(1 - 0.9999));
/** Janela da média com o ruído medido (ρ₁ = 0,80), em ms. */
export const JANELA_BASE_MS = 600;
/** Teto da janela com ruído mais correlacionado. */
export const JANELA_MAX_MS = 1000;
/** ρ₁ da referência: razão RMS-S2S/STD de 0,64 medida no projeto. */
export const RHO_DE_REFERENCIA = 0.8;
/** Intervalo entre quadros da câmera, ~30 Hz. */
export const INTERVALO_PADRAO_MS = 1000 / 30;
/** Amostras aceitas que entram na mediana da escala (~2 s a 30 Hz). */
export const AMOSTRAS_DA_ESCALA = 60;
/** Com menos que isto a escala fica em 1 (mediana de poucas amostras oscila). */
export const MINIMO_PARA_ESCALA = 15;
/** Teto da escala da Σ: o dobro do desvio medido na calibração. */
export const ESCALA_MAXIMA = 4;

export interface Covariancia2 {
  sxx: number;
  syy: number;
  sxy: number;
}

/**
 * Janela que dá o mesmo número efetivo de amostras independentes que 600 ms
 * dão com ρ₁ = 0,80, presa em [600, 1000] ms.
 */
export function janelaParaRho(rho1: number, intervaloMs: number = INTERVALO_PADRAO_MS): number {
  const alvo = amostrasEfetivas(Math.round(JANELA_BASE_MS / intervaloMs), RHO_DE_REFERENCIA);
  const nMax = Math.round(JANELA_MAX_MS / intervaloMs);
  for (let n = Math.round(JANELA_BASE_MS / intervaloMs); n <= nMax; n++) {
    if (amostrasEfetivas(n, rho1) >= alvo) return Math.max(JANELA_BASE_MS, n * intervaloMs);
  }
  return JANELA_MAX_MS;
}


/** Distância de Mahalanobis de (dx, dy) sob a covariância dada. Infinito se Σ não serve. */
export function distanciaDeMahalanobis(dx: number, dy: number, s: Covariancia2): number {
  const det = s.sxx * s.syy - s.sxy * s.sxy;
  if (!(det > 0)) return Number.POSITIVE_INFINITY;
  const d2 = (s.syy * dx * dx - 2 * s.sxy * dx * dy + s.sxx * dy * dy) / det;
  return Math.sqrt(Math.max(0, d2));
}

interface Amostra {
  t: number;
  x: number;
  y: number;
  /** Peso dado pelo portão (1 dentro, rampa até 0). */
  w: number;
}

export class EstimadorDeFixacao {
  private readonly janelaMs: number;
  private fixacao: Amostra[] = [];
  private pendente: { t: number; x: number; y: number } | null = null;
  /** d² (sob a Σ da calibração) das últimas amostras aceitas, em anel. */
  private readonly d2Recentes: number[] = [];
  private escalaAtual = 1;

  constructor(janelaMs: number = JANELA_BASE_MS) {
    this.janelaMs = janelaMs;
  }

  /** Janela em uso, em ms (vai para o diagnóstico). */
  get janela(): number {
    return this.janelaMs;
  }

  /** Quanto a Σ do portão está inflada em relação à da calibração. */
  get escala(): number {
    return this.escalaAtual;
  }

  /** Estimativa da fixação no instante `tMs`: média com núcleo triangular no tempo. */
  private media(tMs: number): { x: number; y: number; n: number } | null {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    for (const a of this.fixacao) {
      const k = Math.max(0, 1 - (tMs - a.t) / this.janelaMs);
      const w = k * a.w;
      sw += w;
      sx += w * a.x;
      sy += w * a.y;
    }
    return sw > 0 ? { x: sx / sw, y: sy / sw, n: this.fixacao.length } : null;
  }

  /** Registra o d² de uma amostra aceita e atualiza a escala pela mediana. */
  private registrarD2(d2: number): void {
    if (!Number.isFinite(d2)) return;
    this.d2Recentes.push(d2);
    if (this.d2Recentes.length > AMOSTRAS_DA_ESCALA) this.d2Recentes.shift();
    if (this.d2Recentes.length < MINIMO_PARA_ESCALA) return;
    const o = [...this.d2Recentes].sort((a, b) => a - b);
    const m = o.length >> 1;
    const med = o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
    this.escalaAtual = Math.max(1, Math.min(ESCALA_MAXIMA, med / MEDIANA_CHI2_2GL));
  }

  processar(x: number, y: number, tMs: number, ruido: Covariancia2): { x: number; y: number } {
    if (![x, y, tMs].every(Number.isFinite)) {
      const m = this.media(tMs);
      return m ? { x: m.x, y: m.y } : { x, y };
    }
    // Amostras que já saíram da janela têm peso zero: descarta.
    this.fixacao = this.fixacao.filter((a) => tMs - a.t < this.janelaMs);
    const est = this.media(tMs);
    if (!est) {
      this.fixacao = [{ t: tMs, x, y, w: 1 }];
      this.pendente = null;
      return { x, y };
    }

    // S = Σ·(1 + 1/n): a incerteza da amostra nova mais a da média atual.
    const inflado = 1 + 1 / Math.max(1, est.n);
    const s: Covariancia2 = { sxx: ruido.sxx * inflado, syy: ruido.syy * inflado, sxy: ruido.sxy * inflado };
    const dBase = distanciaDeMahalanobis(x - est.x, y - est.y, s);
    const r = dBase / Math.sqrt(this.escalaAtual);
    const peso = 1 - passoSuave((r - RAIO_INICIO) / (RAIO_FIM - RAIO_INICIO));

    if (this.pendente) {
      const p = this.pendente;
      this.pendente = null;
      if (peso > 0) {
        // Voltou para a fixação: a pendente era pico.
        this.fixacao.push({ t: tMs, x, y, w: peso });
        this.registrarD2(dBase * dBase);
      } else {
        const c = 2 * this.escalaAtual;
        const sp: Covariancia2 = { sxx: c * ruido.sxx, syy: c * ruido.syy, sxy: c * ruido.sxy };
        this.fixacao = distanciaDeMahalanobis(x - p.x, y - p.y, sp) <= RAIO_FIM
          // Sacada confirmada: a fixação nova começa com as duas amostras.
          ? [{ t: p.t, x: p.x, y: p.y, w: 1 }, { t: tMs, x, y, w: 1 }]
          // Em movimento: recomeça só com a atual.
          : [{ t: tMs, x, y, w: 1 }];
      }
    } else if (peso > 0) {
      this.fixacao.push({ t: tMs, x, y, w: peso });
      this.registrarD2(dBase * dBase);
    } else {
      // Fora do portão: segura a fixação um quadro para saber se é pico ou sacada.
      this.pendente = { t: tMs, x, y };
      return { x: est.x, y: est.y };
    }
    const m = this.media(tMs);
    return m ? { x: m.x, y: m.y } : { x, y };
  }

  /**
   * Rosto perdido ou câmera parada: a próxima amostra recomeça do zero. A
   * escala fica — o nível de ruído é da sessão, não da fixação.
   */
  reiniciar(): void {
    this.fixacao = [];
    this.pendente = null;
  }
}
