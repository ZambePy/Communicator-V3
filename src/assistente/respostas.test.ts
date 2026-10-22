import { describe, it, expect } from 'vitest';
import {
  aprenderResposta,
  ehPerguntaDeSimNao,
  intencaoDaPergunta,
  MAXIMO_DE_RESPOSTAS,
  modeloVazio,
  sugerirRespostas,
} from './index';

// Respostas sugeridas (roadmap 1, rodada 3 de 21/10/2026): o cuidador pergunta
// no celular e o computador oferece até 4 respostas curtas. Sem IA generativa:
// o que o paciente já respondeu àquela pergunta e respostas-padrão por
// intenção. Estes testes fixam o contrato — o que a tela vai mostrar.

const temSim = (lista: string[]) => lista.some((r) => /^sim\b/i.test(r));
const temNao = (lista: string[]) => lista.some((r) => /\bn[ãa]o\b/i.test(r));

/**
 * Perguntas fechadas de uso comum: cada uma tem de ter resposta de sim e de não.
 * As de dor ficam de fora, de propósito: nelas não há sugestão nenhuma (ver
 * "nunca na dor", no fim do arquivo).
 */
const PERGUNTAS_DE_SIM_OU_NAO = [
  'Quer água?',
  'Você quer água?',
  'Está com frio?',
  'Quer que eu chame alguém?',
  'Posso abrir a janela?',
  'Gostaria de ouvir música?',
  'Quer deitar?',
  'Quer mudar de posição?',
  'Vamos passear?',
  'Está com sono?',
  'Quer um café?',
  'Está com fome?',
  'Tudo bem?',
];

describe('sugerirRespostas — sempre algo para sim/não, no máximo 4', () => {
  it.each(PERGUNTAS_DE_SIM_OU_NAO)('"%s" com o modelo vazio: de 2 a 4 respostas, com sim e com não', (pergunta) => {
    const r = sugerirRespostas(pergunta, modeloVazio());
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.length).toBeLessThanOrEqual(MAXIMO_DE_RESPOSTAS);
    expect(temSim(r)).toBe(true);
    expect(temNao(r)).toBe(true);
  });

  it('o teto é 4 mesmo quando o paciente já respondeu de muitas formas', () => {
    const m = modeloVazio();
    for (const r of ['Só um gole', 'Quero sim', 'Pode trazer', 'Agora não', 'Depois', 'Talvez']) {
      aprenderResposta(m, 'Quer água?', r);
    }
    expect(sugerirRespostas('Quer água?', m).length).toBe(4);
    expect(sugerirRespostas('Quer água?', m, { maximo: 9 }).length).toBe(4);
    expect(sugerirRespostas('Quer água?', m, { maximo: 2 }).length).toBe(2);
  });

  it('se o paciente só respondeu de um lado, o outro lado continua na faixa', () => {
    const afirmativas = modeloVazio();
    for (const r of ['Quero sim', 'Pode trazer', 'Claro']) {
      aprenderResposta(afirmativas, 'Quer água?', r);
      aprenderResposta(afirmativas, 'Quer água?', r);
    }
    const a = sugerirRespostas('Quer água?', afirmativas);
    expect(temSim(a)).toBe(true);
    expect(temNao(a)).toBe(true);

    const negativas = modeloVazio();
    for (const r of ['Agora não', 'Não quero', 'Nada']) aprenderResposta(negativas, 'Quer água?', r);
    const n = sugerirRespostas('Quer água?', negativas);
    expect(temSim(n)).toBe(true);
    expect(temNao(n)).toBe(true);
  });
});

