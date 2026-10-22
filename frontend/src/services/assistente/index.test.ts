import { beforeEach, describe, expect, it } from 'vitest';
import { LICENSE_KEY } from '../../context/LicenseContext';
import {
  apagarModelo,
  assistenteEstaAtivo,
  CHAVE_DESLIGADO,
  definirAssistenteDesligado,
  palavraConhecida,
  registrarFalaDoPaciente,
  resumoDoModelo,
  sugerirFrases,
  sugerirPalavras,
  sugerirRespostas,
  ultimaMensagemDoCuidador,
  ultimaPerguntaDoCuidador,
} from './index';
import { CHAVE_DO_MODELO, reiniciarParaTeste } from './armazenamento';
import { getPredictions } from '../../utils/wordPredictor';

const licenca = (features: Record<string, boolean> | undefined) =>
  JSON.stringify({ plan: features ? { features } : {} });

beforeEach(() => {
  localStorage.clear();
  reiniciarParaTeste();
});

describe('licença e chave de desligar', () => {
  it('sem licença gravada, o assistente funciona', () => {
    expect(assistenteEstaAtivo()).toBe(true);
  });

  it('licença sem o campo features não bloqueia (cache antigo)', () => {
    localStorage.setItem(LICENSE_KEY, licenca(undefined));
    expect(assistenteEstaAtivo()).toBe(true);
  });

  it('plano sem assistente bloqueia as sugestões', () => {
    localStorage.setItem(LICENSE_KEY, licenca({ assistente: false }));
    expect(assistenteEstaAtivo()).toBe(false);
    expect(sugerirPalavras('qu')).toEqual([]);
    expect(sugerirFrases({ mensagemDoCuidador: 'Quer água?' })).toEqual([]);
  });

  it('desligar pelo usuário some com as sugestões mas não apaga o aprendizado', () => {
    registrarFalaDoPaciente('quero mudar de posição');
    definirAssistenteDesligado(true);
    expect(localStorage.getItem(CHAVE_DESLIGADO)).toBe('1');
    expect(assistenteEstaAtivo()).toBe(false);
    expect(sugerirPalavras('quero ')).toEqual([]);
    // O modelo continua lá: religar não devolve um assistente amnésico.
    expect(resumoDoModelo().frases).toBe(1);

    definirAssistenteDesligado(false);
    expect(sugerirFrases({ textoAtual: 'quero mudar' })[0]?.texto).toBe('quero mudar de posição');
  });
});

describe('aprendizado e persistência', () => {
  it('aprende a resposta ligada à pergunta do cuidador', () => {
    registrarFalaDoPaciente('Só um gole', 'Quer água?');
    const s = sugerirFrases({ mensagemDoCuidador: 'quer agua', maximo: 3 });
    expect(s[0]).toEqual({ texto: 'Só um gole', origem: 'aprendida' });
  });

  it('grava no localStorage e relê depois de reiniciar', async () => {
    registrarFalaDoPaciente('estou com dor nas costas');
    // A gravação é adiada de propósito; forçamos o descarregamento.
    const { descarregar } = await import('./armazenamento');
    descarregar();
    expect(localStorage.getItem(CHAVE_DO_MODELO)).toContain('costas');

    reiniciarParaTeste();
    expect(resumoDoModelo().frases).toBe(1);
  });

  it('apagar limpa o modelo e o resíduo do preditor antigo', () => {
    localStorage.setItem('irisflow_user_words', '[]');
    registrarFalaDoPaciente('quero água');
    apagarModelo();
    expect(resumoDoModelo()).toEqual({ palavras: 0, frases: 0, perguntas: 0, kb: expect.any(Number) });
    expect(localStorage.getItem('irisflow_user_words')).toBeNull();
    expect(localStorage.getItem(CHAVE_DO_MODELO)).toBeNull();
  });

  it('migra o vocabulário do preditor antigo uma única vez', () => {
    localStorage.setItem('irisflow_user_words', JSON.stringify([{ word: 'gabriel', count: 7 }]));
    localStorage.setItem('irisflow_user_bigrams', JSON.stringify([{ w1: 'chamar', w2: 'gabriel', count: 4 }]));
    reiniciarParaTeste();
    expect(getPredictions('chamar ')).toContain('gabriel');
    expect(resumoDoModelo().palavras).toBe(1);
  });
});

