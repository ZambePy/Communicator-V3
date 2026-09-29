/**
 * Fusão binocular por variância mínima (M10 em docs/PESQUISA.md).
 *
 * Antes, cada olho pesava EAR × confiabilidade × dominância, com a
 * confiabilidade tirada do erro de TREINO de cada olho — que favorece o olho
 * cujo modelo decora mais. E os erros dos dois olhos não são independentes:
 * no IrisFlow eles dividem o bloco do L2CS (idêntico nos dois vetores), a pose
 * e os landmarks. Com erros correlacionados, os pesos que minimizam a
 * variância da média são (Bates & Granger 1969; forma geral em Capistrán &
 * Timmermann):
 *
 *     w_E = (σ_D² − σ_ED) / (σ_E² + σ_D² − 2·σ_ED)
 *
 * com σ² e σ_ED medidos nos resíduos do leave-one-target-out da calibração,
 * por eixo — erro fora da amostra, não de treino.
 *
 * O peso estimado é ENCOLHIDO para ½ pelo quanto ele mesmo é incerto. Pesos
 * estimados costumam perder da média simples por erro de estimação (Frazier et
 * al. 2023, o "forecast combination puzzle"), e aqui a fórmula amplifica esse
 * erro: com os olhos correlacionados (ρ alto), w − ½ ≈ (σ_E² − σ_D²)/(4σ²(1−ρ)),
 * e uma diferença de 20 % entre as variâncias com ρ = 0,9 já leva o peso a 0.
 * A incerteza sai de um jackknife sobre os alvos (o peso recalculado sem cada
 * um): κ = (w − ½)²/((w − ½)² + Var_J(w)), e o peso fica ½ + κ·(w − ½). No
 * replay da gravação de 23/09, encolher só a diferença das variâncias (a
 * versão anterior) deixava o peso vertical em 0 com 9 alvos.
 *
 * Nenhum olho pesa menos que `PESO_MINIMO` (o piso de peso de antes): um olho
 * com peso 0 continuaria fora da média mesmo com o outro fechando.
 *
 * O EAR instantâneo e a dominância entram INFLANDO a variância do olho (σ²/a²),
 * não multiplicando o peso: um olho fechando perde peso pela mesma fórmula, e
 * um olho fechado (a → piso) sai da média. Nessa parte dinâmica os olhos são
 * tratados como independentes — o ruído de uma pálpebra fechando é daquele
 * olho —, com as variâncias equivalentes ao peso estático (1 − w para o
 * esquerdo, w para o direito).
 */

export interface CovarianciaDosOlhos {
  /** σ² do olho esquerdo (fração de tela ao quadrado). */
  e: number;
  /** σ² do olho direito. */
  d: number;
  /** Covariância entre os erros dos dois olhos. */
  ed: number;
  /** Peso do olho esquerdo com os dois olhos abertos, já encolhido para ½. */
  peso: number;
}

export interface FusaoPorCovariancia {
  x: CovarianciaDosOlhos;
  y: CovarianciaDosOlhos;
}

/** Resíduo fora da amostra de um quadro: predição de cada olho menos o alvo. */
export interface ResiduoBinocular {
  grupo: string;
  e: { x: number; y: number };
  d: { x: number; y: number };
}

/** Piso da abertura do olho na inflação da variância (o mesmo piso de peso de antes). */
export const ABERTURA_MINIMA = 0.05;

/** Menor peso estático de um olho (o mesmo piso de peso de antes). */
export const PESO_MINIMO = 0.05;

function momentos(rs: readonly ResiduoBinocular[], eixo: 'x' | 'y') {
  let e = 0;
  let d = 0;
  let ed = 0;
  for (const r of rs) {
    e += r.e[eixo] * r.e[eixo];
    d += r.d[eixo] * r.d[eixo];
    ed += r.e[eixo] * r.d[eixo];
  }
  const n = rs.length;
  return { e: e / n, d: d / n, ed: ed / n };
}

/** Peso de variância mínima do olho esquerdo, preso em [0, 1]; denominador degenerado → ½. */
function pesoDeVarianciaMinima(m: { e: number; d: number; ed: number }): number {
  const den = m.e + m.d - 2 * m.ed;
  if (!(den > 0)) return 0.5;
  return Math.max(0, Math.min(1, (m.d - m.ed) / den));
}

