import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAVE_DO_MODO_APRESENTACAO,
  NOME_DE_DEMONSTRACAO,
  _reiniciarParaTeste,
  definirModoApresentacao,
  modoApresentacaoAtivo,
  nomeParaExibir,
  ouvirModoApresentacao,
} from './apresentacao';
import { _limparOuvintes, emitir, emitirPedidoDeAjuda, ouvir } from '../cloud/eventos';

beforeEach(() => {
  localStorage.clear();
  _reiniciarParaTeste();
  _limparOuvintes();
});

describe('modo apresentação', () => {
  it('começa desligado e persiste ao ligar', () => {
    expect(modoApresentacaoAtivo()).toBe(false);
    definirModoApresentacao(true);
    expect(localStorage.getItem(CHAVE_DO_MODO_APRESENTACAO)).toMatch(/^desde:\d+$/);
    _reiniciarParaTeste();
    expect(modoApresentacaoAtivo()).toBe(true);
  });

  it('desliga sozinho depois de 2 h — esquecido ligado, ele descartava todo socorro (FE-9)', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
      definirModoApresentacao(true);
      vi.setSystemTime(new Date('2026-09-27T11:59:00Z'));
      expect(modoApresentacaoAtivo()).toBe(true);
      vi.setSystemTime(new Date('2026-09-27T12:00:01Z'));
      expect(modoApresentacaoAtivo()).toBe(false);
      expect(localStorage.getItem(CHAVE_DO_MODO_APRESENTACAO)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('o formato antigo, sem data, conta como desligado', () => {
    localStorage.setItem(CHAVE_DO_MODO_APRESENTACAO, '1');
    _reiniciarParaTeste();
    expect(modoApresentacaoAtivo()).toBe(false);
  });

  it('avisa quem estiver ouvindo, e só quando muda', () => {
    const visto: boolean[] = [];
    const parar = ouvirModoApresentacao((v) => visto.push(v));
    definirModoApresentacao(true);
    definirModoApresentacao(true);
    definirModoApresentacao(false);
    parar();
    definirModoApresentacao(true);
    expect(visto).toEqual([true, false]);
  });

  it('troca o nome do paciente por um rótulo neutro', () => {
    expect(nomeParaExibir('Carlos')).toBe('Carlos');
    definirModoApresentacao(true);
    expect(nomeParaExibir('Carlos')).toBe(NOME_DE_DEMONSTRACAO);
  });
});

describe('corte da saída para a nuvem', () => {
  it('em uso normal, o pedido de socorro chega ao barramento', () => {
    const ouvinte = vi.fn();
    ouvir(ouvinte);
    emitirPedidoDeAjuda('emergencia', 'socorro');
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it('em apresentação, NADA sai — nem o pedido de socorro', () => {
    const ouvinte = vi.fn();
    ouvir(ouvinte);
    definirModoApresentacao(true);

    emitirPedidoDeAjuda('emergencia', 'socorro');
    emitir({ tipo: 'fala', texto: 'oi', kind: 'texto' });
    emitir({ tipo: 'uso', caracteres: 10 });

    expect(ouvinte).not.toHaveBeenCalled();
  });

  it('desligar o modo devolve a saída', () => {
    const ouvinte = vi.fn();
    ouvir(ouvinte);
    definirModoApresentacao(true);
    emitirPedidoDeAjuda('ajuda', 'x');
    definirModoApresentacao(false);
    emitirPedidoDeAjuda('ajuda', 'x');
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });
});
