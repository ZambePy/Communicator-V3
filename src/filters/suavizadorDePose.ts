/**
 * Pose da cabeça suavizada (M5 em docs/PESQUISA.md).
 *
 * A compensação de pose leva o ângulo da cabeça direto para o cursor: a 60 cm,
 * cada grau de pitch vale ~38,5 px (D·tan 1°). Com a pose crua, o tremor da
 * matriz facial vira tremor de cursor. Na gravação de 23/09, o pitch tremia
 * 0,138° por alvo (mediana dos desvios-padrão), ~5 px na tela.
 *
 * O filtro é um One Euro por ângulo, em graus: parado ele corta em
 * `CORTE_MIN_HZ`; quando a cabeça gira de verdade, o corte sobe com a
 * velocidade (`BETA`), numa rampa contínua — sem limiar de liga e desliga. Na
 * mesma gravação, estes parâmetros levaram o desvio do pitch por alvo de
 * 0,138° para 0,110° e deixaram a diferença entre cru e suavizado em 0,33° no
 * percentil 99, nas mudanças de postura.
 *
 * O MESMO valor suavizado alimenta a compensação de pose (inferência e rótulos
 * de treino) e a rotação do L2CS para o referencial da cabeça. É isso que faz o
 * ruído de pose se cancelar em primeira ordem entre a feature e a compensação
 * (`referencialDaCabeca.ts`).
 */

import { OneEuroFilter } from '../oneEuroFilter';
import type { PoseDaCabeca } from '../poseDaCabeca';

/** Corte com a cabeça parada, em Hz. */
export const CORTE_MIN_HZ = 1.0;
/**
 * Quanto o corte sobe por °/s de velocidade: numa virada de 30 °/s ele chega a
 * ~3 Hz (atraso de ~50 ms), que é o que se quer para uma mudança de postura.
 */
export const BETA = 0.067;
/** Corte da derivada, o padrão de Casiez et al. (CHI 2012). */
export const CORTE_DERIVADA_HZ = 1.0;

const GRAUS = 180 / Math.PI;

export class SuavizadorDePose {
  private readonly yaw = new OneEuroFilter(30, CORTE_MIN_HZ, BETA, CORTE_DERIVADA_HZ);
  private readonly pitch = new OneEuroFilter(30, CORTE_MIN_HZ, BETA, CORTE_DERIVADA_HZ);
  private readonly roll = new OneEuroFilter(30, CORTE_MIN_HZ, BETA, CORTE_DERIVADA_HZ);

  /** Pose suavizada deste quadro. `agoraMs` é o relógio do quadro. */
  processar(pose: PoseDaCabeca, agoraMs: number): PoseDaCabeca {
    const t = agoraMs / 1000;
    return {
      yaw: this.yaw.filter(pose.yaw * GRAUS, t) / GRAUS,
      pitch: this.pitch.filter(pose.pitch * GRAUS, t) / GRAUS,
      roll: this.roll.filter(pose.roll * GRAUS, t) / GRAUS,
    };
  }

  /** Rosto perdido: a próxima pose recomeça do valor cru, sem arrastar a antiga. */
  reiniciar(): void {
    this.yaw.reset();
    this.pitch.reset();
    this.roll.reset();
  }
}
