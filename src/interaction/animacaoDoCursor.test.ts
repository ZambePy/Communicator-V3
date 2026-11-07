import { describe, expect, it } from 'vitest';
import { animarTransform, pararAnimacao, podeAnimar } from './animacaoDoCursor';

// M25: o cursor anda por animação web (`el.animate`) que parte do ponto
// calculado, com `startTime` explícito. A transição CSS escrita no fim de um
// quadro ocupado começava no COMEÇO do quadro (medido no Chromium em
// 06/11/2026, com 30 ms de trabalho na thread: o `startTime` 30–46 ms antes da
// escrita) e chegava ao compositor quase terminada; no app, o MediaPipe ocupa
// 24–41 ms antes de cada amostra (gravação de 23/09/2026).
//
// O jsdom não tem `el.animate`: o elemento de teste registra o que o
// navegador receberia. É a fronteira com a API do navegador, e o contrato é
// exatamente o que o compositor recebe — quadros-chave, duração, início.

interface AnimacaoFalsa {
  quadros: Keyframe[];
  opcoes: KeyframeAnimationOptions;
  startTime: number | null;
  cancelada: boolean;
  cancel(): void;
}

function elementoFalso() {
  const animacoes: AnimacaoFalsa[] = [];
  const el = {
    animate(quadros: Keyframe[], opcoes: KeyframeAnimationOptions) {
      const a: AnimacaoFalsa = { quadros, opcoes, startTime: null, cancelada: false, cancel() { this.cancelada = true; } };
      animacoes.push(a);
      return a as unknown as Animation;
    },
  } as unknown as HTMLElement;
  return { el, animacoes };
}

describe('animarTransform', () => {
  it('anima de `de` até `para`, linear, com início explícito e sem voltar ao valor de base', () => {
    const { el, animacoes } = elementoFalso();
    expect(animarTransform(el, 'translate3d(0px, 0px, 0)', 'translate3d(50px, 0px, 0)', 50, 1234.5)).toBe(true);
    expect(animacoes).toHaveLength(1);
    const a = animacoes[0];
    expect(a.quadros).toEqual([{ transform: 'translate3d(0px, 0px, 0)' }, { transform: 'translate3d(50px, 0px, 0)' }]);
    expect(a.opcoes).toMatchObject({ duration: 50, easing: 'linear', fill: 'both' });
    expect(a.startTime).toBe(1234.5);
  });

  it('a animação nova cancela a anterior do mesmo elemento', () => {
    const { el, animacoes } = elementoFalso();
    animarTransform(el, 'a', 'b', 50, 0);
    animarTransform(el, 'b', 'c', 50, 40);
    expect(animacoes[0].cancelada).toBe(true);
    expect(animacoes[1].cancelada).toBe(false);
  });

  it('duração zero só cancela: o cursor aparece no valor de base', () => {
    const { el, animacoes } = elementoFalso();
    animarTransform(el, 'a', 'b', 50, 0);
    expect(animarTransform(el, 'c', 'c', 0, 90)).toBe(true);
    expect(animacoes).toHaveLength(1);
    expect(animacoes[0].cancelada).toBe(true);
  });

  it('pararAnimacao cancela a que estiver valendo, e não quebra sem nenhuma', () => {
    const { el, animacoes } = elementoFalso();
    pararAnimacao(el);
    animarTransform(el, 'a', 'b', 50, 0);
    pararAnimacao(el);
    expect(animacoes[0].cancelada).toBe(true);
  });

  it('sem `el.animate` (jsdom, navegador antigo) avisa para seguir pela transição CSS', () => {
    const el = {} as Element;
    expect(podeAnimar(el)).toBe(false);
    expect(animarTransform(el, 'a', 'b', 50, 0)).toBe(false);
    expect(podeAnimar(elementoFalso().el)).toBe(true);
  });
});
