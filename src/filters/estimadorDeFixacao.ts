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
 *
 * ## Revisão de 30/09: o portão levava em conta um ruído que não existe
 *
 * O portão comparava a amostra com a média usando S = Σ·(1 + 1/n), que é a
 * conta para amostras INDEPENDENTES. O ruído do olhar não é: ρ₁ ≈ 0,8 entre
 * quadros vizinhos, e a média da janela (triangular, com as amostras recentes
 * pesando mais) acompanha parte do próprio ruído. A diferença entre a amostra
 * nova e a média varia só ~0,75 σ² — não os ~1,05 σ² da conta. Com isso:
 *
 *  - o portão ficava ~25 % mais largo que os 99,9 % nominais: passos médios
 *    (2–5σ, de uma tecla para a vizinha num computador ruidoso) entravam na
 *    média e o cursor ESCORREGAVA até lá por 250–430 ms, em vez de ir;
 *  - a escala da sessão saía ~0,6× a verdadeira: com ruído maior que o da
 *    calibração o portão ficava APERTADO demais, e o ruído virava "sacada" —
 *    o cursor dava pulos parado.
 *
 * Agora S = Σ·Var(x − média)/σ² sob AR(1) com o ρ₁ da calibração
 * (`varianciaDaInovacao`), e um detector de deslocamento reinicia a fixação
 * quando a média das últimas `AMOSTRAS_DO_DESLOCAMENTO` amostras se afasta da
 * média do resto além de `LIMIAR_DO_DESLOCAMENTO` desvios — com a variância
 * EXATA da diferença sob AR(1) (`varianciaDoDeslocamento`), para a taxa de
 * alarme falso não depender do ρ₁ da pessoa. Na simulação com o ruído REAL da
 * gravação de 23/09 (resíduos das fixações do teste de precisão, emendados
 * numa trajetória de uso; `estimadorDeFixacao.ruidoReal.test.ts`): com o
 * ruído dobrado (σ ≈ 53 px, na calibração e no uso), passos de 160–260 px
 * chegam a 90 % em 222 ms (eram 326 ms); com a calibração mais ruidosa que o
 * uso, em 196 ms (eram 377 ms); com o ruído do uso 1,6× o da calibração, os
 * pulos > 25 px com o olhar parado caem de 6,8 para 4,2 por minuto; e no
 * replay do teste de precisão da gravação a dispersão vai de 24,3 para
 * 24,7 px, com o erro médio igual. Passos abaixo de ~2σ continuam
 * escorregando (~400 ms): ali o passo e o ruído não se separam sem atrasar a
 * fixação inteira. Sacadas grandes chegam no mesmo tempo (±1 quadro).
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
/** Amostras recentes cuja média o detector de deslocamento compara com a fixação (~133 ms a 30 Hz). */
export const AMOSTRAS_DO_DESLOCAMENTO = 4;
/**
 * Distância (em desvios da diferença entre as duas médias) acima da qual o
 * olhar se deslocou. Com a variância exata, a taxa de alarme falso não depende
 * do ρ₁ da pessoa: com o olhar parado e ruído gaussiano, ≤ 0,1 reinício à toa
 * por minuto para ρ₁ de 0 a 0,9. Na simulação com ruído real
 * (docs/MEDICOES.md §14.7) é o limiar que ainda encurta os passos de 3–5σ.
 */
export const LIMIAR_DO_DESLOCAMENTO = 4.5;
/**
 * Teto do ρ₁ usado no modelo AR(1). Um ρ₁ da calibração perto de 1 (deriva
 * lenta durante a coleta) faria a variância da inovação desabar e o portão
 * disparar com o ruído normal; 0,95 já é bem acima do medido (0,76–0,80).
 */
export const RHO_MAXIMO_DO_MODELO = 0.95;
/** O detector só age com a fixação já formada: as recentes mais esta quantidade. */
const MINIMO_ANTIGAS_DO_DESLOCAMENTO = 6;

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