describe('sugerirRespostas — por intenção', () => {
  it('escolha: as opções saem da própria pergunta', () => {
    const r = sugerirRespostas('Quer chá ou café?', modeloVazio());
    expect(r.slice(0, 2)).toEqual(['Chá', 'Café']);
    expect(r).toContain('Os dois');
    expect(intencaoDaPergunta('Quer chá ou café?')).toBe('escolha');
  });

  it('escolha com artigo e com três opções', () => {
    expect(sugerirRespostas('Quer o ventilador ou o ar condicionado?', modeloVazio()).slice(0, 2)).toEqual([
      'O ventilador',
      'O ar condicionado',
    ]);
    const tres = sugerirRespostas('Quer chá, café ou leite?', modeloVazio());
    expect(tres).toEqual(['Chá', 'Café', 'Leite', 'Nenhum']);
  });

  it('"ou não" não é escolha: é pergunta de sim/não', () => {
    expect(intencaoDaPergunta('Quer sair ou não?')).not.toBe('escolha');
    const r = sugerirRespostas('Quer sair ou não?', modeloVazio());
    expect(temSim(r)).toBe(true);
    expect(temNao(r)).toBe(true);
  });

  it('comida e bebida: aceita, recusa, ou só um pouco', () => {
    const r = sugerirRespostas('Quer água?', modeloVazio());
    expect(intencaoDaPergunta('Quer água?')).toBe('comida-e-bebida');
    expect(r).toEqual(['Sim, por favor', 'Não, obrigado', 'Só um pouco', 'Mais tarde']);
    expect(intencaoDaPergunta('Está com sede?')).toBe('comida-e-bebida');
    expect(intencaoDaPergunta('Está com fome?')).toBe('comida-e-bebida');
  });

  it('posição: "assim está bom" é a negativa natural', () => {
    const r = sugerirRespostas('Quer mudar de posição?', modeloVazio());
    expect(intencaoDaPergunta('Quer mudar de posição?')).toBe('posicao');
    expect(r).toEqual(['Sim, por favor', 'Não, assim está bom', 'Daqui a pouco', 'Um pouco mais']);
  });

  it('chamar alguém: autoriza, dispensa ou adia', () => {
    expect(sugerirRespostas('Quer que eu chame alguém?', modeloVazio())).toEqual([
      'Sim, por favor',
      'Não precisa',
      'Daqui a pouco',
    ]);
  });

  it('"como você está?" é aberta: responde com o estado, e não com sim/não', () => {
    const r = sugerirRespostas('Como você está?', modeloVazio());
    expect(intencaoDaPergunta('Como você está?')).toBe('como-esta');
    expect(r).toEqual(['Estou bem', 'Não estou bem', 'Mais ou menos', 'Estou cansado']);
  });

  it('"tudo bem?" é fechada: começa pelo sim e pelo não', () => {
    const r = sugerirRespostas('Tudo bem?', modeloVazio());
    expect(intencaoDaPergunta('Tudo bem?')).toBe('bem-estar');
    expect(r).toEqual(['Sim, estou bem', 'Não estou bem', 'Mais ou menos', 'Estou cansado']);
  });

  it('oferta genérica: sim, não, adiar, não sei', () => {
    const r = sugerirRespostas('Vamos passear?', modeloVazio());
    expect(intencaoDaPergunta('Vamos passear?')).toBe('oferta');
    expect(r).toEqual(['Sim, por favor', 'Não, obrigado', 'Daqui a pouco', 'Não sei']);
  });

  it('escolha depois da vírgula: "qual você prefere, chá ou café?"', () => {
    expect(sugerirRespostas('Qual você prefere, chá ou café?', modeloVazio()).slice(0, 2)).toEqual(['Chá', 'Café']);
    expect(sugerirRespostas('Onde você quer ficar, na sala ou no quarto?', modeloVazio()).slice(0, 2)).toEqual([
      'Na sala',
      'No quarto',
    ]);
    // Sem as opções depois da vírgula, a pergunta continua aberta.
    expect(intencaoDaPergunta('Qual você prefere?')).toBe('aberta');
  });

  it('saudação: devolve a mesma saudação, sem "bom dia" para "boa noite"', () => {
    expect(sugerirRespostas('Bom dia!', modeloVazio())[0]).toBe('Bom dia');
    expect(sugerirRespostas('Boa tarde!', modeloVazio())[0]).toBe('Boa tarde');
    const noite = sugerirRespostas('Boa noite', modeloVazio());
    expect(noite[0]).toBe('Boa noite');
    expect(noite).not.toContain('Bom dia');
    expect(sugerirRespostas('Cheguei!', modeloVazio())).toContain('Que bom que você chegou');
  });

  it('despedida, mesmo sem ponto de interrogação', () => {
    expect(sugerirRespostas('Já volto', modeloVazio())).toContain('Não demore');
  });

  it('pergunta fechada sem assunto conhecido cai em sim, não, não sei, espere', () => {
    const r = sugerirRespostas('O joelho está apoiado?', modeloVazio());
    expect(intencaoDaPergunta('O joelho está apoiado?')).toBe('simnao');
    expect(r).toEqual(['Sim', 'Não', 'Não sei', 'Espere um pouco']);
  });

  it('o assunto da pergunta vence a saudação que vem junto', () => {
    expect(intencaoDaPergunta('Bom dia! Quer água?')).toBe('comida-e-bebida');
    expect(intencaoDaPergunta('Boa noite, tudo bem?')).toBe('bem-estar');
  });
});

