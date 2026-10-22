import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ehPerguntaDoCuidador,
  textoDaResposta,
  notaDePerguntaFechada,
  PREFIXO_DA_PERGUNTA_FECHADA,
  marcarPerguntaRespondida,
  perguntaFoiRespondida,
  CHAVE_DAS_PERGUNTAS_RESPONDIDAS,
  _esquecerRespondidasEmMemoria,
  quandoFoiAPergunta,
  falaDaPergunta,
} from './perguntaDoCuidador';

// Pergunta sim/não do cuidador (pedido de 21/10/2026).

const msg = (sender: 'cuidador' | 'paciente', kind: string, text: string) =>
  ({ sender, kind, text }) as Parameters<typeof ehPerguntaDoCuidador>[0];

describe('o que é pergunta do cuidador', () => {
  it('mensagem sim/não do cuidador com uma pergunta', () => {
    expect(ehPerguntaDoCuidador(msg('cuidador', 'simnao', 'Você está com dor?'))).toBe(true);
    expect(ehPerguntaDoCuidador(msg('cuidador', 'simnao', 'Quer que eu abra a janela'))).toBe(true);
  });

  it.each(['Sim', 'Não', 'nao', 'NÃO.', 'sim!', 'S', 'n', '  Sim  '])(
    'o "%s" curto dos botões do app é a RESPOSTA do cuidador, não pergunta',
    (texto) => {
      expect(ehPerguntaDoCuidador(msg('cuidador', 'simnao', texto))).toBe(false);
    },
  );

  it('outro remetente ou outro tipo não é pergunta', () => {
    expect(ehPerguntaDoCuidador(msg('paciente', 'simnao', 'Sim (Quer água?)'))).toBe(false);
    expect(ehPerguntaDoCuidador(msg('cuidador', 'texto', 'Você está com dor?'))).toBe(false);
    expect(ehPerguntaDoCuidador(msg('cuidador', 'simnao', '   '))).toBe(false);
  });
});

describe('o texto da resposta', () => {
  it('"Sim"/"Não" e a pergunta entre parênteses, numa linha', () => {
    expect(textoDaResposta('sim', 'Quer água?')).toBe('Sim (Quer água?)');
    expect(textoDaResposta('nao', '  Está\ncom   frio? ')).toBe('Não (Está com frio?)');
  });

  it('cabe no limite do banco (2000) e o parêntese fecha', () => {
    const t = textoDaResposta('nao', 'a'.repeat(5000));
    expect(t.length).toBeLessThanOrEqual(2000);
    expect(t.startsWith('Não (a')).toBe(true);
    expect(t.endsWith('…)')).toBe(true);
  });
});

