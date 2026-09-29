/**
 * Correção por dwell como filtro de Kalman (M15) com ganho opcional (M16).
 *
 * ## Por que trocar o integrador
 *
 * `offset += 0,05·resíduo` é um Kalman de regime com q/r = k²/(1 − k) =
 * 0,0026 por rótulo, que supõe um deslocamento quase parado (docs/PESQUISA.md
 * §3.5). O projeto mediu erro médio de 74 px e o viés vertical virando 190 px
 * em dez minutos. E o 0,05 não vem do estudo citado no código antigo: Krowicki
 * et al. (2026) usaram 0,05 sem ajuste, com rastreador infravermelho, e
 * mediram o cursor já corrigido.
 *
 * ## O modelo, por eixo, em px
 *
 *  - **Estado** [o, g]: deslocamento e desvio de ganho em torno do centro da
 *    tela. Sem o afim (M16), g fica em zero e só o deslocamento anda.
 *  - **Predição: Ornstein–Uhlenbeck exato.** φ = 2^(−Δt/T½); x ← φx;
 *    P ← φ²P + Σ∞(1 − φ²). A média decai como o integrador de antes (mesma
 *    meia-vida); a diferença é a variância, que volta a Σ∞ numa pausa longa —
 *    e o rótulo seguinte entra com ganho alto, como deve.
 *  - **Medida em malha aberta**: z = centro do alvo − mediana da predição
 *    ANTES desta correção e antes do clamp, na janela estável do dwell (sem a
 *    chegada nem a saída do olhar). É o que o EyeO faz, e fica imune ao clamp,
 *    ao filtro e à própria correção — a realimentação com a borda some.
 *  - **Ruído da medida** R = (0,29·W)² + (π/2)·s²/N_eff: o olhar pode estar
 *    em qualquer ponto do botão (uniforme num lado W tem desvio W/√12), mais a
 *    incerteza da mediana de N amostras correlacionadas (N_eff pelo ρ₁ da
 *    calibração; π/2 é a eficiência da mediana contra a média).
 *  - **Atualização** com K do deslocamento limitado a 0,5 (um rótulo só nunca
 *    move mais que metade do caminho), forma de Joseph na covariância (vale
 *    para qualquer K) e teste χ² da inovação em 2D a 99 % (9,21).
 *  - **Postura**: a mudança de pose desde o último rótulo infla P do
 *    deslocamento em (κ·d·tan Δθ)², com κ = 0,1 — o erro relativo que a
 *    compensação de pose deixa: 5 % entre d·tan Δ e a geometria exata
 *    (`geometria6dof.test.ts`) somados aos ~3 % de ganho da pose do MediaPipe
 *    com o FOV fixo de 63° (docs/PESQUISA.md §3.3). Parâmetro para ajustar
 *    pelos logs (NIS).
 *
 * Constantes: T½ = 10 min (uma correção afim vale ~10 min, Padikal et al.
 * 2025 — é também a meia-vida de antes); σ∞ = 60 px por eixo (erro médio de
 * 74 px radial ⇒ 74/√(π/2) ≈ 59 px por eixo, supondo gaussiana isotrópica);
 * ganho com desvio de 0,05 (os limites [0,9; 1,1] de Carr et al. 2022 como
 * ±2σ). Contas em docs/PESQUISA.md §3.5 e na pesquisa D.
 */

