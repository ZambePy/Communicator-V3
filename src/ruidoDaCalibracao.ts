/**
 * Ruído de fixação medido na calibração (usado por M9 e M15).
 *
 * Durante a janela de um alvo o olhar está parado por construção: tudo o que
 * a predição varia em torno da média do alvo é ruído. Daqui saem:
 *
 *  - a covariância 2×2 do ruído em cada alvo, em px, com o termo cruzado. Não
 *    se supõe "vertical maior": num rastreador por webcam o ruído em x foi
 *    MAIOR que em y (Kaduk et al. 2024), e no relatório de 28/09 também;
 *  - a autocorrelação de lag 1 (ρ₁), que diz quantas amostras independentes
 *    há numa janela. Na última medição a razão RMS-S2S/STD de 0,66 dá ρ₁ ≈ 0,78
 *    (Niehorster et al. 2020: RMS-S2S/STD = √(2(1 − ρ₁))).
 *
 * Duas correções, as duas contas diretas (docs/PESQUISA.md §3.4):
 *
 *  1. **Janela.** O desvio em torno da média da própria janela subestima σ
 *     quando o ruído é correlacionado: E[s²] = σ²·(1 − v_n), com v_n a
 *     variância da média de n amostras em unidades de σ². Divide-se por
 *     (1 − v_n).
 *  2. **Robustez.** Picos inflam a covariância amostral. Escala-se Σ para a
 *     mediana de d² bater com a mediana da χ² com 2 graus de liberdade,
 *     2·ln 2 ≈ 1,386 — a versão 2D da escala pela mediana de Engbert & Kliegl
 *     (2003) — e, a partir dela, a covariância é reponderada (Huber sobre d²),
 *     porque a escala sozinha não corrige a forma de uma elipse esticada por
 *     um pico numa direção.
 *
 * A ordem importa: a escala robusta é dos DESVIOS, cuja covariância é a
 * encolhida, σ²·(1 − v_n); a correção da janela vem depois dela. Com a ordem
 * trocada, a mediana de d² saía (1 − v_n) vezes a da χ² e a escala desfazia a
 * correção inteira.
 */

import { mediana } from './estatistica';

export interface RuidoNoAlvo {
  /** Alvo em fração da tela. */
  x: number;
  y: number;
  /** Covariância do ruído em px² (xx, yy, xy). */
  sxx: number;
  syy: number;
  sxy: number;
}

export interface RuidoDaCalibracao {
  alvos: RuidoNoAlvo[];
  /** Autocorrelação de lag 1 do ruído, média dos dois eixos, em [0, 0,99]. */
  rho1: number;
}

/** Uma predição da calibração, em px, com o alvo nominal dela. */
export interface AmostraDoRuido {
  grupo: string;
  alvoX: number;
  alvoY: number;
  x: number;
  y: number;
}

/** Mediana da χ² com 2 graus de liberdade: 2·ln 2. */
export const MEDIANA_CHI2_2GL = 2 * Math.LN2;

/** Quantil de 99 % da χ² com 2 graus de liberdade: −2·ln 0,01. */
export const QUANTIL_99_CHI2_2GL = -2 * Math.log(0.01);

/** Passes de reponderação da covariância de cada alvo. */
const PASSES_DE_REPONDERACAO = 3;

/** Variância da média de n amostras AR(1), em unidades de σ². */
export function varianciaDaMedia(n: number, rho: number): number {
  if (n <= 1) return 1;
  const r = Math.max(0, Math.min(0.99, rho));
  let soma = 0;
  let rk = r;
  for (let k = 1; k < n; k++) {
    soma += (1 - k / n) * rk;
    rk *= r;
  }
  return (1 + 2 * soma) / n;
}

/** Número efetivo de amostras independentes numa janela de n amostras AR(1). */
export function amostrasEfetivas(n: number, rho: number): number {
  return n > 0 ? 1 / varianciaDaMedia(n, rho) : 0;
}

/**
 * Fator que leva a mediana de d² (com a covariância dada, em torno do centro
 * dado) à mediana da χ² com 2 graus de liberdade.
 */
