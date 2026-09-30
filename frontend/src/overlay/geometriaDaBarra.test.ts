import { describe, it, expect } from 'vitest';
import { ALVO_MINIMO_OVERLAY_PX } from '@tracker/interaction/correcaoPorDwell';
import {
  geometriaDaBarra,
  AFASTAMENTO_DA_BORDA_PX,
  ESPACO_ENTRE_BOTOES_PX,
  LADO_MAXIMO_PX,
  MARGEM_INFERIOR_LIVRE_PX,
  MARGEM_SUPERIOR_LIVRE_PX,
} from './geometriaDaBarra';

// A barra do Modo Computador tem 11 botões.
const N = 11;

/** O lado de antes desta revisão: 52 a 72 px, com 12 px de margem. */
const ladoAntigo = (h: number) => Math.max(52, Math.min(72, Math.floor((h - 24 - (N - 1) * 8) / N)));

describe('geometria da barra do Modo Computador', () => {
  it('num monitor Full HD os botões e o ícone crescem (eram 72 e 26 px) e os cantos ficam livres', () => {
    const g = geometriaDaBarra(1080, N);
    expect(g.ladoPx).toBe(81);
    expect(g.iconePx).toBeGreaterThanOrEqual(36);
    expect(g.fontePx).toBeGreaterThanOrEqual(12);
    // Nada da coluna nos cantos: o alto (botões da barra de título das
    // janelas maximizadas) e o pé (barra de tarefas) continuam alcançáveis.
    expect(g.topoPx).toBe(MARGEM_SUPERIOR_LIVRE_PX);
    expect(g.basePx).toBe(MARGEM_INFERIOR_LIVRE_PX);
    expect(N * g.ladoPx + (N - 1) * ESPACO_ENTRE_BOTOES_PX).toBeLessThanOrEqual(1080 - g.topoPx - g.basePx);
  });

  it('a coluna sai da borda: o centro do botão fica na faixa dos alvos externos da calibração', () => {
    const g = geometriaDaBarra(1080, N);
    expect(g.direitaPx).toBe(AFASTAMENTO_DA_BORDA_PX);
    // Antes o centro ficava a 48 px da borda; os alvos externos da
    // calibração ficam a ~96 px (5 % da largura).
    const centroAteABorda = g.direitaPx + g.ladoPx / 2;
    expect(centroAteABorda).toBeGreaterThanOrEqual(85);
    expect(centroAteABorda).toBeLessThanOrEqual(110);
    expect(g.larguraOcupadaPx).toBe(g.direitaPx + g.ladoPx + ESPACO_ENTRE_BOTOES_PX);
  });

  it('em nenhuma altura de monitor o botão ou o ícone ficam menores que antes', () => {
    for (let h = 560; h <= 2160; h += 8) {
      const g = geometriaDaBarra(h, N);
      expect(g.ladoPx, `altura ${h}`).toBeGreaterThanOrEqual(ladoAntigo(h));
      expect(g.iconePx, `altura ${h}`).toBeGreaterThanOrEqual(26);
    }
  });

  it('monitor baixo não passa do piso que vale como rótulo da correção por dwell', () => {
    expect(geometriaDaBarra(600, N).ladoPx).toBe(ALVO_MINIMO_OVERLAY_PX);
    expect(geometriaDaBarra(768, N).ladoPx).toBeGreaterThanOrEqual(ALVO_MINIMO_OVERLAY_PX);
  });

  it('monitor alto para no teto, com ícone e rótulo presos', () => {
    const g = geometriaDaBarra(2160, N);
    expect(g.ladoPx).toBe(LADO_MAXIMO_PX);
    expect(g.iconePx).toBeLessThanOrEqual(40);
    expect(g.fontePx).toBeLessThanOrEqual(14);
  });
});
