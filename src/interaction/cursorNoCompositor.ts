/**
 * Cursor movido pelo COMPOSITOR, não pelo laço de `requestAnimationFrame`.
 *
 * ## Por que o seguidor não bastou
 *
 * O `SeguidorDeCursor` separou a taxa de render da taxa de inferência: o
 * callback do engine só alimenta o alvo, e um laço de rAF interpola a posição
 * a cada quadro de display. A conta pressupõe que o rAF rode a 60 Hz — e ele
 * roda na MESMA thread que o MediaPipe. Na gravação de 23/09 cada quadro de
 * câmera ocupava a thread principal por 24 ms na mediana e 41 ms no p90
 * (`emitTs − captureTs`), com a câmera entregando um quadro a cada 33 ms. Com
 * a thread ocupada 70–100 % do tempo, o rAF perde quadros de display: na
 * gravação de 30/09 o cursor andava em degraus de 10–20 px a ~15 Hz, parado no
 * quadro seguinte — o "travando em diversos momentos". A interpolação existia,
 * mas não tinha quadros onde acontecer.
 *
 * ## O que muda
 *
 * `transform` com `transition` é animado pela thread do compositor, que não
 * espera o JavaScript: a cada amostra o callback escreve UMA vez o destino e a
 * duração da travessia, e o compositor desenha os quadros intermediários a
 * 60 Hz mesmo com a thread principal presa no MediaPipe. Se a amostra seguinte
 * chega antes do fim, a transição nova parte de onde o cursor está — o
 * movimento continua sem degrau.
 *
 * A duração é a mesma conta do seguidor: o intervalo mediano entre amostras,
 * para o cursor chegar ao alvo quando a próxima amostra deve chegar. Mesmo
 * custo em latência (meio intervalo, em média), agora sem os degraus. Sacada
 * (passo acima de `DISTANCIA_DE_SALTO_PX`) atravessa em ~1 quadro: o olho já
 * está lá.
 *
 * Este módulo é puro (sem DOM): só planeja o passo. Quem escreve no DOM é o
 * `GazeContext` (janela do app) e a `Overlay` (Modo Computador).
 */

import { DISTANCIA_DE_SALTO_PX, type AmostraDeCursor } from './seguidorDeCursor';

/** Menor travessia planejada: um quadro de display a 60 Hz. */
export const DURACAO_MINIMA_MS = 16;
/**
 * Maior travessia planejada. Câmera lenta (15 quadros/s ou menos) não vira
 * arrasto: acima disto o cursor chega antes e espera a amostra seguinte.
 */
export const DURACAO_MAXIMA_MS = 100;
/** Travessia de uma sacada: o olho já está no destino. */
export const DURACAO_DA_SACADA_MS = 24;
/** Intervalo assumido antes de haver medição (≈30 Hz). */
const INTERVALO_INICIAL_MS = 33;

export interface PassoDoCursor {
  x: number;
  y: number;
  /** Duração da travessia até (x, y), em ms. 0 = aparece no lugar (sem travessia). */
  duracaoMs: number;
}

/** Mediana de até 5 intervalos — robusta a um quadro perdido isolado. */
function mediana(v: readonly number[]): number {
  if (v.length === 0) return INTERVALO_INICIAL_MS;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
}

export class PlanejadorDoCursor {
  private ultima: AmostraDeCursor | null = null;
  private intervalos: number[] = [];

  /**
   * O passo a desenhar para uma amostra nova, ou `null` se ela não traz nada
   * (inválida, ou a mesma amostra relida com o mesmo carimbo).
   *
   * A primeira amostra — e a primeira depois de `reiniciar()` — aparece no
   * lugar: o cursor que reaparece não pode atravessar a tela desde onde sumiu.
   */
  passo(a: AmostraDeCursor): PassoDoCursor | null {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.tMs)) return null;
    const anterior = this.ultima;
    if (anterior === null) {
      this.ultima = { ...a };
      return { x: a.x, y: a.y, duracaoMs: 0 };
    }
    const dt = a.tMs - anterior.tMs;
    if (dt <= 0) return null;
    this.intervalos.push(dt);
    if (this.intervalos.length > 5) this.intervalos.shift();
    this.ultima = { ...a };

    const intervalo = Math.round(mediana(this.intervalos));
    const duracao = Math.max(DURACAO_MINIMA_MS, Math.min(DURACAO_MAXIMA_MS, intervalo));
    const sacada = Math.hypot(a.x - anterior.x, a.y - anterior.y) > DISTANCIA_DE_SALTO_PX;
    return { x: a.x, y: a.y, duracaoMs: sacada ? Math.min(DURACAO_DA_SACADA_MS, duracao) : duracao };
  }

  /** Idade da amostra mais recente, em ms (`null` sem amostra). */
  idadeMs(agoraMs: number): number | null {
    return this.ultima === null ? null : Math.max(0, agoraMs - this.ultima.tMs);
  }

  /** Esquece a posição: a próxima amostra aparece no lugar. */
  reiniciar(): void {
    this.ultima = null;
    this.intervalos = [];
  }
}

/**
 * Valor da propriedade `transition` para uma travessia de `duracaoMs`.
 * `demais` são as outras transições do elemento (a opacidade do cursor), que
 * precisam continuar na lista — `transition` é uma propriedade só.
 */
export function transicaoDoPasso(duracaoMs: number, demais?: string): string {
  const movimento = `transform ${Math.max(0, Math.round(duracaoMs))}ms linear`;
  return demais ? `${movimento}, ${demais}` : movimento;
}
