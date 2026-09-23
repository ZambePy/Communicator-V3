/**
 * Correção local nos alvos de calibração que ficam FORA da grade interna — os
 * cantos da tela.
 *
 * ## O problema que resolve
 *
 * O Ridge é um modelo GLOBAL: um polinômio só para a tela inteira. Nos cantos
 * a relação olho→tela deixa de ser a mesma do miolo. Na gravação de referência
 * (23/09/2026) as features SATURAM nos cantos de baixo — o pitch do L2CS, a
 * pálpebra e o offsetY da íris param de andar abaixo de y ≈ 810–900 px, porque
 * a pálpebra desce junto com o olhar e cobre a íris — e o canto superior direito
 * EXPANDE (ganho 1,29). 95 % do erro de canto é viés, não ruído. Mesmo treinando
 * COM os quatro cantos, o modelo global erra 128 px dentro da própria amostra
 * num deles: nenhuma escolha de termos ou de λ representa as quatro distorções
 * ao mesmo tempo sem estragar o miolo.
 *
 * ## A correção
 *
 * Um campo de resíduo em espaço de TELA, interpolado por um núcleo gaussiano
 * (processo gaussiano de média zero sobre o resíduo; Rasmussen & Williams,
 * 2006, §2.2), no estilo "polinômio global + correção local" de Blignaut
 * (2016) e do termo por quadrante de Stampe (1993):
 *
 *     p̄ₖ  = predição média do modelo nas amostras do alvo k (já compensada
 *            por pose e translação — o mesmo ponto do `mapGaze` onde a
 *            correção é aplicada)
 *     rₖ  = alvoₖ − p̄ₖ   se o alvo k está FORA da grade interna (canto)
 *     rₖ  = 0            se está dentro (âncora: ali o modelo global vale)
 *     K   = [exp(−‖p̄ⱼ − p̄ₖ‖² / 2ℓ²)]ⱼₖ
 *     α   = (K + σ²·I)⁻¹ r            (por eixo)
 *     Δ(p) = Σₖ exp(−‖p − p̄ₖ‖² / 2ℓ²) · αₖ
 *
 * Longe dos cantos Δ → 0 e o modelo global fica intacto; perto de um canto a
 * predição é puxada para onde aquele canto realmente está.
 *
 * ## Por que só nos cantos, e por que ℓ e σ² fixos
 *
 * Medido na gravação de referência, com o canto avaliado na 2ª metade da
 * própria fixação (protocolo otimista, ver `replayDeGravacao.test.ts`):
 *
 *   - com os resíduos de TODOS os alvos, a correção transfere idiossincrasias
 *     do momento da calibração para os vizinhos: o primeiro alvo da grade tinha
 *     −109 px de resíduo no treino e o vizinho dele piorou 48 px no teste;
 *   - escolher ℓ/σ² por validação cruzada deixando um alvo de fora desliga a
 *     correção em toda dobra — e está certo que desligue: cada canto tem a sua
 *     distorção, que os outros alvos não preveem. A correção não serve para
 *     prever um canto NÃO calibrado, e sim para acertar o canto calibrado;
 *   - com ℓ = 0,10 e σ² = 0,10 (fração da tela), os cantos caem de ~108 px
 *     para ~39 px e nenhum alvo interno muda mais que ~11 px (média interna
 *     −1 px). Na faixa ℓ ∈ [0,10; 0,20], σ² ∈ [0,03; 0,30] os cantos ficam
 *     entre 37 e 56 px: o resultado não depende de um ajuste fino.
 *
 * LIMITE honesto: é uma gravação de uma pessoa. O canto calibrado e olhado de
 * novo minutos depois deve ficar entre esses 39 px e os ~108 px sem correção.
 */

import { solveLinear } from './ridge';

export interface Ponto {
  x: number;
  y: number;
}

/** Estado serializável da correção (vai no perfil salvo). */
export interface CorrecaoLocal {
  /** p̄ₖ de cada alvo, em fração da tela. */
  centros: Ponto[];
  /** αₖ por eixo, em fração da tela. */
  alfa: Ponto[];
  /** Escala do núcleo, em fração da tela. */
  ell: number;
}

/** Escala do núcleo gaussiano, em fração da tela (~190 px × 110 px em 1920×1080). */
export const ELL_DA_CORRECAO_LOCAL = 0.1;

/** Ruído relativo (σ²) do resíduo: quanto a correção desconfia de cada alvo. */
export const RUIDO_DA_CORRECAO_LOCAL = 0.1;

/**
 * Resíduo acima disto (fração da tela) não é distorção de canto — é um canto
 * em que a pessoa não olhou para o alvo, ou em que o rosto foi perdido. Esse
 * alvo vira âncora (resíduo zero) em vez de puxar a tela para um lugar errado.
 * 0,25 é ~480 px na horizontal de uma tela de 1920: o triplo do pior viés de
 * canto medido (~180 px).
 */
