import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  emitirPedidoDeAjuda, ouvir, informarEntrega, ouvirEntrega, entregaDoPedido, entregaDaResposta, _limparOuvintes,
} from './eventos';
import { definirModoApresentacao } from '../services/apresentacao';

// -----------------------------------------------------------------------------
// FE-9: a tela de emergência só diz "enviado" quando o pedido saiu. O
// barramento informa o que ele mesmo sabe (modo apresentação, ninguém ouvindo);
// o CloudProvider informa o resto a partir da resposta do envio.
// -----------------------------------------------------------------------------

const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

beforeEach(() => {
  _limparOuvintes();
  definirModoApresentacao(false);
});

afterEach(() => {
  definirModoApresentacao(false);
  vi.restoreAllMocks();
});

describe('entrega dos pedidos de ajuda', () => {
  it('modo apresentação: o pedido não sai e a entrega é "ensaio"', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    definirModoApresentacao(true);
    const ouvinte = vi.fn();
    ouvir(ouvinte);
    emitirPedidoDeAjuda('emergencia', 'dor', ID);
    expect(ouvinte).not.toHaveBeenCalled();
    expect(entregaDoPedido(ID)).toBe('ensaio');
  });

  it('sem ninguém ouvindo (integração desmontada): "sem_nuvem"', () => {
    emitirPedidoDeAjuda('emergencia', 'dor', ID);
    expect(entregaDoPedido(ID)).toBe('sem_nuvem');
  });

  it('com a integração ouvindo, o barramento não decide a entrega sozinho', () => {
    ouvir(() => {});
    emitirPedidoDeAjuda('emergencia', 'dor', ID);
    expect(entregaDoPedido(ID)).toBeNull();
  });

  it('avisa quem ouve e não deixa um "enviado" voltar para "na fila"', () => {
    const vistos: string[] = [];
    ouvirEntrega((id, e) => vistos.push(`${id.slice(0, 4)}:${e}`));
    informarEntrega(ID, 'na_fila');
    informarEntrega(ID, 'enviado');
    informarEntrega(ID, 'na_fila');
    expect(entregaDoPedido(ID)).toBe('enviado');
    expect(vistos).toEqual(['3f25:na_fila', '3f25:enviado']);
  });

  it('a resposta do envio vira a entrega certa', () => {
    expect(entregaDaResposta({ ok: true, id: ID })).toBe('enviado');
    expect(entregaDaResposta({ ok: false, error: 'sem_vinculo' })).toBe('sem_nuvem');
    expect(entregaDaResposta({ ok: false, error: 'Failed to fetch', enfileirado: true })).toBe('na_fila');
    expect(entregaDaResposta({ ok: false, error: 'texto vazio' })).toBe('falhou');
  });
});