/** Meia-vida do deslocamento e do ganho. */
export const T_MEIA_MS = 10 * 60_000;
/** Desvio estacionário do deslocamento, por eixo, em px. */
export const SIGMA_INF_PX = 60;
/** Desvio estacionário do desvio de ganho (adimensional). */
export const SIGMA_GANHO = 0.05;
/** Limite do desvio de ganho: s ∈ [0,9; 1,1]. */
export const GANHO_MAX = 0.1;
/** Desvio de um olhar uniforme num lado W: W/√12. */
export const C_W = 1 / Math.sqrt(12);
/** Teto do ganho de Kalman do deslocamento. */
export const K_MAX = 0.5;
/** χ² com 2 graus de liberdade a 99 %. */
export const CHI2_2GL_99 = -2 * Math.log(0.01);
/** Fração do erro de postura que a compensação deixa passar. */
export const KAPPA_POSTURA = 0.1;
/** Eficiência da mediana: Var(mediana) ≈ (π/2)·Var(média). */
export const FATOR_MEDIANA = Math.PI / 2;
/**
 * Espalhamento dos últimos rótulos, em fração do eixo, a partir do qual o
 * ganho pode ser aprendido por inteiro (rampa linear desde zero). Com os
 * rótulos todos num lugar só, deslocamento e ganho se confundem, e o ganho
 * aprendido extrapolaria errado no resto da tela (Goel et al. 2020 sobre
 * excitação). 40 % é a proposta da pesquisa D, a conferir nos logs.
 */
export const ESPALHAMENTO_PLENO = 0.4;
/** Rótulos guardados para medir o espalhamento. */
export const ROTULOS_DO_ESPALHAMENTO = 10;

/** Estado de um eixo: [deslocamento px, desvio de ganho] e covariância 2×2. */
export interface EixoDoKalman {
  o: number;
  g: number;
  poo: number;
  pog: number;
  pgg: number;
}

export interface EstadoDoKalman {
  x: EixoDoKalman;
  y: EixoDoKalman;
  /** Instante da última predição (ms). */
  ultimoMs: number | null;
}

/** Medida de um rótulo, em px. */
export interface MedidaDoRotulo {
  /** Centro do alvo. */
  centro: { x: number; y: number };
  /** Mediana da predição sem esta correção na janela estável do dwell. */
  mediana: { x: number; y: number };
  /** R por eixo, em px². */
  r: { x: number; y: number };
}

export function eixoInicial(): EixoDoKalman {
  return { o: 0, g: 0, poo: SIGMA_INF_PX ** 2, pog: 0, pgg: SIGMA_GANHO ** 2 };
}

export function criarKalman(): EstadoDoKalman {
  return { x: eixoInicial(), y: eixoInicial(), ultimoMs: null };
}

function preverEixo(e: EixoDoKalman, phi: number): EixoDoKalman {
  const p2 = phi * phi;
  return {
    o: phi * e.o,
    g: phi * e.g,
    poo: p2 * e.poo + SIGMA_INF_PX ** 2 * (1 - p2),
    pog: p2 * e.pog,
    pgg: p2 * e.pgg + SIGMA_GANHO ** 2 * (1 - p2),
  };
}

/** Predição OU até `agoraMs`. Tempo que volta para trás não faz nada. */
export function preverKalman(e: EstadoDoKalman, agoraMs: number): EstadoDoKalman {
  if (!Number.isFinite(agoraMs)) return e;
  if (e.ultimoMs === null) return { ...e, ultimoMs: agoraMs };
  const dt = agoraMs - e.ultimoMs;
  if (!(dt > 0)) return e;
  const phi = Math.pow(0.5, dt / T_MEIA_MS);
  return { x: preverEixo(e.x, phi), y: preverEixo(e.y, phi), ultimoMs: agoraMs };
}

/**
 * R de um rótulo por eixo: o olhar uniforme no botão mais a incerteza da
 * mediana da janela.
 */
export function ruidoDoRotulo(
  ladoPx: { largura: number; altura: number },
  dispersaoPx: { x: number; y: number },
  nEfetivo: number,
): { x: number; y: number } {
  const n = Math.max(1, nEfetivo);
  return {
    x: (C_W * ladoPx.largura) ** 2 + (FATOR_MEDIANA * dispersaoPx.x ** 2) / n,
    y: (C_W * ladoPx.altura) ** 2 + (FATOR_MEDIANA * dispersaoPx.y ** 2) / n,
  };
}

/**
 * Espalhamento → fator de excitação do ganho, em [0, 1], rampa linear até
 * `ESPALHAMENTO_PLENO` do eixo.
 */