export const RESIDUO_MAXIMO_DA_CORRECAO = 0.25;

export interface AlvoDaCorrecao {
  /** Posição nominal do alvo, em fração da tela. */
  alvo: Ponto;
  /** Predição média do modelo nas amostras deste alvo, em fração da tela. */
  predicaoMedia: Ponto;
  /** O alvo fica fora da grade interna (é um canto)? */
  foraDaGrade: boolean;
}

export interface ResultadoDoAjuste {
  correcao: CorrecaoLocal | null;
  /** Alvos de canto que ficaram de fora por resíduo implausível. */
  descartados: Ponto[];
}

function nucleo(a: Ponto, b: Ponto, ell: number): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.exp(-(dx * dx + dy * dy) / (2 * ell * ell));
}

/**
 * Ajusta a correção a partir dos alvos da calibração. Devolve `correcao: null`
 * quando não há canto a corrigir (grade só interna, modo rápido) ou quando o
 * sistema não tem solução numérica — nos dois casos o modelo global segue
 * sozinho, que é o comportamento de antes.
 */
export function ajustarCorrecaoLocal(
  alvos: readonly AlvoDaCorrecao[],
  opcoes: { ell?: number; ruido?: number } = {},
): ResultadoDoAjuste {
  const ell = opcoes.ell ?? ELL_DA_CORRECAO_LOCAL;
  const ruido = opcoes.ruido ?? RUIDO_DA_CORRECAO_LOCAL;
  const descartados: Ponto[] = [];
  const validos = alvos.filter((a) =>
    Number.isFinite(a.predicaoMedia.x) && Number.isFinite(a.predicaoMedia.y) &&
    Number.isFinite(a.alvo.x) && Number.isFinite(a.alvo.y));

  const residuos: Ponto[] = validos.map((a) => {
    if (!a.foraDaGrade) return { x: 0, y: 0 };
    const r = { x: a.alvo.x - a.predicaoMedia.x, y: a.alvo.y - a.predicaoMedia.y };
    if (Math.hypot(r.x, r.y) > RESIDUO_MAXIMO_DA_CORRECAO) {
      descartados.push({ ...a.alvo });
      return { x: 0, y: 0 };
    }
    return r;
  });
  if (!residuos.some((r) => r.x !== 0 || r.y !== 0)) return { correcao: null, descartados };
  if (!(ell > 0) || !(ruido >= 0)) return { correcao: null, descartados };

  const centros = validos.map((a) => ({ ...a.predicaoMedia }));
  const K = centros.map((a, j) => centros.map((b, k) => nucleo(a, b, ell) + (j === k ? ruido : 0)));
  let ax: number[];
  let ay: number[];
  try {
    ax = solveLinear(K, residuos.map((r) => r.x));
    ay = solveLinear(K, residuos.map((r) => r.y));
  } catch {
    return { correcao: null, descartados };
  }
  if (![...ax, ...ay].every(Number.isFinite)) return { correcao: null, descartados };
  return {
    correcao: { centros, alfa: ax.map((x, k) => ({ x, y: ay[k] })), ell },
    descartados,
  };
}

/** Aplica a correção a um ponto em fração da tela. Sem correção, devolve o ponto. */
export function aplicarCorrecaoLocal(c: CorrecaoLocal | null | undefined, p: Ponto): Ponto {
  if (!c) return p;
  let dx = 0;
  let dy = 0;
  for (let k = 0; k < c.centros.length; k++) {
    const w = nucleo(p, c.centros[k], c.ell);
    dx += w * c.alfa[k].x;
    dy += w * c.alfa[k].y;
  }
  return { x: p.x + dx, y: p.y + dy };
}

/**
 * Valida uma correção vinda do disco. Perfil adulterado ou de outra versão não
 * pode entrar no `mapGaze`: devolve `null` e o modelo global segue sozinho.
 */
export function correcaoLocalValida(v: unknown): CorrecaoLocal | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Partial<CorrecaoLocal>;
  const pontoOk = (p: unknown) =>
    !!p && typeof p === 'object' &&
    Number.isFinite((p as Ponto).x) && Number.isFinite((p as Ponto).y);
  if (!Array.isArray(c.centros) || !Array.isArray(c.alfa)) return null;
  if (c.centros.length === 0 || c.centros.length !== c.alfa.length) return null;
  if (!c.centros.every(pontoOk) || !c.alfa.every(pontoOk)) return null;
  if (typeof c.ell !== 'number' || !(c.ell > 0) || !Number.isFinite(c.ell)) return null;
  return {
    centros: c.centros.map((p) => ({ x: p.x, y: p.y })),
    alfa: c.alfa.map((p) => ({ x: p.x, y: p.y })),
    ell: c.ell,
  };
}