describe('pergunta no ar', () => {
  it('é a última do cuidador quando o paciente ainda não respondeu', () => {
    expect(
      ultimaPerguntaDoCuidador([
        { sender: 'paciente', text: 'oi' },
        { sender: 'cuidador', text: 'Quer água?' },
      ]),
    ).toBe('Quer água?');
  });

  it('some depois que o paciente responde', () => {
    expect(
      ultimaPerguntaDoCuidador([
        { sender: 'cuidador', text: 'Quer água?' },
        { sender: 'paciente', text: 'Sim' },
      ]),
    ).toBeUndefined();
  });

  it('conversa vazia não tem pergunta', () => {
    expect(ultimaPerguntaDoCuidador([])).toBeUndefined();
  });

  it('mensagem do sistema não é pergunta: a anterior do cuidador continua no ar', () => {
    expect(
      ultimaPerguntaDoCuidador([
        { sender: 'cuidador', kind: 'texto', text: 'Quer água?' },
        { sender: 'cuidador', kind: 'sistema', text: 'Seu cuidador viu o pedido às 10:32' },
      ]),
    ).toBe('Quer água?');
  });
});

describe('ultimaMensagemDoCuidador', () => {
  const m = (id: string, sender: string, kind: string, text: string) => ({ id, sender, kind, text });

  it('devolve a mensagem inteira — o id e o tipo importam para a faixa de respostas', () => {
    const quer = m('2', 'cuidador', 'texto', 'Quer água?');
    expect(ultimaMensagemDoCuidador([m('1', 'paciente', 'frase', 'oi'), quer])).toBe(quer);
  });

  it('o paciente respondeu: acabou a pergunta', () => {
    expect(
      ultimaMensagemDoCuidador([m('1', 'cuidador', 'texto', 'Quer água?'), m('2', 'paciente', 'frase', 'Sim')]),
    ).toBeUndefined();
  });

  it('pula as do sistema e continua procurando para trás, mas para na resposta do paciente', () => {
    const quer = m('1', 'cuidador', 'texto', 'Quer água?');
    expect(ultimaMensagemDoCuidador([quer, m('2', 'cuidador', 'sistema', 'visto')])).toBe(quer);
    expect(
      ultimaMensagemDoCuidador([quer, m('2', 'paciente', 'frase', 'Sim'), m('3', 'cuidador', 'sistema', 'visto')]),
    ).toBeUndefined();
  });

  it('o Sim/Não do cuidador (simnao) é devolvido como é: quem decide não ter faixa é a faixa', () => {
    const pergunta = m('1', 'cuidador', 'simnao', 'Você está com dor?');
    expect(ultimaMensagemDoCuidador([pergunta])?.kind).toBe('simnao');
  });

  it('sem mensagens: nada', () => {
    expect(ultimaMensagemDoCuidador([])).toBeUndefined();
  });
});

describe('sugerirRespostas (a porta do assistente)', () => {
  it('dá respostas a uma pergunta de sim ou não, com Sim e Não entre elas', () => {
    const r = sugerirRespostas('Você quer água?');
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.length).toBeLessThanOrEqual(4);
    expect(r.some((x) => /^sim/i.test(x))).toBe(true);
    expect(r.some((x) => /^não/i.test(x))).toBe(true);
  });

  it('respeita o máximo pedido', () => {
    expect(sugerirRespostas('Você quer água?', 2)).toHaveLength(2);
  });

  it('o que o paciente já respondeu àquela pergunta vem na frente (aprendido ao falar)', () => {
    registrarFalaDoPaciente('Só um gole', 'Quer água?');
    expect(sugerirRespostas('quer agua')[0]).toBe('Só um gole');
  });

  it('desligado pelo paciente ou fora do plano: lista vazia, e nada é calculado', () => {
    definirAssistenteDesligado(true);
    expect(sugerirRespostas('Você quer água?')).toEqual([]);
    definirAssistenteDesligado(false);
    localStorage.setItem(LICENSE_KEY, licenca({ assistente: false }));
    expect(sugerirRespostas('Você quer água?')).toEqual([]);
  });

  it('não muda o que o assistente aprendeu: sugerir não é aprender', () => {
    sugerirRespostas('Você quer água?');
    expect(resumoDoModelo()).toMatchObject({ frases: 0, perguntas: 0 });
  });

  it('pergunta aberta sem histórico: nada a sugerir', () => {
    expect(sugerirRespostas('O que você quer comer hoje?')).toEqual([]);
  });
});

describe('palavra conhecida (dwell em cascata, M17)', () => {
  it('a palavra que o paciente já falou passa a ser conhecida; lixo não', () => {
    expect(palavraConhecida('Zambelândia')).toBe(false);
    registrarFalaDoPaciente('Zambelândia fica longe');
    expect(palavraConhecida('zambelandia')).toBe(true);
    expect(palavraConhecida('xyzzq')).toBe(false);
  });
});