describe('as perguntas já respondidas, guardadas no computador', () => {
  beforeEach(() => {
    localStorage.clear();
    _esquecerRespondidasEmMemoria();
  });
  afterEach(() => vi.restoreAllMocks());

  it('marcar e conferir; sobrevive a recarregar (fica no disco)', () => {
    expect(perguntaFoiRespondida('q-1')).toBe(false);
    marcarPerguntaRespondida('q-1');
    _esquecerRespondidasEmMemoria();
    expect(perguntaFoiRespondida('q-1')).toBe(true);
    expect(JSON.parse(localStorage.getItem(CHAVE_DAS_PERGUNTAS_RESPONDIDAS)!)).toEqual(['q-1']);
  });

  it('guarda só as 50 últimas', () => {
    for (let i = 0; i < 60; i++) marcarPerguntaRespondida(`q-${i}`);
    const guardadas = JSON.parse(localStorage.getItem(CHAVE_DAS_PERGUNTAS_RESPONDIDAS)!);
    expect(guardadas).toHaveLength(50);
    expect(guardadas[0]).toBe('q-10');
    expect(perguntaFoiRespondida('q-59')).toBe(true);
  });

  it('disco ilegível vale como vazio; disco que recusa gravar não impede de lembrar nesta sessão', () => {
    localStorage.setItem(CHAVE_DAS_PERGUNTAS_RESPONDIDAS, '{quebrado');
    expect(perguntaFoiRespondida('q-1')).toBe(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cota'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    marcarPerguntaRespondida('q-2');
    expect(perguntaFoiRespondida('q-2')).toBe(true);
  });
});

// Revisão de 21/10/2026 (Minor 4): a pergunta não expira — uma pendente desde
// ontem volta na abertura. Ela aparece com a hora (no fuso de Brasília) e, se
// já tem mais de uma hora, a fala começa por ela: a pergunta das 14:00 não
// pode soar como a de agora.
describe('a hora da pergunta', () => {
  // 21/10/2026, 14:00 em Brasília (UTC−3).
  const AGORA = Date.parse('2026-10-21T17:00:00Z');

  it('de hoje: "das HH:MM", no fuso de Brasília', () => {
    expect(quandoFoiAPergunta('2026-10-21T16:30:00Z', AGORA)).toBe('das 13:30');
    // 02:10 UTC do dia 21 ainda é dia 20 em Brasília: ontem.
    expect(quandoFoiAPergunta('2026-10-21T02:10:00Z', AGORA)).toBe('de ontem, às 23:10');
  });

  it('de ontem e de antes: com o dia', () => {
    expect(quandoFoiAPergunta('2026-10-20T15:00:00Z', AGORA)).toBe('de ontem, às 12:00');
    expect(quandoFoiAPergunta('2026-10-18T15:05:00Z', AGORA)).toBe('de 18/10, às 12:05');
  });

  it('data inválida: sem hora (nada inventado)', () => {
    expect(quandoFoiAPergunta('não é data', AGORA)).toBeNull();
    expect(falaDaPergunta('Você está com dor?', 'não é data', AGORA)).toBe('Você está com dor?');
  });

  it('a fala: só o texto até uma hora; depois, começa pela hora', () => {
    expect(falaDaPergunta('Você está com dor?', '2026-10-21T16:30:00Z', AGORA)).toBe('Você está com dor?');
    expect(falaDaPergunta('Você está com dor?', '2026-10-21T16:00:00Z', AGORA)).toBe('Você está com dor?');
    expect(falaDaPergunta('Você está com dor?', '2026-10-21T15:59:00Z', AGORA)).toBe('Pergunta das 12:59: Você está com dor?');
    expect(falaDaPergunta('Quer água?', '2026-10-20T15:00:00Z', AGORA)).toBe('Pergunta de ontem, às 12:00: Quer água?');
  });
});

// Revisão final, rodada 1 (M9, 21/10/2026): "Fechar sem responder" não manda resposta, e o app
// mostrava a pergunta como "mostrada", como se a resposta estivesse a caminho. A nota curta de
// sistema diz que ela foi fechada. O formato é o contrato com o app: prefixo fixo, dois-pontos e a
// pergunta entre aspas curvas.
describe('a nota de pergunta fechada sem resposta', () => {
  it('tem o prefixo fixo e traz a pergunta entre aspas, para o cuidador saber qual foi', () => {
    expect(PREFIXO_DA_PERGUNTA_FECHADA).toBe('A pergunta foi fechada no computador sem resposta');
    expect(notaDePerguntaFechada('Você está com dor?')).toBe('A pergunta foi fechada no computador sem resposta: “Você está com dor?”');
  });

  it('numa linha só e com tamanho de nota, não de documento', () => {
    expect(notaDePerguntaFechada('  Está\ncom   frio?  ')).toBe('A pergunta foi fechada no computador sem resposta: “Está com frio?”');
    const longa = notaDePerguntaFechada('a'.repeat(500));
    expect(longa.length).toBeLessThanOrEqual(PREFIXO_DA_PERGUNTA_FECHADA.length + 2 + 2 + 120);
    expect(longa.endsWith('…”')).toBe(true);
  });

  it('não é uma resposta: nunca parece "Sim (…)" ou "Não (…)", que o app liga à pergunta', () => {
    expect(notaDePerguntaFechada('Quer água?')).not.toMatch(/^(Sim|Não) \(/);
  });
});