describe('sugerirRespostas — o que não merece sugestão', () => {
  it('pergunta aberta sem histórico: nada a oferecer (a faixa nem aparece)', () => {
    expect(intencaoDaPergunta('O que você quer comer?')).toBe('aberta');
    expect(sugerirRespostas('O que você quer comer?', modeloVazio())).toEqual([]);
    expect(sugerirRespostas('Quando você quer ir?', modeloVazio())).toEqual([]);
    // "quer" não pode puxar a oferta de sim/não para uma pergunta aberta.
    expect(sugerirRespostas('Onde você quer ficar?', modeloVazio())).toEqual([]);
  });

  it('pergunta aberta com histórico: só o que o paciente já respondeu', () => {
    const m = modeloVazio();
    aprenderResposta(m, 'O que você quer comer?', 'Sopa');
    aprenderResposta(m, 'O que você quer comer?', 'Sopa');
    aprenderResposta(m, 'O que você quer comer?', 'Fruta');
    expect(sugerirRespostas('O que você quer comer?', m)).toEqual(['Sopa', 'Fruta']);
  });

  it('mensagem que não é pergunta nem assunto conhecido: nenhuma sugestão', () => {
    expect(intencaoDaPergunta('Já estou indo')).toBe('nenhuma');
    expect(sugerirRespostas('Já estou indo', modeloVazio())).toEqual([]);
    expect(sugerirRespostas('', modeloVazio())).toEqual([]);
    expect(sugerirRespostas('   ', modeloVazio())).toEqual([]);
  });
});

