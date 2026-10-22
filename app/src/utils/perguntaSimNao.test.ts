/**
 * Pergunta sim/não do cuidador (pedido de 21/10/2026): o computador devolve a
 * resposta como "Sim (pergunta)" / "Não (pergunta)", e é pela pergunta entre
 * parênteses que o app liga a resposta à pergunta certa.
 */
import type { Message } from '@/data/types';
import { ehPerguntaSimNao, excessoDaPergunta, lerResposta, ligarRespostas, MAXIMO_DA_PERGUNTA } from './perguntaSimNao';

const base = Date.parse('2026-10-21T10:00:00Z');
const msg = (id: string, minuto: number, extra: Partial<Message>): Message => ({
  id, beneficiary_id: 'b1', sender: 'cuidador', kind: 'simnao', text: '', created_at: new Date(base + minuto * 60_000).toISOString(), read_at: null, spoken: false, ...extra,
});
const pergunta = (id: string, minuto: number, text: string) => msg(id, minuto, { sender: 'cuidador', kind: 'simnao', text });
const resposta = (id: string, minuto: number, text: string) => msg(id, minuto, { sender: 'paciente', kind: 'simnao', text, spoken: true });

describe('o que é pergunta', () => {
  it('sim/não do cuidador com uma pergunta', () => {
    expect(ehPerguntaSimNao(pergunta('q', 0, 'Você está com dor?'))).toBe(true);
  });
  it.each(['Sim', 'Não', 'nao.', 'S'])('o "%s" curto dos botões do app é resposta do cuidador, não pergunta', (t) => {
    expect(ehPerguntaSimNao(pergunta('q', 0, t))).toBe(false);
  });
  it('do paciente, ou de outro tipo, não é pergunta', () => {
    expect(ehPerguntaSimNao(resposta('a', 0, 'Sim (Quer água?)'))).toBe(false);
    expect(ehPerguntaSimNao(msg('t', 0, { kind: 'texto', text: 'Quer água?' }))).toBe(false);
  });
});

describe('lerResposta', () => {
  it('resposta a uma pergunta: o lado e a pergunta', () => {
    expect(lerResposta(resposta('a', 1, 'Sim (Quer água?)'))).toEqual({ resposta: 'sim', pergunta: 'Quer água?' });
    expect(lerResposta(resposta('a', 1, 'Não (Está com frio? (do quarto))'))).toEqual({ resposta: 'nao', pergunta: 'Está com frio? (do quarto)' });
  });
  it('o sim/não solto da tela Sim · Não: o lado, sem pergunta', () => {
    expect(lerResposta(resposta('a', 1, 'Não'))).toEqual({ resposta: 'nao', pergunta: null });
  });
  it('o que não é sim/não do paciente não é resposta', () => {
    expect(lerResposta(pergunta('q', 0, 'Sim (x)'))).toBeNull();
    expect(lerResposta(msg('t', 0, { sender: 'paciente', kind: 'texto', text: 'Sim (x)' }))).toBeNull();
  });
});

describe('ligarRespostas', () => {
  it('liga a resposta à pergunta de mesmo texto', () => {
    const q = pergunta('q1', 0, 'Você está com dor?');
    const a = resposta('a1', 2, 'Sim (Você está com dor?)');
    const { respostaDe, perguntaDe } = ligarRespostas([q, a]);
    expect(respostaDe.get('q1')?.id).toBe('a1');
    expect(perguntaDe.get('a1')?.id).toBe('q1');
  });

  it('a mesma pergunta duas vezes: cada resposta vai para a sua, na ordem em que o computador as mostra', () => {
    const msgs = [
      pergunta('q1', 0, 'Quer água?'),
      pergunta('q2', 1, 'Quer água?'),
      resposta('a1', 2, 'Não (Quer água?)'),
      resposta('a2', 3, 'Sim (Quer água?)'),
    ];
    const { respostaDe } = ligarRespostas(msgs);
    expect(respostaDe.get('q1')?.id).toBe('a1');
    expect(respostaDe.get('q2')?.id).toBe('a2');
  });

  it('casa sem diferença de acento, caixa e espaços; a ordem de chegada da lista não importa', () => {
    const { respostaDe } = ligarRespostas([
      resposta('a1', 2, 'Não (voce   esta com DOR?)'),
      pergunta('q1', 0, 'Você está com dor?'),
    ]);
    expect(respostaDe.get('q1')?.id).toBe('a1');
  });

  it('o sim/não solto, ou de outra pergunta, não liga', () => {
    const { respostaDe } = ligarRespostas([
      pergunta('q1', 0, 'Você está com dor?'),
      resposta('a1', 1, 'Sim'),
      resposta('a2', 2, 'Não (Quer água?)'),
    ]);
    expect(respostaDe.has('q1')).toBe(false);
  });

  it('a pergunta comprida que o computador encurtou ("…") ainda liga', () => {
    const longa = 'Quer que eu ligue para a sua irmã agora '.repeat(60).trim();
    const encurtada = `${longa.slice(0, 1993)}…`;
    const { respostaDe } = ligarRespostas([pergunta('q1', 0, longa), resposta('a1', 1, `Sim (${encurtada})`)]);
    expect(respostaDe.get('q1')?.id).toBe('a1');
  });

  it('resposta com o relógio um pouco antes da pergunta (até 2 min) ainda liga; muito antes, não', () => {
    expect(ligarRespostas([pergunta('q1', 1, 'Tudo bem?'), resposta('a1', 0, 'Sim (Tudo bem?)')]).respostaDe.get('q1')?.id).toBe('a1');
    expect(ligarRespostas([pergunta('q1', 10, 'Tudo bem?'), resposta('a1', 0, 'Sim (Tudo bem?)')]).respostaDe.has('q1')).toBe(false);
  });
});

describe('excessoDaPergunta (limite de 160 letras, revisão final de 21/10/2026)', () => {
  it('a pergunta é curta: o limite é de 160 letras', () => {
    expect(MAXIMO_DA_PERGUNTA).toBe(160);
  });
  it('cabe: nenhuma letra a mais', () => {
    expect(excessoDaPergunta('a'.repeat(160), true)).toBe(0);
    expect(excessoDaPergunta('', true)).toBe(0);
  });
  it('passou: quantas letras a mais, contando o texto como será enviado (sem espaços nas pontas)', () => {
    expect(excessoDaPergunta('a'.repeat(161), true)).toBe(1);
    expect(excessoDaPergunta('a'.repeat(300), true)).toBe(140);
    expect(excessoDaPergunta(`  ${'a'.repeat(160)}   `, true)).toBe(0);
  });
  it('fora do modo pergunta o limite é da mensagem comum, não deste', () => {
    expect(excessoDaPergunta('a'.repeat(300), false)).toBe(0);
  });
});