/**
 * Covariância dos erros por eixo e o peso estático encolhido pelo jackknife
 * sobre os alvos. `null` com menos de 3 alvos ou sem dado.
 */
export function estimarFusao(residuos: readonly ResiduoBinocular[]): FusaoPorCovariancia | null {
  const validos = residuos.filter(
    (r) => [r.e.x, r.e.y, r.d.x, r.d.y].every(Number.isFinite),
  );
  const grupos = [...new Set(validos.map((r) => r.grupo))];
  if (grupos.length < 3 || validos.length === 0) return null;

  const eixo = (ax: 'x' | 'y'): CovarianciaDosOlhos => {
    const m = momentos(validos, ax);
    const w = pesoDeVarianciaMinima(m);
    // Jackknife: o peso recalculado sem cada alvo.
    const parciais = grupos.map((g) => pesoDeVarianciaMinima(momentos(validos.filter((r) => r.grupo !== g), ax)));
    const media = parciais.reduce((a, b) => a + b, 0) / parciais.length;
    const G = grupos.length;
    const varJ = ((G - 1) / G) * parciais.reduce((a, b) => a + (b - media) ** 2, 0);
    const desvio = (w - 0.5) ** 2;
    const kappa = desvio + varJ > 0 ? desvio / (desvio + varJ) : 0;
    const peso = Math.max(PESO_MINIMO, Math.min(1 - PESO_MINIMO, 0.5 + kappa * (w - 0.5)));
    return { e: m.e, d: m.d, ed: m.ed, peso };
  };
  const x = eixo('x');
  const y = eixo('y');
  if (![x.e, x.d, x.ed, y.e, y.d, y.ed, x.peso, y.peso].every(Number.isFinite) || x.e <= 0 || x.d <= 0 || y.e <= 0 || y.d <= 0) {
    return null;
  }
  return { x, y };
}

/**
 * Peso do olho esquerdo num eixo.
 *
 * `abertura` ∈ [0, 1] é o EAR relativo de cada olho (1 = aberto); a variância
 * do olho vira σ²/max(piso, a)². `ganhoDominante` > 1 reduz a variância do
 * olho dominante na mesma proporção em que o antigo ganho multiplicava o peso.
 * Sem abertura nem dominância, é o peso estático.
 */
export function pesoDoOlhoEsquerdo(
  c: CovarianciaDosOlhos,
  abertura?: { left: number; right: number },
  ganhoDominante?: { left: number; right: number },
): number {
  const aE = abertura ? Math.max(ABERTURA_MINIMA, Math.min(1, abertura.left)) : 1;
  const aD = abertura ? Math.max(ABERTURA_MINIMA, Math.min(1, abertura.right)) : 1;
  const gE = ganhoDominante?.left ?? 1;
  const gD = ganhoDominante?.right ?? 1;
  const vE = (1 - c.peso) / (aE * aE * gE);
  const vD = c.peso / (aD * aD * gD);
  return vD / (vE + vD);
}

/** Ponto fundido dos dois olhos, eixo a eixo. */
export function fundirPorCovariancia(
  f: FusaoPorCovariancia,
  e: { x: number; y: number },
  d: { x: number; y: number },
  abertura?: { left: number; right: number },
  ganhoDominante?: { left: number; right: number },
): { x: number; y: number } {
  const wx = pesoDoOlhoEsquerdo(f.x, abertura, ganhoDominante);
  const wy = pesoDoOlhoEsquerdo(f.y, abertura, ganhoDominante);
  return { x: wx * e.x + (1 - wx) * d.x, y: wy * e.y + (1 - wy) * d.y };
}

/** Validação de um valor vindo de um perfil salvo (versão antiga ou adulterada → `null`). */
export function fusaoValida(v: unknown): FusaoPorCovariancia | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const eixoOk = (e: unknown): e is CovarianciaDosOlhos => {
    if (!e || typeof e !== 'object') return false;
    const c = e as Record<string, unknown>;
    return [c.e, c.d, c.ed, c.peso].every((n) => typeof n === 'number' && Number.isFinite(n))
      && (c.e as number) > 0 && (c.d as number) > 0
      && (c.peso as number) >= PESO_MINIMO && (c.peso as number) <= 1 - PESO_MINIMO;
  };
  return eixoOk(o.x) && eixoOk(o.y) ? { x: o.x, y: o.y } : null;
}