describe('sugerirRespostas — o paciente é o melhor preditor de si mesmo', () => {
  it('o que ele respondeu a esta pergunta vem primeiro', () => {
    const m = modeloVazio();
    aprenderResposta(m, 'Quer água?', 'Só um gole');
    aprenderResposta(m, 'Quer água?', 'Só um gole');
    const r = sugerirRespostas('Quer água?', m);
    expect(r[0]).toBe('Só um gole');
    expect(temSim(r)).toBe(true);
    expect(temNao(r)).toBe(true);
    expect(r.length).toBe(4);
  });

  it('acento, maiúscula e pontuação da pergunta não atrapalham o casamento', () => {
    const m = modeloVazio();
    aprenderResposta(m, 'Quer água?', 'Só um gole');
    expect(sugerirRespostas('QUER AGUA', m)[0]).toBe('Só um gole');
    expect(sugerirRespostas('quer água!!', m)[0]).toBe('Só um gole');
  });

  it('a mais dita vem antes da menos dita', () => {
    const m = modeloVazio();
    aprenderResposta(m, 'Quer água?', 'Depois');
    for (let i = 0; i < 3; i++) aprenderResposta(m, 'Quer água?', 'Sim, um copo');
    expect(sugerirRespostas('Quer água?', m).slice(0, 2)).toEqual(['Sim, um copo', 'Depois']);
  });

  it('nunca repete uma resposta, ignorando acento e maiúscula', () => {
    const m = modeloVazio();
    aprenderResposta(m, 'Quer água?', 'sim, por favor');
    const r = sugerirRespostas('Quer água?', m);
    const chaves = r.map((x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('resposta comprida demais para um botão fica de fora', () => {
    const m = modeloVazio();
    aprenderResposta(m, 'Quer água?', 'Sim, por favor, traga um copo de água gelada com limão e gelo');
    const r = sugerirRespostas('Quer água?', m);
    expect(r.every((x) => x.length <= 42)).toBe(true);
    expect(r[0]).toBe('Sim, por favor');
  });

  it('é uma consulta: não mexe no modelo', () => {
    const m = modeloVazio();
    aprenderResposta(m, 'Quer água?', 'Só um gole');
    const antes = JSON.stringify(m);
    sugerirRespostas('Quer água?', m);
    sugerirRespostas('Quer chá ou café?', m);
    expect(JSON.stringify(m)).toBe(antes);
  });
});

describe('ehPerguntaDeSimNao', () => {
  it.each(PERGUNTAS_DE_SIM_OU_NAO)('"%s" é de sim/não', (pergunta) => {
    expect(ehPerguntaDeSimNao(pergunta)).toBe(true);
  });

  it.each([
    'O que você quer comer?',
    'Onde dói?',
    'Quanto dói?',
    'Tem dor?',
    'Está com dor?',
    'Dói muito?',
    'Quer chá ou café?',
    'Como você está?',
    'Bom dia!',
    'Já estou indo',
    '',
  ])('"%s" não é', (pergunta) => {
    expect(ehPerguntaDeSimNao(pergunta)).toBe(false);
  });
});

// Decisão do coordenador (21/10/2026, rodada de correção 1 da Task 7): o spec
// diz "nunca na dor", e uma resposta pronta com o sentido trocado sobre dor é
// perigosa — "A dor passou?" respondida por "Sim, estou com dor" diz o contrário
// do que o paciente quis, na voz dele e no celular do cuidador. Por isso NENHUMA
// resposta sugerida — nem pronta, nem aprendida — para pergunta que fale de dor.
// A faixa não aparece; o paciente responde pelo teclado ou pelo mapa da dor.
describe('sugerirRespostas — nunca na dor', () => {
  const PERGUNTAS_DE_DOR = [
    'Está com dor?',
    'A dor passou?',
    'A dor melhorou?',
    'O remédio aliviou a dor?',
    'Onde dói?',
    'Quanto dói de 0 a 10?',
    'Está doendo?',
  ];

  it.each(PERGUNTAS_DE_DOR)('"%s": nenhuma sugestão', (pergunta) => {
    expect(sugerirRespostas(pergunta, modeloVazio())).toEqual([]);
  });

  it.each(PERGUNTAS_DE_DOR)('"%s": nenhuma sugestão nem do que o paciente já respondeu', (pergunta) => {
    const m = modeloVazio();
    for (const r of ['Sim, estou com dor', 'Um pouco', 'Nas costas']) {
      aprenderResposta(m, pergunta, r);
      aprenderResposta(m, pergunta, r);
    }
    expect(sugerirRespostas(pergunta, m)).toEqual([]);
    expect(sugerirRespostas(pergunta, m, { maximo: 2 })).toEqual([]);
  });

  it.each([
    'Tem dor?',
    'Dói muito?',
    'Dói aqui?',
    'Está com muita dor?',
    'Ainda sente dor?',
    'Sente dores?',
    'Onde está doendo?',
    'Está dolorido?',
    'Está dolorida?',
    'Machuca?',
    'Isso machucou?',
    'Incomoda?',
    'O travesseiro incomoda?',
    'Quer remédio para a dor?',
    'Quer que eu massageie onde dói?',
    'Dói na perna ou no braço?',
    'Onde dói, nas costas ou na perna?',
    'Como está a dor?',
    'ESTÁ COM DOR',
    'esta doendo',
  ])('outra forma de perguntar por dor ("%s"): nenhuma sugestão', (pergunta) => {
    expect(sugerirRespostas(pergunta, modeloVazio())).toEqual([]);
  });

  it('as intenções de dor continuam nomeadas, e nenhuma delas pede sim/não', () => {
    expect(intencaoDaPergunta('Está com dor?')).toBe('dor');
    expect(intencaoDaPergunta('A dor passou?')).toBe('dor');
    expect(intencaoDaPergunta('Onde dói?')).toBe('dor-onde');
    expect(intencaoDaPergunta('Quanto dói de 0 a 10?')).toBe('dor-quanto');
    for (const p of ['Está com dor?', 'Onde dói?', 'Quanto dói de 0 a 10?']) expect(ehPerguntaDeSimNao(p)).toBe(false);
  });

  it('uma pergunta comum continua com sugestões', () => {
    const r = sugerirRespostas('Quer água?', modeloVazio());
    expect(r).toEqual(['Sim, por favor', 'Não, obrigado', 'Só um pouco', 'Mais tarde']);
    expect(intencaoDaPergunta('Quer água?')).toBe('comida-e-bebida');
  });

  it('só a palavra inteira conta: "dormir", "calor" e "amor" não são dor', () => {
    for (const p of ['Quer dormir?', 'Está com calor?', 'Quer ouvir uma música de amor?']) {
      expect(sugerirRespostas(p, modeloVazio()).length, p).toBeGreaterThanOrEqual(2);
    }
  });

  it('a dor na resposta do paciente não muda nada: o que vale é a pergunta', () => {
    const m = modeloVazio();
    aprenderResposta(m, 'Quer água?', 'Estou com dor');
    expect(sugerirRespostas('Quer água?', m)).toContain('Estou com dor');
  });
});
