import { useLayoutEffect, useState, type RefObject } from 'react';
import { alvoMinimoPx } from '../../../design/gazeMetrics';

// -----------------------------------------------------------------------------
// As colunas da tela do quarto (`/hospital`).
//
// A grade tem dez botões e era sempre 5 × 2. A ALTURA de cada célula já tinha o
// piso de 5° (`alvoMinimoPx()`, na própria `GazeGrid`); a LARGURA não: é o que
// sobra da janela dividido por cinco, e numa janela de 1280 px dá 196 px, numa
// de 1024 px, 147 px. Quem usa o olhar não alcança um alvo menor que o piso, e o
// piso ainda cresce com a geometria do usuário e com a acurácia medida (até
// ~6,6°, uns 260 px). Daí o número de colunas sair da largura de que a grade
// dispõe, como na tela da dor (`colunasDasFaixas`).
//
// A ordem dos botões não muda com o número de colunas: a grade preenche linha
// por linha, e a varredura (e a leitura do olhar) segue a mesma ordem.
// -----------------------------------------------------------------------------

/** O desenho de sempre, e o máximo: cinco colunas (duas linhas de cinco botões). */
export const COLUNAS_DO_QUARTO = 5;

/** Espaço entre os alvos: 1,5° na geometria de referência (o padrão da `GazeGrid`). */
export const ESPACO_DO_QUARTO = 59;

/**
 * A barra de rolagem do app (`::-webkit-scrollbar`, em `index.css`) tira esta
 * largura da grade quando as linhas não cabem na altura e ela passa a rolar.
 */
export const BARRA_DE_ROLAGEM_PX = 6;

export interface MedidaDaGrade {
  /** `clientWidth` da área da grade, em px (0 = ainda não medida). */
  largura: number;
  /** `clientHeight` da área da grade, em px (0 = ainda não medida). */
  altura: number;
  /** O alvo mínimo (`alvoMinimoPx()`) com que a medida foi tirada. */
  piso: number;
}

/**
 * Quantas colunas a grade do quarto usa: o MAIOR número, até cinco, em que cada
 * célula ainda tem o piso na largura.
 *
 * - A altura não limita as colunas (a grade mantém o piso e rola o que não
 *   couber), mas decide se há barra de rolagem: se as linhas cabem no piso, não
 *   há barra; se não cabem, ela tira `BARRA_DE_ROLAGEM_PX` da largura. A conta
 *   é a da `GazeGrid` (`rolarSoSeNaoCouber`, com 1 px de folga para o
 *   arredondamento). Sem a altura medida, vale o lado seguro: com barra.
 * - `clientWidth` vem em inteiro: a célula pode ficar até 0,5 px abaixo do piso
 *   por arredondamento, o que o olhar não distingue.
 * - Sem largura ou sem piso válidos (a primeira volta, antes de medir) fica o
 *   desenho de sempre.
 */
export function colunasDoQuarto({ largura, altura, piso, espaco = ESPACO_DO_QUARTO, alvos }: MedidaDaGrade & {
  /** Espaço entre os alvos, em px (o mesmo que a `GazeGrid` recebe). */
  espaco?: number;
  /** Quantos botões a grade tem. */
  alvos: number;
}): number {
  const maximo = Math.max(1, Math.min(COLUNAS_DO_QUARTO, Math.floor(alvos)));
  if (!Number.isFinite(largura) || !(largura > 0) || !Number.isFinite(piso) || !(piso > 0)) return maximo;
  const folga = Math.max(0, espaco);
  for (let colunas = maximo; colunas > 1; colunas--) {
    const linhas = Math.ceil(alvos / colunas);
    const cabe = altura > 0 && linhas * piso + (linhas - 1) * folga <= altura + 1;
    const util = largura - (cabe ? 0 : BARRA_DE_ROLAGEM_PX) - (colunas - 1) * folga;
    if (util / colunas >= piso) return colunas;
  }
  return 1;
}

/**
 * A largura e a altura da área da grade e o piso do alvo, sempre em dia: medidas
 * antes de pintar e de novo quando a área muda de tamanho (a janela
 * redimensionou) ou quando o piso muda sem a janela mexer (a calibração em uso
 * ou a acurácia medida chegam depois que a tela já abriu e reescrevem
 * `--gaze-target-min` no `<html>`).
 *
 * O piso é lido junto com o tamanho, no mesmo estado: as colunas nunca saem de
 * uma largura de um momento e de um piso de outro.
 */
export function useMedidaDaGrade(ref: RefObject<HTMLElement | null>): MedidaDaGrade {
  const [medida, setMedida] = useState<MedidaDaGrade>(() => ({ largura: 0, altura: 0, piso: alvoMinimoPx() }));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const largura = el.clientWidth;
      const altura = el.clientHeight;
      const piso = alvoMinimoPx();
      setMedida((m) => (m.largura === largura && m.altura === altura && m.piso === piso ? m : { largura, altura, piso }));
    };
    medir();
    const aoMudarOTamanho = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    aoMudarOTamanho?.observe(el);
    // O piso mora numa propriedade CSS do <html> (`injetarTokens`): quem a
    // reescreve mexe no atributo `style` dele.
    const aoMudarOPiso = typeof MutationObserver === 'undefined' ? null : new MutationObserver(medir);
    aoMudarOPiso?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => {
      aoMudarOTamanho?.disconnect();
      aoMudarOPiso?.disconnect();
    };
  }, [ref]);
  return medida;
}
