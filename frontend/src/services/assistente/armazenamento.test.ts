import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apagarModelo,
  apagarModeloDoPerfil,
  CHAVE_DO_MODELO,
  carregarModelo,
  chaveDoModeloDoPerfil,
  definirPerfilDoAssistente,
  descarregar,
  perfilDoAssistente,
  esquecerSemGravar,
  registrarFala,
  reiniciarParaTeste,
} from './armazenamento';
import {
  BASE_DAS_ABREVIACOES,
  BASE_DAS_FALAS,
  BASE_DA_ACEITACAO,
  chaveDoPaciente,
  ouvirMudancaDoAprendizado,
} from './chavesPorPaciente';
import { _esquecerAvisosParaTeste } from './avisoUnico';

// FE-11: o modelo do assistente tinha uma chave só. O paciente B recebia como
// sugestão as frases que o paciente A tinha falado — dado de saúde vazando
// entre quem divide o computador, contra a promessa da tela de perfis.

const frasesDe = () => Object.values(carregarModelo().frases).map((f) => f.texto);

beforeEach(() => {
  localStorage.clear();
  reiniciarParaTeste();
  _esquecerAvisosParaTeste();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('vocabulário por paciente', () => {
  it('o que Ana falou não aparece para Bruno', () => {
    definirPerfilDoAssistente('ana');
    registrarFala('estou com dor nas costas');
    definirPerfilDoAssistente('bruno');
    expect(frasesDe()).toEqual([]);

    registrarFala('quero água');
    definirPerfilDoAssistente('ana');
    expect(frasesDe()).toEqual(['estou com dor nas costas']);
  });

  it('a troca grava o que estava pendente na chave do paciente anterior', () => {
    definirPerfilDoAssistente('ana');
    registrarFala('bom dia');
    definirPerfilDoAssistente('bruno');
    expect(localStorage.getItem(chaveDoModeloDoPerfil('ana'))).toContain('bom dia');
    expect(localStorage.getItem(chaveDoModeloDoPerfil('bruno'))).toBeNull();
  });

  it('o modelo de antes (sem dono) vai para o PRIMEIRO paciente, uma vez só', () => {
    localStorage.setItem(CHAVE_DO_MODELO, JSON.stringify({ versao: 1, palavras: { dor: 2 }, bigramas: {}, frases: { 'estou com dor': { texto: 'estou com dor', n: 1, em: 1 } }, respostas: {} }));
    definirPerfilDoAssistente('ana');
    expect(frasesDe()).toEqual(['estou com dor']);
    expect(localStorage.getItem(CHAVE_DO_MODELO)).toBeNull();

    definirPerfilDoAssistente('bruno');
    expect(frasesDe()).toEqual([]);
  });

  it('as palavras do preditor antigo também migram uma vez só', () => {
    localStorage.setItem('irisflow_user_words', JSON.stringify([{ word: 'costas', count: 3 }]));
    definirPerfilDoAssistente('ana');
    expect(carregarModelo().palavras.costas).toBe(3);
    definirPerfilDoAssistente('bruno');
    expect(carregarModelo().palavras.costas).toBeUndefined();
  });

  it('perfil removido: o que o assistente aprendeu com ele sai do computador', () => {
    definirPerfilDoAssistente('ana');
    registrarFala('te amo');
    descarregar();
    expect(localStorage.getItem(chaveDoModeloDoPerfil('ana'))).toContain('te amo');

    apagarModeloDoPerfil('ana');
    expect(localStorage.getItem(chaveDoModeloDoPerfil('ana'))).toBeNull();
    expect(frasesDe()).toEqual([]);
  });
});

// Abreviações e respostas sugeridas (rodada 3, 21/10/2026) guardam coisas por
// paciente ao lado do modelo. O que é DO paciente precisa sair com ele; o que a
// pessoa escreveu à mão não pode sumir num "Apagar o aprendizado".
describe('o que mais pertence ao paciente: abreviações, frases curtas e aceitação das sugestões', () => {
  const chaves = (id: string | null) => ({
    abreviacoes: chaveDoPaciente(BASE_DAS_ABREVIACOES, id),
    falas: chaveDoPaciente(BASE_DAS_FALAS, id),
    aceitacao: chaveDoPaciente(BASE_DA_ACEITACAO, id),
  });
  const preencher = (id: string | null) => {
    for (const chave of Object.values(chaves(id))) localStorage.setItem(chave, '{}');
  };

  it('as chaves começam com irisflow. e levam o paciente no fim', () => {
    expect(chaves('ana')).toEqual({
      abreviacoes: 'irisflow.abreviacoes.v1.ana',
      falas: 'irisflow.abreviacoes.falas.v1.ana',
      aceitacao: 'irisflow.sugestoes.aceitacao.v1.ana',
    });
    // Sem paciente escolhido vale a chave sem dono, como a do modelo.
    expect(chaves(null).abreviacoes).toBe('irisflow.abreviacoes.v1');
  });

  it('perfilDoAssistente() diz de quem é o modelo em uso', () => {
    expect(perfilDoAssistente()).toBeNull();
    definirPerfilDoAssistente('ana');
    expect(perfilDoAssistente()).toBe('ana');
    definirPerfilDoAssistente(null);
    expect(perfilDoAssistente()).toBeNull();
  });

  it('"Apagar o aprendizado" apaga as frases curtas e a aceitação, mas não as abreviações escritas à mão', () => {
    definirPerfilDoAssistente('ana');
    preencher('ana');
    preencher('bruno');
    apagarModelo();
    expect(localStorage.getItem(chaves('ana').falas)).toBeNull();
    expect(localStorage.getItem(chaves('ana').aceitacao)).toBeNull();
    expect(localStorage.getItem(chaves('ana').abreviacoes)).not.toBeNull();
    // Outro paciente do mesmo computador não é tocado.
    for (const chave of Object.values(chaves('bruno'))) expect(localStorage.getItem(chave)).not.toBeNull();
  });

  it('perfil removido: tudo dele sai do computador, e só dele', () => {
    preencher('ana');
    preencher('bruno');
    apagarModeloDoPerfil('ana');
    for (const chave of Object.values(chaves('ana'))) expect(localStorage.getItem(chave)).toBeNull();
    for (const chave of Object.values(chaves('bruno'))) expect(localStorage.getItem(chave)).not.toBeNull();
  });

  it('avisa quem acompanha o aprendizado (a tela de ajustes) quando ele é apagado', () => {
    let avisos = 0;
    const parar = ouvirMudancaDoAprendizado(() => avisos++);
    apagarModelo();
    expect(avisos).toBe(1);
    apagarModeloDoPerfil('ana');
    expect(avisos).toBe(2);
    parar();
    apagarModelo();
    expect(avisos).toBe(2);
  });

  // "Apagar" é a promessa de privacidade desta tela. Se o navegador não deixa remover
  // a chave, ninguém fica sabendo que o dado continua lá — a falha tem de aparecer no
  // console (uma vez: apagar é raro, mas não vale um log por chave nem por chamada).
  it('se o navegador não deixa apagar, não lança e avisa no console uma vez só', () => {
    definirPerfilDoAssistente('ana');
    preencher('ana');
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => {
      apagarModelo();
      apagarModelo();
      apagarModeloDoPerfil('ana');
    }).not.toThrow();
    const dessas = aviso.mock.calls.filter(([mensagem]) => String(mensagem).includes('não deixou apagar'));
    expect(dessas).toHaveLength(1);
    // Quem acompanha o aprendizado ainda é avisado: a tela relê e mostra a verdade.
    let avisos = 0;
    const parar = ouvirMudancaDoAprendizado(() => avisos++);
    apagarModelo();
    parar();
    expect(avisos).toBe(1);
  });
});

// Restaurar um backup (rodada 3, 21/10/2026) grava o vocabulário do backup direto
// no `localStorage` e recarrega a página. Mas a janela tem, na memória, o
// modelo ANTIGO — e `main.tsx` grava a memória ao fechar (`pagehide` →
// `descarregar`). Sem esquecer a memória antes, a recarga desfaria a
// restauração: o vocabulário do backup seria sobrescrito pelo de antes.
describe('esquecerSemGravar — a restauração de um backup', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const modeloComFrase = (texto: string) =>
    JSON.stringify({ versao: 1, palavras: {}, bigramas: {}, frases: { [texto]: { texto, n: 1, em: 1 } }, respostas: {} });

  it('o que estava na memória, ainda sem gravar, NÃO sobrescreve o que a restauração gravou — nem pelo relógio, nem ao fechar a janela', () => {
    definirPerfilDoAssistente('ana');
    registrarFala('frase de antes da restauração'); // na memória; a gravação está adiada

    esquecerSemGravar();
    localStorage.setItem(chaveDoModeloDoPerfil('ana'), modeloComFrase('frase do backup')); // a restauração
    vi.advanceTimersByTime(5000); // o adiamento vence
    descarregar(); // `pagehide` da recarga

    const gravado = localStorage.getItem(chaveDoModeloDoPerfil('ana')) ?? '';
    expect(gravado).toContain('frase do backup');
    expect(gravado).not.toContain('antes da restauração');
  });

  it('o assistente continua sendo da mesma paciente: o que ela falar depois vai para a chave dela, não para a global', () => {
    definirPerfilDoAssistente('ana');
    registrarFala('antes');

    esquecerSemGravar();
    registrarFala('depois');
    descarregar();

    expect(localStorage.getItem(chaveDoModeloDoPerfil('ana'))).toContain('depois');
    expect(localStorage.getItem(CHAVE_DO_MODELO)).toBeNull();
  });

  it('a próxima leitura vem do armazenamento (o que a restauração gravou), não da memória velha', () => {
    definirPerfilDoAssistente('ana');
    registrarFala('frase velha');

    esquecerSemGravar();
    localStorage.setItem(chaveDoModeloDoPerfil('ana'), modeloComFrase('frase do backup'));

    expect(frasesDe()).toEqual(['frase do backup']);
  });
});
