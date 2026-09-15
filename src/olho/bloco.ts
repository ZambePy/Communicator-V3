// Bloco de features do ramo ocular — duas dimensões por olho.
//
// A rede ocular devolve (yaw, pitch) do olho no referencial do recorte
// canônico, mais uma confiança. Aqui isso vira o que o Ridge consome: a
// tangente dos dois ângulos, pela mesma razão do bloco L2CS (x_tela ≈ d·tan).
//
// O gate é o mesmo do bloco facial: ângulo implausível ou confiança baixa
// zera o bloco, e o motivo fica registrado. Zerar em vez de descartar mantém
// a dimensão do vetor estável; quem tira o peso da amostra é a S1.
//
// Só DUAS dimensões, e não quatro (centro da pupila fora): a lição medida em
// `extractor.ts` — "9 alvos não determinam 45 parâmetros" — vale aqui. Com o
// bloco facial (2) + íris (4) + este (2), o vetor fica em 8 dims por olho, que
// é o teto que o relatório do V2 se deu antes de a S8 multiplicar as amostras.

import { isGazePlausible } from '../l2cs/block';

export const BLOCO_OCULAR_DIM = 2;

/** Mesmo limiar do bloco facial, pela mesma razão: abaixo disto a softmax
 *  está difusa e o ângulo é arbitrário. */
export const CONFIANCA_MIN_OCULAR = 0.15;

const CLAMP_RAD = Math.PI / 4;

export interface SaidaDoRamoOcular {
  yaw: number;
  pitch: number;
  /** `1 − H/H_max` da softmax do pior eixo. */
  confianca: number;
  valid: boolean;
  timestamp: number;
}

export type MotivoDoBlocoOcular = 'stale' | 'implausivel' | 'confianca' | null;

export interface BlocoOcular {
  valores: number[];
  motivo: MotivoDoBlocoOcular;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function buildBlocoOcular(saida: SaidaDoRamoOcular | null | undefined): BlocoOcular {
  const zeros = () => Array.from({ length: BLOCO_OCULAR_DIM }, () => 0);
  if (!saida || !saida.valid) return { valores: zeros(), motivo: 'stale' };
  if (!isGazePlausible(saida.yaw, saida.pitch)) return { valores: zeros(), motivo: 'implausivel' };
  if (!(saida.confianca >= CONFIANCA_MIN_OCULAR)) return { valores: zeros(), motivo: 'confianca' };
  const ty = Math.tan(clamp(saida.yaw, -CLAMP_RAD, CLAMP_RAD));
  const tp = Math.tan(clamp(saida.pitch, -CLAMP_RAD, CLAMP_RAD));
  return { valores: [ty, tp], motivo: null };
}