function escalaPelaMediana(
  dx: readonly number[],
  dy: readonly number[],
  c: { mx: number; my: number; sxx: number; syy: number; sxy: number },
): number {
  const det = c.sxx * c.syy - c.sxy * c.sxy;
  if (!(det > 0)) return 1;
  const d2 = dx.map((x0, i) => {
    const ex = x0 - c.mx;
    const ey = dy[i] - c.my;
    return (c.syy * ex * ex - 2 * c.sxy * ex * ey + c.sxx * ey * ey) / det;
  });
  const med = mediana(d2);
  return med > 0 ? med / MEDIANA_CHI2_2GL : 1;
}

/**
 * Estima o ruído por alvo. As amostras de cada alvo precisam estar na ordem
 * em que foram coletadas (é daí que sai o ρ₁). Alvos com menos de 15 amostras
 * ficam de fora; `null` se nenhum sobrar.
 */
export function estimarRuido(
  amostras: readonly AmostraDoRuido[],
  vw: number,
  vh: number,
): RuidoDaCalibracao | null {
  const porGrupo = new Map<string, AmostraDoRuido[]>();
  for (const a of amostras) {
    if (![a.x, a.y].every(Number.isFinite)) continue;
    const l = porGrupo.get(a.grupo);
    if (l) l.push(a);
    else porGrupo.set(a.grupo, [a]);
  }

  // ρ₁ agrupado: soma dos produtos de desvios consecutivos sobre soma dos quadrados.
  let num = 0;
  let den = 0;
  const brutos: { a: AmostraDoRuido; dx: number[]; dy: number[] }[] = [];
  for (const lista of porGrupo.values()) {
    if (lista.length < 15) continue;
    const mx = lista.reduce((s, a) => s + a.x, 0) / lista.length;
    const my = lista.reduce((s, a) => s + a.y, 0) / lista.length;
    const dx = lista.map((a) => a.x - mx);
    const dy = lista.map((a) => a.y - my);
    for (let i = 1; i < lista.length; i++) num += dx[i] * dx[i - 1] + dy[i] * dy[i - 1];
    for (let i = 0; i < lista.length; i++) den += dx[i] * dx[i] + dy[i] * dy[i];
    brutos.push({ a: lista[0], dx, dy });
  }
  if (brutos.length === 0 || !(den > 0)) return null;
  const rho1 = Math.max(0, Math.min(0.99, num / den));

  const alvos: RuidoNoAlvo[] = [];
  for (const { a, dx, dy } of brutos) {
    const n = dx.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      sxx += dx[i] * dx[i];
      syy += dy[i] * dy[i];
      sxy += dx[i] * dy[i];
    }
    // Covariância dos desvios em torno da média da janela.
    sxx /= n;
    syy /= n;
    sxy /= n;
    // Escala robusta pela mediana de d² dos próprios desvios.
    if (!(sxx * syy - sxy * sxy > 0)) continue;
    const escala = escalaPelaMediana(dx, dy, { mx: 0, my: 0, sxx, syy, sxy });
    // A escala acerta o TAMANHO da elipse, não a forma: um pico numa direção
    // (um salto de 1000 px na diagonal) ainda a esticaria para o lado dele.
    // Reponderação de Huber da covariância: cada desvio pesa
    // min(1, χ²₂(0,99)/d²) — a massa gaussiana fica com peso 1 e o pico quase
    // some — e média e covariância são refeitas com os pesos, três vezes.
    let c = { mx: 0, my: 0, sxx: sxx * escala, syy: syy * escala, sxy: sxy * escala };
    for (let passe = 0; passe < PASSES_DE_REPONDERACAO; passe++) {
      const detC = c.sxx * c.syy - c.sxy * c.sxy;
      if (!(detC > 0)) break;
      let sw = 0;
      let mx = 0;
      let my = 0;
      const w = dx.map((x0, i) => {
        const ex = x0 - c.mx;
        const ey = dy[i] - c.my;
        const d = (c.syy * ex * ex - 2 * c.sxy * ex * ey + c.sxx * ey * ey) / detC;
        const peso = d > QUANTIL_99_CHI2_2GL ? QUANTIL_99_CHI2_2GL / d : 1;
        sw += peso;
        mx += peso * x0;
        my += peso * dy[i];
        return peso;
      });
      mx /= sw;
      my /= sw;
      let rxx = 0;
      let ryy = 0;
      let rxy = 0;
      for (let i = 0; i < n; i++) {
        const ex = dx[i] - mx;
        const ey = dy[i] - my;
        rxx += w[i] * ex * ex;
        ryy += w[i] * ey * ey;
        rxy += w[i] * ex * ey;
      }
      c = { mx, my, sxx: rxx / sw, syy: ryy / sw, sxy: rxy / sw };
    }
    // Os pesos também encolhem a cauda gaussiana; a mesma escala pela mediana,
    // agora com a forma certa, devolve o tamanho.
    const escalaFinal = escalaPelaMediana(dx, dy, c);
    // Desvios → σ: divide por (1 − v_n), depois da parte robusta.
    const fator = escalaFinal / Math.max(0.05, 1 - varianciaDaMedia(n, rho1));
    alvos.push({
      x: vw > 0 ? a.alvoX / vw : a.alvoX,
      y: vh > 0 ? a.alvoY / vh : a.alvoY,
      sxx: c.sxx * fator,
      syy: c.syy * fator,
      sxy: c.sxy * fator,
    });
  }
  return alvos.length > 0 ? { alvos, rho1 } : null;
}

