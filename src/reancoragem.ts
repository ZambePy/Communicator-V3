/**
 * Acumulador do REAJUSTE RÁPIDO: a pessoa olha o centro da tela por ~2 s.
 *
 * O que vale é a PREDIÇÃO: a mediana de onde o modelo põe o olhar (antes da
 * correção por dwell) contra o centro da tela é o viés corrente, e vira a
 * correção de deriva (`corrigirDerivaNoCentro`). Distância, pose e centro
 * facial continuam sendo colhidos, mas só para diagnóstico: desde 23/09/2026 o
 * reajuste NÃO troca mais as referências geométricas da calibração. Trocá-las
 * declarava "a postura de agora é a da calibração" e jogava fora uma
 * compensação de pose que, medida numa gravação real, estava certa — a mesma
 * falha da referência lenta, feita de uma vez (ver `config/experiment.ts`).
 *
 * Só amostras VÁLIDAS entram (rosto presente, sem piscada, L2CS plausível,
 * sem contraluz forte).
 *
 * Distância e predição pela MEDIANA (resistem a um quadro ruim); pose e centro
 * pela MÉDIA, a mesma escolha de `poseDeReferencia`.
 */

import type { Pose } from './poseCompensation';
import type { CentroFacial } from './translationCompensation';
import { poseDeReferencia } from './poseCompensation';
import { centroDeReferencia } from './translationCompensation';

export const DURACAO_PADRAO_MS = 2000;
/** Abaixo disto a reancoragem não vale: ~10 quadros a 30 Hz. */
export const AMOSTRAS_MINIMAS = 10;

export interface AmostraDeReancoragem {
  distanciaCm: number | null;
  pose: Pose | null;
  centro: CentroFacial | null;
}

export interface ResultadoDaReancoragem {
  /** Mediana das distâncias válidas; `null` sem FOV calibrado. */
  distanciaCm: number | null;
  pose: Pose | null;
  centro: CentroFacial | null;
  /** Mediana, por eixo, da predição antes da correção por dwell (fração da tela). */
  predicao: { x: number; y: number } | null;
  /** Quadros válidos que entraram. */
  amostras: number;
  /** `amostras >= AMOSTRAS_MINIMAS` e há predição: dá para corrigir a deriva. */
  suficiente: boolean;
}

export class AcumuladorDeReancoragem {
  private distancias: number[] = [];
  private poses: Pose[] = [];
  private centros: CentroFacial[] = [];
  private predicoesX: number[] = [];
  private predicoesY: number[] = [];
  private n = 0;

  /** Predição do quadro (fração da tela), antes da correção por dwell. */
  adicionarPredicao(p: { x: number; y: number } | null | undefined): void {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    this.predicoesX.push(p.x);
    this.predicoesY.push(p.y);
  }

  adicionar(a: AmostraDeReancoragem): void {
    if (a.distanciaCm !== null && Number.isFinite(a.distanciaCm) && a.distanciaCm > 0) {
      this.distancias.push(a.distanciaCm);
    }
    if (a.pose) this.poses.push(a.pose);
    if (a.centro) this.centros.push(a.centro);
    this.n++;
  }

  get amostras(): number {
    return this.n;
  }

  resultado(): ResultadoDaReancoragem {
    const px = mediana(this.predicoesX);
    const py = mediana(this.predicoesY);
    const predicao = px !== null && py !== null ? { x: px, y: py } : null;
    return {
      distanciaCm: mediana(this.distancias),
      pose: poseDeReferencia(this.poses),
      centro: centroDeReferencia(this.centros),
      predicao,
      amostras: this.n,
      suficiente: this.n >= AMOSTRAS_MINIMAS && this.predicoesX.length >= AMOSTRAS_MINIMAS,
    };
  }
}

function mediana(v: readonly number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
