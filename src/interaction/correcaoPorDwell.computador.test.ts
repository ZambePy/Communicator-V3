import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  ALVO_MINIMO_OVERLAY_PX,
  aprenderComSelecao,
  definirCorrecaoLigada,
  definirSessaoDoComputador,
  deveAprender,
  estadoDaCorrecao,
  origemAceita,
  reiniciarCorrecao,
  sessaoDoComputador,
} from './correcaoPorDwell';

// -----------------------------------------------------------------------------
// Modo Computador: a correção por dwell só aprende de alvos GRANDES da própria
// barra do IrisFlow (clique esquerdo/direito/rolar). Nunca de um ícone de
// 32 px nem da barra do Windows: um dwell concluído num alvo pequeno não diz
// que a pessoa olhava o centro dele, e aprender dali ensina o erro.
// -----------------------------------------------------------------------------

const viewport = { largura: 1920, altura: 1080 };
const contextoBom = {
  alvoIsolado: true, degradado: false, apresentacao: false, emergencia: false, alvoEspecial: false,
};
const selecao = { centroDoAlvo: { x: 1000, y: 500 }, olhar: { x: 950, y: 500 }, agoraMs: 1000, viewport };

describe('origemAceita', () => {
  it('externo nunca; overlay só com alvo ≥ ALVO_MINIMO_OVERLAY_PX; app sempre', () => {
    expect(origemAceita('externo', 400)).toBe(false);
    expect(origemAceita('overlay', ALVO_MINIMO_OVERLAY_PX - 1)).toBe(false);
    expect(origemAceita('overlay', ALVO_MINIMO_OVERLAY_PX)).toBe(true);
    expect(origemAceita('overlay', undefined)).toBe(false);
    expect(origemAceita('app')).toBe(true);
  });
});

describe('deveAprender com origem', () => {
  it('ícone de 32 px do Windows não ensina, mesmo isolado', () => {
    expect(deveAprender({ ...contextoBom, origem: 'externo', tamanhoDoAlvoPx: 32 })).toBe(false);
    expect(deveAprender({ ...contextoBom, origem: 'overlay', tamanhoDoAlvoPx: 32 })).toBe(false);
  });

  it('botão da barra da sobreposição ensina a partir do menor lado que ela desenha (52 px)', () => {
    expect(deveAprender({ ...contextoBom, origem: 'overlay', tamanhoDoAlvoPx: 52 })).toBe(true);
    expect(deveAprender({ ...contextoBom, origem: 'overlay', tamanhoDoAlvoPx: 51 })).toBe(false);
    expect(deveAprender({ ...contextoBom, origem: 'overlay', tamanhoDoAlvoPx: 96 })).toBe(true);
  });
});

describe('aprenderComSelecao durante a sessão do Computador', () => {
  beforeEach(() => {
    reiniciarCorrecao();
    definirCorrecaoLigada(true);
    definirSessaoDoComputador(true);
  });
  afterEach(() => definirSessaoDoComputador(false));

  it('a sessão fica registrada', () => {
    expect(sessaoDoComputador()).toBe(true);
  });

  it('seleção externa NÃO alimenta a correção', () => {
    expect(aprenderComSelecao({ ...selecao, origem: 'externo', tamanhoDoAlvoPx: 300 })).toBe(false);
    expect(estadoDaCorrecao().selecoes).toBe(0);
  });

  it('seleção "do app" (janela oculta) NÃO alimenta a correção', () => {
    expect(aprenderComSelecao(selecao)).toBe(false);
    expect(estadoDaCorrecao().selecoes).toBe(0);
  });

  it('botão pequeno da sobreposição NÃO alimenta; botão de 96 px alimenta', () => {
    expect(aprenderComSelecao({ ...selecao, origem: 'overlay', tamanhoDoAlvoPx: 40 })).toBe(false);
    expect(estadoDaCorrecao().selecoes).toBe(0);
    expect(aprenderComSelecao({ ...selecao, origem: 'overlay', tamanhoDoAlvoPx: 96 })).toBe(true);
    expect(estadoDaCorrecao().selecoes).toBe(1);
  });

  it('fora da sessão, a seleção do app volta a valer', () => {
    definirSessaoDoComputador(false);
    expect(aprenderComSelecao(selecao)).toBe(true);
  });
});
