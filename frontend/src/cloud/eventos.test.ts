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

describe('entrega: gravado, mas nenhum celular avisado (19/10/2026)', () => {
  it('`push.avisados === 0` vira `sem_push`; sem o campo (servidor antigo) continua `enviado`', async () => {
    const { entregaDaResposta } = await import('./eventos');
    expect(entregaDaResposta({ ok: true, push: { avisados: 0, recusados: 2 } })).toBe('sem_push');
    expect(entregaDaResposta({ ok: true, push: { avisados: 1, recusados: 1 } })).toBe('enviado');
    expect(entregaDaResposta({ ok: true })).toBe('enviado');
  });

  it('reenvio (`repetido`) sem dado de push NÃO vira "enviado": gravado, sem confirmação do push (revisão de UX de 19/10/2026)', () => {
    // A primeira resposta se perdeu; a fila reenviou e o servidor achou o
    // pedido já gravado. Ele não sabe se o push daquele envio foi aceito.
    expect(entregaDaResposta({ ok: true, id: ID, repetido: true })).toBe('push_incerto');
    expect(entregaDaResposta({ ok: true, id: ID, repetido: true, push: null })).toBe('push_incerto');
    // Quando o servidor sabe (nenhum celular cadastrado), vale o que ele disser.
    expect(entregaDaResposta({ ok: true, id: ID, repetido: true, push: { avisados: 0, recusados: 0, motivos: ['sem_celular'] } })).toBe('sem_push');
    expect(entregaDaResposta({ ok: true, id: ID, repetido: true, push: { avisados: 1, recusados: 0 } })).toBe('enviado');
  });

  it('"sem confirmação do push" não piora um "enviado" já sabido, e a fila não o desfaz', () => {
    informarEntrega(ID, 'enviado');
    informarEntrega(ID, 'push_incerto');
    expect(entregaDoPedido(ID)).toBe('enviado');

    informarEntrega('p2', 'na_fila');
    informarEntrega('p2', 'push_incerto');
    informarEntrega('p2', 'na_fila');
    informarEntrega('p2', 'falhou');
    expect(entregaDoPedido('p2')).toBe('push_incerto');
    // Uma resposta que sabe do push o substitui.
    informarEntrega('p2', 'sem_push');
    expect(entregaDoPedido('p2')).toBe('sem_push');
  });

  // Revisão final, rodada 1 (M6, 21/10/2026): acima de 6 chamados de ajuda em 10 min o servidor
  // descarta o aviso e responde `limitado: true`. Antes isso virava "Ninguém avisado" sem dizer por quê.
  it('`limitado: true` (limite de chamados) vira `limitado`, com ou sem o campo de push', () => {
    expect(entregaDaResposta({ ok: true, limitado: true, push: { avisados: 0, recusados: 0, motivos: ['limite'] } })).toBe('limitado');
    expect(entregaDaResposta({ ok: true, limitado: true })).toBe('limitado');
    // O que não é limite segue como era.
    expect(entregaDaResposta({ ok: true, limitado: false, push: { avisados: 0, recusados: 1 } })).toBe('sem_push');
    expect(entregaDaResposta({ ok: true, push: { avisados: 1, recusados: 0 } })).toBe('enviado');
  });

  it('`limitado` não volta para "na fila"/"falhou"; só um "enviado" posterior melhora', () => {
    informarEntrega('lim', 'limitado');
    informarEntrega('lim', 'na_fila');
    informarEntrega('lim', 'falhou');
    expect(entregaDoPedido('lim')).toBe('limitado');
    informarEntrega('lim', 'enviado');
    expect(entregaDoPedido('lim')).toBe('enviado');
  });

  it('`sem_push` não volta para "na fila"; um "enviado" posterior melhora', async () => {
    const { informarEntrega, entregaDoPedido, _limparOuvintes } = await import('./eventos');
    _limparOuvintes();
    informarEntrega('p1', 'sem_push');
    informarEntrega('p1', 'na_fila');
    expect(entregaDoPedido('p1')).toBe('sem_push');
    informarEntrega('p1', 'enviado');
    expect(entregaDoPedido('p1')).toBe('enviado');
  });
});

// Revisão de UX de 20/10/2026, achado 3: a fala acompanhada (o mapa da dor).
// `message.send` só grava a frase na conversa, sem push — o registro diz o que
// o envio respondeu, e nunca "avisado".
describe('entrega das falas acompanhadas', () => {
  it('a fala leva o id da tela; sem id, o evento é o de sempre', async () => {
    const { emitirFalaDoPaciente } = await import('./eventos');
    const vistos: unknown[] = [];
    ouvir((e) => vistos.push(e));
    emitirFalaDoPaciente('Sim', 'simnao');
    emitirFalaDoPaciente('Dor no peito, nível 3 de 10', 'frase', ID);
    expect(vistos).toEqual([
      { tipo: 'fala', texto: 'Sim', kind: 'simnao' },
      { tipo: 'fala', texto: 'Dor no peito, nível 3 de 10', kind: 'frase', id: ID },
    ]);
  });

  it('ninguém ouvindo: a fala acompanhada é "sem_nuvem"; modo apresentação: "ensaio", e nada sai', async () => {
    const { emitirFalaDoPaciente, entregaDaMensagem } = await import('./eventos');
    emitirFalaDoPaciente('Dor', 'frase', 'm1');
    expect(entregaDaMensagem('m1')).toBe('sem_nuvem');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    definirModoApresentacao(true);
    const ouvinte = vi.fn();
    ouvir(ouvinte);
    emitirFalaDoPaciente('Dor', 'frase', 'm2');
    expect(ouvinte).not.toHaveBeenCalled();
    expect(entregaDaMensagem('m2')).toBe('ensaio');
  });

  it('a resposta do envio vira o estado: gravada, na fila, sem vínculo ou falhou', async () => {
    const { entregaDaMensagemPelaResposta } = await import('./eventos');
    expect(entregaDaMensagemPelaResposta({ ok: true, id: ID })).toBe('gravada');
    expect(entregaDaMensagemPelaResposta({ ok: false, error: 'rede', enfileirado: true })).toBe('na_fila');
    expect(entregaDaMensagemPelaResposta({ ok: false, error: 'sem_vinculo' })).toBe('sem_nuvem');
    expect(entregaDaMensagemPelaResposta({ ok: false, error: 'payload inválido' })).toBe('falhou');
  });

  it('"gravada" não volta atrás, e os ouvintes acompanham cada mudança', async () => {
    const { informarEntregaDaMensagem, entregaDaMensagem, ouvirEntregaDaMensagem } = await import('./eventos');
    const vistos: string[] = [];
    ouvirEntregaDaMensagem((id, e) => vistos.push(`${id}:${e}`));
    informarEntregaDaMensagem('m3', 'enviando');
    informarEntregaDaMensagem('m3', 'na_fila');
    informarEntregaDaMensagem('m3', 'gravada');
    informarEntregaDaMensagem('m3', 'falhou');
    expect(entregaDaMensagem('m3')).toBe('gravada');
    expect(vistos).toEqual(['m3:enviando', 'm3:na_fila', 'm3:gravada']);
  });
});
