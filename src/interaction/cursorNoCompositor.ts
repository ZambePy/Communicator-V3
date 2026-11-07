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
 * A duração era a mesma conta do seguidor: o intervalo mediano entre amostras,
 * para o cursor chegar ao alvo quando a próxima amostra deve chegar. Só que as
 * amostras não chegam na hora: com o MediaPipe na thread principal saem a
 * ~22–28 por segundo (o vídeo de 06/11/2026 e o relatório de 25/10/2026), em
 * intervalos de 33, 50 e 66 ms, e todo intervalo acima
 * da mediana deixava o cursor parado no destino (o "anda, para, anda" do vídeo
 * de 06/11/2026). E havia um segundo defeito, medido no Chromium com 30 ms de
 * trabalho na thread: a transição CSS escrita no fim de um quadro ocupado ganha
 * como início o COMEÇO do quadro, e chega ao compositor quase terminada (no
 * app, o MediaPipe ocupa 24–41 ms antes de cada amostra).
 *
 * Com o M25 (`EXPERIMENT.travessiaContinua`) a travessia dura a mediana mais
 * `MARGEM_DA_TRAVESSIA_MS` (a amostra seguinte encontra o cursor ainda a
 * caminho), e o passo diz de onde partir (`deX`, `deY`: onde a travessia
 * anterior está no instante da amostra). O `GazeContext` anima com
 * `el.animate` e `startTime` explícito a partir desse ponto; a `Overlay` (Modo
 * Computador, cuja janela não roda o MediaPipe) usa só as durações novas, pela
 * transição CSS, e não tem medição própria. Sacada (passo acima de
 * `DISTANCIA_DE_SALTO_PX`) atravessa em ~1 quadro, como antes: o olho já está
 * lá. Sem o M25, vale a conta de antes: um intervalo.
 *
 * Este módulo é puro (sem DOM): só planeja o passo. Quem escreve no DOM é o
 * `GazeContext` (janela do app) e a `Overlay` (Modo Computador).
 */

import { DISTANCIA_DE_SALTO_PX, type AmostraDeCursor } from './seguidorDeCursor';
import { EXPERIMENT } from '../config/experiment';

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
/**
 * M25 (`EXPERIMENT.travessiaContinua`): a travessia dura o intervalo mediano
 * MAIS um quadro de display. A amostra seguinte, que chega a 33, 50 ou 66 ms,
 * encontra o cursor ainda a caminho, em vez de parado no destino.
 */
export const MARGEM_DA_TRAVESSIA_MS = 17;
/** Teto da travessia com o M25: o de antes mais a margem, arredondado. */
export const DURACAO_MAXIMA_CONTINUA_MS = 120;
export interface PassoDoCursor {
  x: number;
  y: number;
  /** Duração da travessia até (x, y), em ms. 0 = aparece no lugar (sem travessia). */
  duracaoMs: number;
  /**
   * M25: de onde a travessia parte — onde a anterior está no instante desta
   * amostra. Quem desenha anima de (deX, deY) até (x, y) começando AGORA
   * (`el.animate` com `startTime` explícito), em vez de deixar o navegador
   * descobrir o ponto de partida no relógio congelado do quadro.
   */
  deX?: number;
  deY?: number;
}

interface Travessia {
  deX: number; deY: number;
  paraX: number; paraY: number;
  inicioMs: number;
  duracaoMs: number;
}

function posicaoNaTravessia(t: Travessia, tMs: number): { x: number; y: number } {
  if (t.duracaoMs <= 0 || tMs >= t.inicioMs + t.duracaoMs) return { x: t.paraX, y: t.paraY };
  const u = Math.max(0, (tMs - t.inicioMs) / t.duracaoMs);
  return { x: t.deX + (t.paraX - t.deX) * u, y: t.deY + (t.paraY - t.deY) * u };
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
  /** M25: a travessia planejada por último, para saber onde o cursor está. */
  private travessia: Travessia | null = null;

  /**
   * O passo a desenhar para uma amostra nova, ou `null` se ela não traz nada
   * (inválida, ou a mesma amostra relida com o mesmo carimbo).
   *
   * A primeira amostra — e a primeira depois de `reiniciar()` — aparece no
   * lugar: o cursor que reaparece não pode atravessar a tela desde onde sumiu.
   */
  passo(a: AmostraDeCursor): PassoDoCursor | null {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.tMs)) return null;
    const continua = EXPERIMENT.travessiaContinua;
    const anterior = this.ultima;
    if (anterior === null) {
      this.ultima = { ...a };
      if (!continua) return { x: a.x, y: a.y, duracaoMs: 0 };
      this.travessia = { deX: a.x, deY: a.y, paraX: a.x, paraY: a.y, inicioMs: a.tMs, duracaoMs: 0 };
      return { x: a.x, y: a.y, duracaoMs: 0, deX: a.x, deY: a.y };
    }
    const dt = a.tMs - anterior.tMs;
    if (dt <= 0) return null;
    this.intervalos.push(dt);
    if (this.intervalos.length > 5) this.intervalos.shift();
    this.ultima = { ...a };

    const intervalo = mediana(this.intervalos);
    const sacada = Math.hypot(a.x - anterior.x, a.y - anterior.y) > DISTANCIA_DE_SALTO_PX;
    if (!continua) {
      const duracao = Math.max(DURACAO_MINIMA_MS, Math.min(DURACAO_MAXIMA_MS, Math.round(intervalo)));
      return { x: a.x, y: a.y, duracaoMs: sacada ? Math.min(DURACAO_DA_SACADA_MS, duracao) : duracao };
    }
    // A sacada continua em ~1 quadro: voar até lá em 48 ms (testado) deixava o
    // cursor ~57 ms mais atrasado para assentar depois de uma sacada grande, no
    // simulador do compositor, sem ganho que se meça nos quadros parados.
    const duracao = sacada
      ? DURACAO_DA_SACADA_MS
      : Math.max(DURACAO_MINIMA_MS, Math.min(DURACAO_MAXIMA_CONTINUA_MS, Math.round(intervalo) + MARGEM_DA_TRAVESSIA_MS));
    const de = this.travessia ? posicaoNaTravessia(this.travessia, a.tMs) : { x: anterior.x, y: anterior.y };
    this.travessia = { deX: de.x, deY: de.y, paraX: a.x, paraY: a.y, inicioMs: a.tMs, duracaoMs: duracao };
    return { x: a.x, y: a.y, duracaoMs: duracao, deX: de.x, deY: de.y };
  }

  /** Idade da amostra mais recente, em ms (`null` sem amostra). */
  idadeMs(agoraMs: number): number | null {
    return this.ultima === null ? null : Math.max(0, agoraMs - this.ultima.tMs);
  }

  /** Esquece a posição: a próxima amostra aparece no lugar. */
  reiniciar(): void {
    this.ultima = null;
    this.intervalos = [];
    this.travessia = null;
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
