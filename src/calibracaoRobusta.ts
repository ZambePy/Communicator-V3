/**
 * Calibração robusta (M6 em docs/PESQUISA.md).
 *
 * O treino usa cada quadro coletado como uma linha do Ridge, sem descartar
 * nenhum: os portões de qualidade foram removidos e só sobraram pesos de
 * imagem. Uma piscada mal detectada, uma intrusão sacádica (comum em ELA:
 * square-wave jerks em 53 % dos pacientes, Guo et al. 2022) ou um landmark que
 * escorregou entram com peso cheio e puxam o alvo inteiro. Duas camadas tratam
 * isso, as duas contínuas:
 *
 *  1. **Quadro.** Dentro de cada alvo, cada feature ganha mediana e MAD. O peso
 *     do quadro é 1 até 3·1,4826·MAD da mediana e cai suavemente até 0 em
 *     4·1,4826·MAD. O 1,4826 torna o MAD consistente para σ sob normalidade;
 *     3 é o corte "muito conservador" de Leys et al. (2013) — com 7 features
 *     testadas por quadro, o corte de 2,5 marcaria por acaso 8 % dos quadros
 *     bons, o de 3 só 2 %.
 *  2. **Alvo.** Huber entre os alvos, resolvido por mínimos quadrados
 *     reponderados em `calibration.ts`: w = min(1, k/|u|), com k = 1,345 (95 %
 *     de eficiência sob normalidade; MASS `rlm`, statsmodels, MATLAB
 *     `robustfit`) e u o resíduo do alvo estudentizado pela alavanca.
 *
 * A penalidade λ·m·Σ_W e a validação cruzada deixando um alvo de fora ficam
 * como estão: o Huber só multiplica pesos.
 */

import { mediana, passoSuave } from './estatistica';

/** Constante de Huber para 95 % de eficiência sob normalidade. */
export const K_HUBER = 1.345;
/** 1/Φ⁻¹(0,75): faz o MAD estimar σ quando o dado é normal. */
export const FATOR_MAD = 1.4826;
/** Até aqui (em unidades de 1,4826·MAD) o quadro pesa 1. */
export const CORTE_INICIO = 3;
/** A partir daqui o quadro pesa 0. Entre os dois, rampa suave. */
export const CORTE_FIM = 4;


/**
 * Peso de cada quadro pelo desvio robusto dentro do seu alvo.
 *
 * Uma feature constante dentro de um alvo (o ângulo do L2CS reaproveitado
 * entre inferências, por exemplo) tem MAD zero, e qualquer desvio viraria
 * infinito. Por isso a escala de cada feature tem piso de 10 % da escala
 * robusta da mesma feature na sessão inteira.
 */
export function pesosRobustosPorQuadro(features: readonly number[][], grupos: readonly string[]): number[] {
  const n = features.length;
  const pesos = new Array<number>(n).fill(1);
  if (n === 0) return pesos;
  const d = features[0].length;

  const pisoPorFeature: number[] = [];
  for (let j = 0; j < d; j++) {
    const col = features.map((f) => f[j]).filter(Number.isFinite);
    const med = mediana(col);
    const escala = FATOR_MAD * mediana(col.map((v) => Math.abs(v - med)));
    pisoPorFeature.push(Number.isFinite(escala) && escala > 0 ? 0.1 * escala : 1e-12);
  }

  const porGrupo = new Map<string, number[]>();
  grupos.forEach((g, i) => {
    const l = porGrupo.get(g);
    if (l) l.push(i);
    else porGrupo.set(g, [i]);
  });

  for (const indices of porGrupo.values()) {
    // Com menos de 5 quadros a mediana e o MAD não dizem nada: o alvo fica como está.
    if (indices.length < 5) continue;
    for (let j = 0; j < d; j++) {
      const col = indices.map((i) => features[i][j]);
      const med = mediana(col);
      const escala = Math.max(pisoPorFeature[j], FATOR_MAD * mediana(col.map((v) => Math.abs(v - med))));
      for (const i of indices) {
        const v = features[i][j];
        const z = Number.isFinite(v) ? Math.abs(v - med) / escala : Number.POSITIVE_INFINITY;
        const w = 1 - passoSuave((z - CORTE_INICIO) / (CORTE_FIM - CORTE_INICIO));
        if (w < pesos[i]) pesos[i] = w;
      }
    }
  }
  return pesos;
}

/** Peso de Huber de um resíduo estudentizado. */
export function pesoDeHuber(u: number, k: number = K_HUBER): number {
  const a = Math.abs(u);
  if (!Number.isFinite(a)) return 0;
  return a <= k ? 1 : k / a;
}

/** Escala robusta de resíduos: 1,4826·MAD em torno de zero, com piso. */
export function escalaRobusta(residuos: readonly number[], piso: number): number {
  const finitos = residuos.filter(Number.isFinite).map(Math.abs);
  if (finitos.length === 0) return piso;
  return Math.max(piso, FATOR_MAD * mediana(finitos));
}

/** O que o ajuste robusto fez, para o diagnóstico da calibração e o relatório. */
export interface DiagnosticoRobusto {
  /** Fração dos quadros coletados que saiu do treino (peso zero). */
  fracaoDescartada: number;
  /** Peso médio dos quadros que ficaram. */
  pesoMedioDosQuadros: number;
  /** Peso de Huber e resíduo estudentizado de cada alvo, na ordem de coleta. */
  alvos: { x: number; y: number; peso: number; u: number }[];
  /** Iterações do IRLS na última rodada e se convergiu. */
  iteracoes: number;
  convergiu: boolean;
}