/**
 * Covariância do ruído num ponto da tela, interpolada entre os alvos com peso
 * gaussiano. O ruído muda pela tela (de 36 a 116 px de desvio entre os pontos
 * do relatório de 28/09, pior nas bordas); uma Σ global seria apertada nas
 * bordas e frouxa no centro. ℓ de 15 % da diagonal faz a covariância variar
 * entre alvos vizinhos (que ficam a ~⅓ da tela) sem degrau.
 */
export function covarianciaNoPonto(
  r: RuidoDaCalibracao,
  xPx: number,
  yPx: number,
  vw: number,
  vh: number,
): { sxx: number; syy: number; sxy: number } {
  const ell = 0.15 * Math.hypot(vw, vh);
  let sw = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const a of r.alvos) {
    const d2 = (a.x * vw - xPx) ** 2 + (a.y * vh - yPx) ** 2;
    const w = Math.exp(-d2 / (2 * ell * ell));
    sw += w;
    sxx += w * a.sxx;
    syy += w * a.syy;
    sxy += w * a.sxy;
  }
  if (!(sw > 1e-12)) {
    // Longe de todos os alvos (fora da tela): a média simples.
    const n = r.alvos.length;
    return {
      sxx: r.alvos.reduce((s, a) => s + a.sxx, 0) / n,
      syy: r.alvos.reduce((s, a) => s + a.syy, 0) / n,
      sxy: r.alvos.reduce((s, a) => s + a.sxy, 0) / n,
    };
  }
  return { sxx: sxx / sw, syy: syy / sw, sxy: sxy / sw };
}

/** Validação de um valor vindo de um perfil salvo. */
export function ruidoValido(v: unknown): RuidoDaCalibracao | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.rho1 !== 'number' || !Number.isFinite(o.rho1) || !Array.isArray(o.alvos)) return null;
  const alvos = (o.alvos as unknown[]).filter((a): a is RuidoNoAlvo => {
    if (!a || typeof a !== 'object') return false;
    const q = a as Record<string, unknown>;
    return [q.x, q.y, q.sxx, q.syy, q.sxy].every((n) => typeof n === 'number' && Number.isFinite(n))
      && (q.sxx as number) > 0 && (q.syy as number) > 0
      && (q.sxx as number) * (q.syy as number) > (q.sxy as number) ** 2;
  });
  return alvos.length > 0 ? { alvos, rho1: Math.max(0, Math.min(0.99, o.rho1)) } : null;
}
