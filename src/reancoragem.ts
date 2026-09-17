/**
 * Acumulador da REANCORAGEM: a pessoa olha o centro da tela por ~2 s e o
 * sistema mede onde ela está — distância câmera→rosto, pose e centro facial —
 * para recomeçar as referências geométricas sem retreinar o Ridge.
 *
 * Só amostras VÁLIDAS entram (rosto presente, sem piscada, L2CS plausível,
 * sem contraluz forte): é o mesmo critério do quadro válido da referência
 * lenta, e pela mesma razão — um quadro inválido não descreve a postura.
 *
 * Distância pela MEDIANA (resiste a um quadro com o rosto parcialmente
 * ocluído); pose e centro pela MÉDIA, que é o centróide contra o qual as
 * compensações medem — a mesma escolha de `poseDeReferencia`.
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
  /** Quadros válidos que entraram. */
  amostras: number;
  /** `amostras >= AMOSTRAS_MINIMAS`. */
  suficiente: boolean;
}

export class AcumuladorDeReancoragem {
  private distancias: number[] = [];
  private poses: Pose[] = [];
  private centros: CentroFacial[] = [];
  private n = 0;

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
    return {
      distanciaCm: mediana(this.distancias),
      pose: poseDeReferencia(this.poses),
      centro: centroDeReferencia(this.centros),
      amostras: this.n,
      suficiente: this.n >= AMOSTRAS_MINIMAS,
    };
  }
}

function mediana(v: readonly number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
