/**
 * Métricas de qualidade do sinal para o relatório /3 (M11 em docs/PESQUISA.md).
 *
 * O relatório /2 media acurácia por média e precisão por desvio. Faltavam as
 * três coisas que decidem se o dwell funciona e que a literatura de qualidade
 * de dado pede junto (Holmqvist et al. 2012; Niehorster et al. 2020; Feit et
 * al. 2017):
 *
 *  - **a cor do ruído.** RMS-S2S/DP vale √2 para ruído branco e √(2(1 − ρ₁))
 *    para ruído AR(1): é ela que diz quantas amostras independentes há numa
 *    janela de dwell, e portanto quanto um filtro de média pode ganhar;
 *  - **o lado do alvo que segura 95 % das amostras filtradas**, e o que segura
 *    95 % das janelas de 1 s inteiras — o que o cursor precisa para ficar
 *    dentro do botão durante um dwell;
 *  - **o atraso do filtro** num degrau (a sacada entre dois alvos), medido
 *    contra a entrada do próprio filtro — a latência humana da sacada fica de
 *    fora, porque as duas séries a contêm.
 *
 * Tudo puro, sem DOM, para ser testado sozinho.
 */

/**
 * Autocorrelação de lag 1 agrupada nos dois eixos, em torno das médias.
 * `null` com menos de 3 amostras ou sem variância.
 */
export function autocorrelacaoLag1(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n;
  my /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    den += dx * dx + dy * dy;
    if (i > 0) num += dx * (xs[i - 1] - mx) + dy * (ys[i - 1] - my);
  }
  return den > 0 ? num / den : null;
}

/** Percentil com interpolação linear sobre uma lista já ordenada. */
function percentil(ordenados: readonly number[], q: number): number {
  const n = ordenados.length;
  if (n === 1) return ordenados[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (pos - lo);
}

/**
 * Lado do menor alvo quadrado, centrado no alvo, que contém 95 % das amostras:
 * 2 × o percentil 95 da distância de Chebyshev max(|dx|, |dy|). É a versão
 * empírica do S = 2(O + 2σ) de Feit et al. (2017), sem supor normalidade — o
 * ruído de webcam tem cauda.
 *
 * Com `amostrasPorJanela` = k > 1 é o S₉₅(T) de docs/PESQUISA.md §3.4: o
 * lado que contém 95 % das JANELAS de k amostras seguidas inteiras, que é o
 * que um dwell de T ms precisa — o cursor tem de ficar no botão o tempo todo,
 * não só na maior parte das amostras. `null` sem amostras suficientes.
 */
export function lado95(
  xs: readonly number[],
  ys: readonly number[],
  alvo: { x: number; y: number },
  amostrasPorJanela = 1,
): number | null {
  const n = Math.min(xs.length, ys.length);
  const k = Math.max(1, Math.round(amostrasPorJanela));
  if (n < k || n === 0) return null;
  const cheb: number[] = [];
  for (let i = 0; i < n; i++) cheb.push(Math.max(Math.abs(xs[i] - alvo.x), Math.abs(ys[i] - alvo.y)));
  const porJanela: number[] = [];
  for (let i = 0; i + k <= n; i++) {
    let m = 0;
    for (let j = i; j < i + k; j++) m = Math.max(m, cheb[j]);
    if (Number.isFinite(m)) porJanela.push(m);
  }
  if (porJanela.length === 0) return null;
  porJanela.sort((a, b) => a - b);
  return 2 * percentil(porJanela, 0.95);
}

/** Uma amostra da série de um alvo, desde que ele apareceu. */
export interface AmostraDoDegrau {
  t: number;
  /** Entrada do filtro (a predição que ele recebeu). */
  ex: number;
  ey: number;
  /** Saída do filtro (o cursor). */
  sx: number;
  sy: number;
}

/** Menor salto, em desvios do ruído da entrada, para o degrau valer como medida. */
export const SALTO_MINIMO_EM_DESVIOS = 5;

/**
 * Atraso do filtro num degrau: quanto a saída demora, depois da entrada, para
 * cruzar 50 % e 90 % do salto entre a posição de partida e a de chegada.
 *
 * A partida é a primeira amostra (o alvo anterior); a chegada, a mediana da
 * entrada na segunda metade da série. O progresso de cada série é a projeção
 * no vetor do salto, e o cruzamento é o da mediana de 3 amostras — um pico de
 * ruído não conta como chegada. `null` quando o salto é menor que
 * `SALTO_MINIMO_EM_DESVIOS` desvios do ruído (não dá para separar um degrau do
 * tremor) ou quando alguma série não cruza.
 */
export function atrasoDoDegrau(serie: readonly AmostraDoDegrau[]): { t50Ms: number; t90Ms: number } | null {
  const n = serie.length;
  if (n < 8) return null;
  const metade = serie.slice(Math.floor(n / 2));
  const mediana = (v: number[]) => {
    const o = [...v].sort((a, b) => a - b);
    const m = o.length >> 1;
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  };
  const fimX = mediana(metade.map((a) => a.ex));
  const fimY = mediana(metade.map((a) => a.ey));
  const iniX = serie[0].ex;
  const iniY = serie[0].ey;
  const jx = fimX - iniX;
  const jy = fimY - iniY;
  const salto2 = jx * jx + jy * jy;
  let ruido2 = 0;
  for (const a of metade) ruido2 += (a.ex - fimX) ** 2 + (a.ey - fimY) ** 2;
  ruido2 /= metade.length;
  if (!(salto2 > 0) || salto2 < SALTO_MINIMO_EM_DESVIOS ** 2 * ruido2) return null;

  const progresso = (x: number, y: number) => ((x - iniX) * jx + (y - iniY) * jy) / salto2;
  const pe = serie.map((a) => progresso(a.ex, a.ey));
  const ps = serie.map((a) => progresso(a.sx, a.sy));
  const cruzamento = (p: number[], nivel: number): number | null => {
    for (let i = 1; i < p.length - 1; i++) {
      const m3 = [p[i - 1], p[i], p[i + 1]].sort((a, b) => a - b)[1];
      if (m3 >= nivel) return serie[i].t;
    }
    return null;
  };
  const e50 = cruzamento(pe, 0.5);
  const s50 = cruzamento(ps, 0.5);
  const e90 = cruzamento(pe, 0.9);
  const s90 = cruzamento(ps, 0.9);
  if (e50 === null || s50 === null || e90 === null || s90 === null) return null;
  return { t50Ms: s50 - e50, t90Ms: s90 - e90 };
}