/**
 * Var(x_t − média) / σ², com ruído AR(1): 1 + Var(média) − 2·Cov(x_t, média).
 *
 * `amostras` são as da fixação, em ordem de tempo; a média é a da janela
 * (núcleo triangular de `janelaMs` × o peso `w` de cada uma). A correlação
 * entre duas amostras separadas por Δt é ρ₁^(Δt / 33,3 ms). Com amostras
 * independentes (ρ₁ = 0) isto é 1 + Σŵᵢ² — o 1 + 1/n de antes com pesos
 * iguais; com ρ₁ = 0,8 sai ~0,6–0,7, porque a média acompanha parte do
 * próprio ruído. As duas somas são O(n): a correlação da amostra i com as
 * anteriores se acumula por recorrência (a AR(1) é multiplicativa no tempo).
 */
export function varianciaDaInovacao(
  amostras: readonly { t: number; w: number }[],
  tMs: number,
  janelaMs: number,
  rho: number,
): number {
  const w = pesosDaJanela(amostras, tMs, janelaMs);
  if (w === null) return 2;
  let cov = 0;
  for (let i = 0; i < w.length; i++) cov += w[i] * correlacaoAR1(rho, tMs - amostras[i].t);
  return Math.max(0.05, 1 + varianciaDaMediaPonderada(amostras, w, rho) - 2 * cov);
}

/** Correlação AR(1) entre duas amostras separadas por `dtMs`. */
function correlacaoAR1(rho: number, dtMs: number): number {
  return rho ** (Math.abs(dtMs) / INTERVALO_PADRAO_MS);
}

/** Pesos normalizados da média da janela (núcleo triangular × peso do portão); `null` se somam zero. */
function pesosDaJanela(amostras: readonly { t: number; w: number }[], tMs: number, janelaMs: number): number[] | null {
  let sw = 0;
  const w = amostras.map((a) => {
    const k = Math.max(0, 1 - (tMs - a.t) / janelaMs) * a.w;
    sw += k;
    return k;
  });
  return sw > 0 ? w.map((k) => k / sw) : null;
}

/**
 * Var(Σ ŵᵢ xᵢ) / σ² com ruído AR(1), para amostras em ordem de tempo e pesos
 * já normalizados: Σᵢ ŵᵢ² + 2 Σᵢ ŵᵢ Σ_{j<i} ŵⱼ ρ^(tᵢ − tⱼ). A soma interna se
 * acumula por recorrência (a AR(1) é multiplicativa no tempo): O(n).
 */
function varianciaDaMediaPonderada(amostras: readonly { t: number }[], w: readonly number[], rho: number): number {
  let v = 0;
  let acumulado = 0; // Σ_{j<i} ŵⱼ ρ^(tᵢ − tⱼ)
  for (let i = 0; i < w.length; i++) {
    if (i > 0) acumulado = correlacaoAR1(rho, amostras[i].t - amostras[i - 1].t) * (acumulado + w[i - 1]);
    v += w[i] * w[i] + 2 * w[i] * acumulado;
  }
  return v;
}

/**
 * Var(média simples das `k` últimas − média da janela das anteriores) / σ²,
 * com ruído AR(1) — a estatística do detector de deslocamento, com a
 * covariância POSITIVA entre as duas médias (amostras vizinhas no tempo).
 *
 * As anteriores são todas mais velhas que as recentes, então
 * Cov = (1/k)·Σᵢ ρ^(tᵢ − t*) · Σⱼ ŵⱼ ρ^(t* − tⱼ), com t* a mais nova das
 * anteriores: O(n) também. `null` sem amostras suficientes.
 */
