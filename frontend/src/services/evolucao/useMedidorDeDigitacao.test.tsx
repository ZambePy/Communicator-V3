import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Medidor de digitação do teclado do olhar (21/10/2026): cada AUMENTO do texto
// é uma seleção (uma letra, um espaço, uma palavra sugerida). O que não é
// digitação — apagar, limpar, restaurar o rascunho e, acima de tudo, a FRASE
// PRONTA que entra de uma vez — não entra na velocidade.
//
// Rodada 1 da revisão: o critério da frase pronta é o JEITO como ela entrou
// (a tela avisa o medidor), e não o tamanho. Contar pelo tamanho deixava passar
// as frases curtas ("Preciso de ajuda", "Quero água"), justamente as que o
// assistente mais oferece: um toque, 17 caracteres, e a velocidade de quem mal
// escreveu subia sozinha.

const registrarDigitacao = vi.fn();
vi.mock('./registroDeUso', () => ({
  registrarDigitacao: (...a: unknown[]) => registrarDigitacao(...a),
}));

import { MAX_CARACTERES_POR_SELECAO, useMedidorDeDigitacao } from './useMedidorDeDigitacao';

describe('useMedidorDeDigitacao', () => {
  beforeEach(() => {
    registrarDigitacao.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const montar = (inicial: string) => renderHook(({ texto }) => useMedidorDeDigitacao(texto), { initialProps: { texto: inicial } });

  it('o texto que já estava lá (rascunho restaurado) não é digitação', () => {
    montar('Bom dia, preciso de água');
    expect(registrarDigitacao).not.toHaveBeenCalled();
  });

  it('uma letra a mais é uma seleção de 1 caractere, com a hora de agora', () => {
    const { rerender } = montar('');
    rerender({ texto: 'B' });
    expect(registrarDigitacao).toHaveBeenCalledTimes(1);
    expect(registrarDigitacao).toHaveBeenCalledWith(1, Date.parse('2026-10-21T15:00:00Z'));
  });

  it('uma palavra sugerida entra de uma vez e conta pelo que acrescentou', () => {
    const { rerender } = montar('bo');
    rerender({ texto: 'bom ' });
    expect(registrarDigitacao).toHaveBeenCalledWith(2, expect.any(Number));
  });

  it('apagar, limpar e trocar por texto menor não contam', () => {
    const { rerender } = montar('Bom dia');
    rerender({ texto: 'Bom di' });
    rerender({ texto: '' });
    expect(registrarDigitacao).not.toHaveBeenCalled();
  });

  it(`rede de segurança: um salto de mais de ${MAX_CARACTERES_POR_SELECAO} caracteres que ninguém marcou também não é digitação`, () => {
    const { rerender } = montar('bom');
    rerender({ texto: 'bom dia, tudo bem com você hoje? ' });
    expect(registrarDigitacao).not.toHaveBeenCalled();
  });

  it('o limite é inclusivo: exatamente o teto ainda conta', () => {
    const { rerender } = montar('');
    rerender({ texto: 'x'.repeat(MAX_CARACTERES_POR_SELECAO) });
    expect(registrarDigitacao).toHaveBeenCalledWith(MAX_CARACTERES_POR_SELECAO, expect.any(Number));
    rerender({ texto: 'x'.repeat(MAX_CARACTERES_POR_SELECAO * 2 + 1) });
    expect(registrarDigitacao).toHaveBeenCalledTimes(1);
  });

  describe('frase pronta: a tela avisa antes de inserir, e o medidor não conta', () => {
    it('uma frase CURTA (cabe no teto) que entra de uma vez, avisada, não é digitação', () => {
      const { rerender, result } = renderHook(({ texto }) => useMedidorDeDigitacao(texto), { initialProps: { texto: '' } });
      expect('Preciso de ajuda '.length).toBeLessThanOrEqual(MAX_CARACTERES_POR_SELECAO);
      act(() => result.current('Preciso de ajuda '));
      rerender({ texto: 'Preciso de ajuda ' });
      expect(registrarDigitacao).not.toHaveBeenCalled();
    });

    it('a frase que completa o que a pessoa começou também não conta (avanço pequeno, mas pronto)', () => {
      const { rerender, result } = renderHook(({ texto }) => useMedidorDeDigitacao(texto), { initialProps: { texto: 'Estou com' } });
      act(() => result.current('Estou com dor '));
      rerender({ texto: 'Estou com dor ' });
      expect(registrarDigitacao).not.toHaveBeenCalled();
    });

    it('a marca vale para aquele texto e uma vez só: a letra seguinte conta normalmente', () => {
      const { rerender, result } = renderHook(({ texto }) => useMedidorDeDigitacao(texto), { initialProps: { texto: '' } });
      act(() => result.current('Quero água '));
      rerender({ texto: 'Quero água ' });
      rerender({ texto: 'Quero água a' });
      expect(registrarDigitacao).toHaveBeenCalledTimes(1);
      expect(registrarDigitacao).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('marca de um texto que não chegou a entrar (já era o atual) não engole a letra seguinte', () => {
      const { rerender, result } = renderHook(({ texto }) => useMedidorDeDigitacao(texto), { initialProps: { texto: 'Quero água ' } });
      act(() => result.current('Quero água '));
      rerender({ texto: 'Quero água ' });
      rerender({ texto: 'Quero água b' });
      expect(registrarDigitacao).toHaveBeenCalledTimes(1);
    });

    it('marca para um texto e entra outro: o que entrou conta como digitação de verdade', () => {
      const { rerender, result } = renderHook(({ texto }) => useMedidorDeDigitacao(texto), { initialProps: { texto: '' } });
      act(() => result.current('Quero água '));
      rerender({ texto: 'q' });
      expect(registrarDigitacao).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('a marca é gasta: o mesmo texto escrito depois, à mão, conta (apaga o espaço e põe de novo)', () => {
      const { rerender, result } = renderHook(({ texto }) => useMedidorDeDigitacao(texto), { initialProps: { texto: '' } });
      act(() => result.current('Quero água '));
      rerender({ texto: 'Quero água ' });
      rerender({ texto: 'Quero água' });
      rerender({ texto: 'Quero água ' });
      expect(registrarDigitacao).toHaveBeenCalledTimes(1);
      expect(registrarDigitacao).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('a função devolvida é estável (não refaz efeitos da tela a cada render)', () => {
      const { rerender, result } = renderHook(({ texto }) => useMedidorDeDigitacao(texto), { initialProps: { texto: '' } });
      const primeira = result.current;
      expect(typeof primeira).toBe('function');
      rerender({ texto: 'a' });
      expect(result.current).toBe(primeira);
    });
  });

  it('trocar uma letra por outra (mesmo tamanho) não é avanço', () => {
    const { rerender } = montar('abc');
    rerender({ texto: 'abd' });
    expect(registrarDigitacao).not.toHaveBeenCalled();
  });

  it('o mesmo texto de novo (re-render sem mudança) não conta de novo', () => {
    const { rerender } = montar('');
    rerender({ texto: 'a' });
    rerender({ texto: 'a' });
    expect(registrarDigitacao).toHaveBeenCalledTimes(1);
  });

  it('depois de apagar, a letra seguinte conta pelo que acrescentou sobre o texto de agora', () => {
    const { rerender } = montar('abc');
    rerender({ texto: 'ab' });
    rerender({ texto: 'abx' });
    expect(registrarDigitacao).toHaveBeenCalledTimes(1);
    expect(registrarDigitacao).toHaveBeenCalledWith(1, expect.any(Number));
  });

  it('se o registro quebrar, o teclado segue e o console avisa no máximo uma vez por minuto', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registrarDigitacao.mockImplementation(() => { throw new Error('cheio'); });
    const { rerender } = montar('');
    rerender({ texto: 'a' });
    rerender({ texto: 'ab' });
    rerender({ texto: 'abc' });
    expect(aviso).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    rerender({ texto: 'abcd' });
    expect(aviso).toHaveBeenCalledTimes(2);
    aviso.mockRestore();
  });
});
