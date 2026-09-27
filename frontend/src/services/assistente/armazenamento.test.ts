import { beforeEach, describe, expect, it } from 'vitest';
import {
  apagarModeloDoPerfil,
  CHAVE_DO_MODELO,
  carregarModelo,
  chaveDoModeloDoPerfil,
  definirPerfilDoAssistente,
  descarregar,
  registrarFala,
  reiniciarParaTeste,
} from './armazenamento';

// FE-11: o modelo do assistente tinha uma chave só. O paciente B recebia como
// sugestão as frases que o paciente A tinha falado — dado de saúde vazando
// entre quem divide o computador, contra a promessa da tela de perfis.

const frasesDe = () => Object.values(carregarModelo().frases).map((f) => f.texto);

beforeEach(() => {
  localStorage.clear();
  reiniciarParaTeste();
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