export function varianciaDoDeslocamento(
  amostras: readonly { t: number; w: number }[],
  k: number,
  tMs: number,
  janelaMs: number,
  rho: number,
): number | null {
  const n = amostras.length;
  if (k < 1 || n <= k) return null;
  const antigas = amostras.slice(0, n - k);
  const recentes = amostras.slice(n - k);
  const w = pesosDaJanela(antigas, tMs, janelaMs);
  if (w === null) return null;
  let varRecentes = 0;
  for (const a of recentes) for (const b of recentes) varRecentes += correlacaoAR1(rho, a.t - b.t);
  varRecentes /= k * k;
  const tRef = antigas[antigas.length - 1].t;
  let somaRecentes = 0;
  for (const a of recentes) somaRecentes += correlacaoAR1(rho, a.t - tRef);
  let somaAntigas = 0;
  for (let j = 0; j < antigas.length; j++) somaAntigas += w[j] * correlacaoAR1(rho, tRef - antigas[j].t);
  const cov = (somaRecentes / k) * somaAntigas;
  return Math.max(0.02, varRecentes + varianciaDaMediaPonderada(antigas, w, rho) - 2 * cov);
}

export class EstimadorDeFixacao {
  private readonly janelaMs: number;
  /** ρ₁ do ruído na calibração: a correlação entre quadros vizinhos. */
  private readonly rho: number;
  private fixacao: Amostra[] = [];
  private pendente: { t: number; x: number; y: number } | null = null;
  /** d² (sob a Σ da calibração) das últimas amostras aceitas, em anel. */
  private readonly d2Recentes: number[] = [];
  private escalaAtual = 1;

  constructor(janelaMs: number = JANELA_BASE_MS, rho1: number = RHO_DE_REFERENCIA) {
    this.janelaMs = janelaMs;
    this.rho = Number.isFinite(rho1) ? Math.max(0, Math.min(RHO_MAXIMO_DO_MODELO, rho1)) : RHO_DE_REFERENCIA;
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

  /**
   * Deslocamento pequeno demais para o portão, mas que PERSISTE: a média das
   * últimas `AMOSTRAS_DO_DESLOCAMENTO` amostras longe da média das outras.
   * Uma amostra sozinha não distingue um passo de 3σ do ruído; quatro
   * seguidas do mesmo lado distinguem, e a fixação recomeça com elas em vez de
   * escorregar até lá ao longo da janela inteira.
   */
  private deslocou(tMs: number, ruido: Covariancia2): boolean {
    const k = AMOSTRAS_DO_DESLOCAMENTO;
    const n = this.fixacao.length;
    if (n < k + MINIMO_ANTIGAS_DO_DESLOCAMENTO) return false;
    let rx = 0;
    let ry = 0;
    for (let i = n - k; i < n; i++) {
      rx += this.fixacao[i].x;
      ry += this.fixacao[i].y;
    }
    rx /= k;
    ry /= k;
    let sw = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < n - k; i++) {
      const a = this.fixacao[i];
      const w = Math.max(0, 1 - (tMs - a.t) / this.janelaMs) * a.w;
      sw += w;
      vx += w * a.x;
      vy += w * a.y;
    }
    if (!(sw > 0)) return false;
    // Variância exata da diferença entre as duas médias sob AR(1), com a
    // covariância entre elas: a taxa de alarme falso fica a mesma qualquer
    // que seja o ρ₁ da pessoa (ver `LIMIAR_DO_DESLOCAMENTO`).
    const v = varianciaDoDeslocamento(this.fixacao, k, tMs, this.janelaMs, this.rho);
    if (v === null) return false;
    const c = this.escalaAtual * v;
    const d = distanciaDeMahalanobis(rx - vx / sw, ry - vy / sw, { sxx: c * ruido.sxx, syy: c * ruido.syy, sxy: c * ruido.sxy });
    return d > LIMIAR_DO_DESLOCAMENTO;
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

    // S = Σ·Var(x − média)/σ²: a incerteza da diferença entre a amostra nova
    // e a média atual, com a correlação do ruído (ver `varianciaDaInovacao`).
    const inflado = varianciaDaInovacao(this.fixacao, tMs, this.janelaMs, this.rho);
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
      if (this.deslocou(tMs, ruido)) {
        // O olhar foi para perto: a fixação nova começa com as recentes.
        this.fixacao = this.fixacao.slice(-AMOSTRAS_DO_DESLOCAMENTO).map((a) => ({ ...a, w: 1 }));
      }
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