export function excitacaoDoGanho(posicoes: readonly number[], tamanhoDoEixoPx: number): number {
  if (posicoes.length < 2 || !(tamanhoDoEixoPx > 0)) return 0;
  const faixa = Math.max(...posicoes) - Math.min(...posicoes);
  return Math.max(0, Math.min(1, faixa / (ESPALHAMENTO_PLENO * tamanhoDoEixoPx)));
}

/** Injeção de variância no deslocamento por mudança de postura, px². */
export function injecaoPorPostura(
  deltaRad: { yaw: number; pitch: number },
  distanciaPx: number,
): { x: number; y: number } {
  if (!(distanciaPx > 0)) return { x: 0, y: 0 };
  const e = (d: number) => (Number.isFinite(d) ? KAPPA_POSTURA * distanciaPx * Math.tan(Math.min(Math.abs(d), 1.2)) : 0);
  return { x: e(deltaRad.yaw) ** 2, y: e(deltaRad.pitch) ** 2 };
}

interface AtualizacaoDoEixo {
  eixo: EixoDoKalman;
  nu: number;
  s: number;
}

/**
 * Atualização de um eixo. `h` é a posição da mediana em relação ao centro do
 * eixo (px); `excitacao` ∈ [0, 1] escala o quanto o ganho pode se mover.
 */
function atualizarEixo(
  e: EixoDoKalman,
  z: number,
  h: number,
  r: number,
  excitacao: number,
  afim: boolean,
  kMax: number,
): AtualizacaoDoEixo {
  const hg = afim ? h : 0;
  // Inovação e sua variância com a covariância verdadeira.
  const pred = e.o + e.g * hg;
  const nu = z - pred;
  const s = e.poo + 2 * hg * e.pog + hg * hg * e.pgg + r;
  // Ganho com o ganho de escala (g) contido pela excitação: a coluna de g da
  // covariância usada no ganho é multiplicada pelo fator.
  const c = afim ? excitacao : 0;
  const pohEff = e.poo + hg * c * e.pog;
  const pghEff = c * e.pog + hg * c * c * e.pgg;
  const sEff = e.poo + 2 * hg * c * e.pog + hg * hg * c * c * e.pgg + r;
  let ko = pohEff / sEff;
  let kg = pghEff / sEff;
  if (ko > kMax) {
    const f = kMax / ko;
    ko *= f;
    kg *= f;
  }
  // Joseph: P' = (I − K H) P (I − K H)ᵀ + K r Kᵀ, com H = [1, hg].
  const a11 = 1 - ko;
  const a12 = -ko * hg;
  const a21 = -kg;
  const a22 = 1 - kg * hg;
  const { poo, pog, pgg } = e;
  // M = A P
  const m11 = a11 * poo + a12 * pog;
  const m12 = a11 * pog + a12 * pgg;
  const m21 = a21 * poo + a22 * pog;
  const m22 = a21 * pog + a22 * pgg;
  // M Aᵀ + K r Kᵀ
  const nPoo = m11 * a11 + m12 * a12 + ko * ko * r;
  const nPog = m11 * a21 + m12 * a22 + ko * kg * r;
  const nPgg = m21 * a21 + m22 * a22 + kg * kg * r;
  const g = afim ? Math.max(-GANHO_MAX, Math.min(GANHO_MAX, e.g + kg * nu)) : 0;
  return {
    eixo: {
      o: e.o + ko * nu,
      g,
      poo: Math.max(nPoo, 0),
      pog: afim ? nPog : 0,
      pgg: afim ? Math.max(nPgg, 0) : e.pgg,
    },
    nu,
    s,
  };
}

export type MotivoDaRecusa = 'chi2' | 'invalida';

export interface ResultadoDoKalman {
  estado: EstadoDoKalman;
  aceita: boolean;
  motivo?: MotivoDaRecusa;
  /** d² = Σ ν²/S (2 graus de liberdade): o NIS do rótulo. */
  nis: number | null;
}

