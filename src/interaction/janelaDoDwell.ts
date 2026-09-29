/**
 * Janela estável de um dwell, em malha aberta (M15).
 *
 * Guarda, por alguns segundos, a predição do olhar ANTES da correção por dwell
 * e antes do clamp (`calibration.getUltimaPredicaoSemCorrecao`), e devolve a
 * mediana e a dispersão dela numa janela de tempo. No disparo de um dwell, a
 * janela é [entrada + 200 ms, disparo − 50 ms]:
 *
 *  - os primeiros 200 ms depois de o cursor entrar no botão são assentamento:
 *    o cursor filtrado ainda está trocando de estimativa e pode haver sacada
 *    corretiva — em quem tem mais de 65 anos a própria latência de sacada
 *    passa de 300 ms (312,5 ± 62,7 ms, Noiret et al. 2017);
 *  - os últimos 50 ms são o olhar já saindo: no PACE o melhor alinhamento
 *    entre olhar e ação veio ANTES do evento (de −0,01 a −0,43 s conforme a
 *    ação; Huang et al. 2016).
 *
 * Os dois cortes são a proposta da pesquisa D (docs/PESQUISA.md §3.5), a
 * conferir com os logs da sessão de 30 min do roteiro.
 *
 * Mediana e dispersão pelo desvio absoluto mediano (×1,4826): uma intrusão
 * sacádica no meio do dwell — comum em ELA — não puxa o rótulo.
 */

import { mediana } from '../estatistica';

/** Descarte do começo da janela: a chegada do olhar ao botão. */
export const CHEGADA_MS = 200;
/** Descarte do fim: o olhar já saindo. */
export const SAIDA_MS = 50;
/** Quanto do passado fica guardado (cobre dwells de até ~4 s). */
export const HISTORICO_MS = 5000;
/** Menos que isto na janela não é medida. */
export const AMOSTRAS_MINIMAS = 8;

export interface AmostraDaJanela {
  t: number;
  x: number;
  y: number;
  /** A predição desta amostra estava fora da tela (o clamp a comprimiu). */
  saturada: boolean;
}

export interface MedidaDaJanela {
  mediana: { x: number; y: number };
  /** Desvio robusto por eixo (1,4826·MAD), em px. */
  dispersao: { x: number; y: number };
  n: number;
  /** Alguma amostra da janela estava saturada. */
  saturada: boolean;
}


export class HistoricoDoOlhar {
  private amostras: AmostraDaJanela[] = [];

  registrar(a: AmostraDaJanela): void {
    if (![a.t, a.x, a.y].every(Number.isFinite)) return;
    const ultima = this.amostras[this.amostras.length - 1];
    // A mesma amostra pode chegar duas vezes (quem assina recebe o quadro e o
    // repinta): o carimbo decide.
    if (ultima && a.t <= ultima.t) return;
    this.amostras.push(a);
    const corte = a.t - HISTORICO_MS;
    let i = 0;
    while (i < this.amostras.length && this.amostras[i].t < corte) i++;
    if (i > 0) this.amostras.splice(0, i);
  }

  /** Mediana e dispersão em [entrada + CHEGADA_MS, disparo − SAIDA_MS]. */
  medir(entradaMs: number, disparoMs: number): MedidaDaJanela | null {
    const ini = entradaMs + CHEGADA_MS;
    const fim = disparoMs - SAIDA_MS;
    const janela = this.amostras.filter((a) => a.t >= ini && a.t <= fim);
    if (janela.length < AMOSTRAS_MINIMAS) return null;
    const xs = janela.map((a) => a.x);
    const ys = janela.map((a) => a.y);
    const mx = mediana(xs);
    const my = mediana(ys);
    return {
      mediana: { x: mx, y: my },
      dispersao: {
        x: 1.4826 * mediana(xs.map((v) => Math.abs(v - mx))),
        y: 1.4826 * mediana(ys.map((v) => Math.abs(v - my))),
      },
      n: janela.length,
      saturada: janela.some((a) => a.saturada),
    };
  }

  limpar(): void {
    this.amostras = [];
  }
}
