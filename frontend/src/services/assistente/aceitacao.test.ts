import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirPerfilDoAssistente, reiniciarParaTeste } from './armazenamento';
import { _esquecerAvisosParaTeste } from './avisoUnico';
import { BASE_DA_ACEITACAO, chaveDoPaciente, ouvirMudancaDoAprendizado } from './chavesPorPaciente';
import {
  AMOSTRA_MINIMA,
  TAXA_MINIMA,
  estaRecolhida,
  lerAceitacao,
  registrarSugestaoAceita,
  registrarSugestaoMostrada,
  sugestoesRecolhidas,
  zerarAceitacao,
} from './aceitacao';

// Roadmap 1: "o sistema mede quantas sugestões são aceitas. Abaixo de 30%, a
// faixa recolhe". Só contadores no computador — nada do conteúdo das conversas.

beforeEach(() => {
  localStorage.clear();
  reiniciarParaTeste();
  _esquecerAvisosParaTeste();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mostrar = (quantas: number, prefixo = 'm') => {
  for (let i = 0; i < quantas; i++) registrarSugestaoMostrada(`${prefixo}${i}`);
};

describe('contagem de mostradas e aceitas', () => {
  it('começa zerada e sem taxa', () => {
    expect(lerAceitacao()).toMatchObject({ mostradas: 0, aceitas: 0, taxa: null });
  });

  it('conta uma vez por mensagem, mesmo que a faixa seja desenhada de novo', () => {
    registrarSugestaoMostrada('a');
    registrarSugestaoMostrada('a');
    registrarSugestaoMostrada('b');
    expect(lerAceitacao().mostradas).toBe(2);
  });

  it('aceitar conta uma vez por mensagem, e a taxa é aceitas ÷ mostradas', () => {
    registrarSugestaoMostrada('a');
    registrarSugestaoMostrada('b');
    registrarSugestaoAceita('a');
    registrarSugestaoAceita('a');
    expect(lerAceitacao()).toMatchObject({ mostradas: 2, aceitas: 1, taxa: 0.5 });
  });

  it('aceitar uma sugestão cuja exibição não foi contada conta as duas: nunca há mais aceitas que mostradas', () => {
    registrarSugestaoAceita('z');
    expect(lerAceitacao()).toMatchObject({ mostradas: 1, aceitas: 1, taxa: 1 });
  });

  it('é por paciente', () => {
    definirPerfilDoAssistente('ana');
    registrarSugestaoMostrada('a');
    definirPerfilDoAssistente('bruno');
    expect(lerAceitacao().mostradas).toBe(0);
    definirPerfilDoAssistente('ana');
    expect(lerAceitacao().mostradas).toBe(1);
  });

  it('guarda só números e identificadores de mensagem, nunca texto de conversa', () => {
    registrarSugestaoMostrada('id-1');
    registrarSugestaoAceita('id-1');
    const bruto = localStorage.getItem(chaveDoPaciente(BASE_DA_ACEITACAO, null)) ?? '';
    expect(bruto).not.toMatch(/[a-zA-ZÀ-ú]{12,}/);
  });
});

describe('quando a faixa recolhe', () => {
  it('as constantes são as do roadmap: 30% e uma amostra de 20', () => {
    expect(TAXA_MINIMA).toBe(0.3);
    expect(AMOSTRA_MINIMA).toBe(20);
  });

  it('com menos de 20 mostradas nunca recolhe, por pior que seja a taxa', () => {
    mostrar(19);
    expect(sugestoesRecolhidas()).toBe(false);
  });

  it('20 mostradas e 5 aceitas (25%): recolhe', () => {
    mostrar(20);
    for (let i = 0; i < 5; i++) registrarSugestaoAceita(`m${i}`);
    expect(sugestoesRecolhidas()).toBe(true);
  });

  it('20 mostradas e 6 aceitas (30%): ainda não — é "abaixo de 30%"', () => {
    mostrar(20);
    for (let i = 0; i < 6; i++) registrarSugestaoAceita(`m${i}`);
    expect(sugestoesRecolhidas()).toBe(false);
  });

  it('a regra pura', () => {
    expect(estaRecolhida({ mostradas: 20, aceitas: 0 })).toBe(true);
    expect(estaRecolhida({ mostradas: 19, aceitas: 0 })).toBe(false);
    expect(estaRecolhida({ mostradas: 100, aceitas: 30 })).toBe(false);
    expect(estaRecolhida({ mostradas: 100, aceitas: 29 })).toBe(true);
  });

  it('zerar devolve a faixa e avisa quem acompanha', () => {
    mostrar(25);
    expect(sugestoesRecolhidas()).toBe(true);
    let avisos = 0;
    const parar = ouvirMudancaDoAprendizado(() => avisos++);
    zerarAceitacao();
    parar();
    expect(sugestoesRecolhidas()).toBe(false);
    expect(lerAceitacao().mostradas).toBe(0);
    expect(avisos).toBe(1);
  });
});

describe('quando o armazenamento falha', () => {
  it('dado corrompido: conta de novo do zero e avisa no console uma vez', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(chaveDoPaciente(BASE_DA_ACEITACAO, null), 'nao e json');
    expect(lerAceitacao().mostradas).toBe(0);
    lerAceitacao();
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('gravar sem espaço não lança e avisa uma vez só', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota');
    });
    expect(() => {
      registrarSugestaoMostrada('a');
      registrarSugestaoMostrada('b');
      registrarSugestaoAceita('a');
    }).not.toThrow();
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});