/**
 * Incorpora um rótulo. `estado` já deve estar previsto até agora. `centroDaTela`
 * é o ponto em torno do qual o ganho age; `excitacao`, por eixo.
 */
export function atualizarKalman(
  estado: EstadoDoKalman,
  m: MedidaDoRotulo,
  opcoes: {
    centroDaTela: { x: number; y: number };
    afim: boolean;
    excitacao?: { x: number; y: number };
    injecao?: { x: number; y: number };
    /**
     * Ponto de uma recalibração rápida (M20): a pessoa olhou o alvo de
     * propósito, então sem teste χ² e sem o teto de ganho de um rótulo de uso.
     */
    deliberada?: boolean;
  },
): ResultadoDoKalman {
  const valores = [m.centro.x, m.centro.y, m.mediana.x, m.mediana.y, m.r.x, m.r.y];
  if (!valores.every(Number.isFinite) || !(m.r.x > 0) || !(m.r.y > 0)) {
    return { estado, aceita: false, motivo: 'invalida', nis: null };
  }
  const inj = opcoes.injecao ?? { x: 0, y: 0 };
  const ex = { ...estado.x, poo: estado.x.poo + inj.x };
  const ey = { ...estado.y, poo: estado.y.poo + inj.y };
  const exc = opcoes.excitacao ?? { x: 0, y: 0 };
  const kMax = opcoes.deliberada ? 1 : K_MAX;
  const ax = atualizarEixo(ex, m.centro.x - m.mediana.x, m.mediana.x - opcoes.centroDaTela.x, m.r.x, exc.x, opcoes.afim, kMax);
  const ay = atualizarEixo(ey, m.centro.y - m.mediana.y, m.mediana.y - opcoes.centroDaTela.y, m.r.y, exc.y, opcoes.afim, kMax);
  const nis = (ax.nu * ax.nu) / ax.s + (ay.nu * ay.nu) / ay.s;
  if (!opcoes.deliberada && !(nis < CHI2_2GL_99)) {
    // Recusado: o rótulo não entra, mas a injeção de postura fica — a
    // incerteza sobre o deslocamento cresceu de qualquer jeito.
    return { estado: { ...estado, x: ex, y: ey }, aceita: false, motivo: 'chi2', nis };
  }
  return { estado: { ...estado, x: ax.eixo, y: ay.eixo }, aceita: true, nis };
}

/**
 * Medida direta do deslocamento (reajuste rápido pelo centro): H = [1, 0].
 * Sem teste χ² — a pessoa olhou o centro de propósito — e sem teto de ganho:
 * ~60 quadros no centro valem mais que muitos rótulos de botão.
 */
export function medirDeslocamento(
  estado: EstadoDoKalman,
  z: { x: number; y: number },
  r: { x: number; y: number },
): EstadoDoKalman {
  const eixo = (e: EixoDoKalman, zz: number, rr: number): EixoDoKalman => {
    if (!Number.isFinite(zz) || !(rr > 0)) return e;
    const s = e.poo + rr;
    const ko = e.poo / s;
    const kg = e.pog / s;
    const nu = zz - e.o;
    return {
      o: e.o + ko * nu,
      g: Math.max(-GANHO_MAX, Math.min(GANHO_MAX, e.g + kg * nu)),
      poo: Math.max(0, (1 - ko) * e.poo),
      pog: (1 - ko) * e.pog,
      pgg: Math.max(0, e.pgg - kg * e.pog),
    };
  };
  return { ...estado, x: eixo(estado.x, z.x, r.x), y: eixo(estado.y, z.y, r.y) };
}

/** Correção em px num ponto (px) da tela. */
export function correcaoNoPonto(
  e: EstadoDoKalman,
  p: { x: number; y: number },
  centroDaTela: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: e.x.o + e.x.g * (p.x - centroDaTela.x),
    y: e.y.o + e.y.g * (p.y - centroDaTela.y),
  };
}
