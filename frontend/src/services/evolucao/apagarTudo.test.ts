import { describe, it, expect, beforeEach } from 'vitest';
import { clearClinicalData, definirPerfilAtivo, perfilAtivoDoHistorico, setConsent } from '../../utils/clinicalLogger';
import { chaveDasPerguntas, chaveDoDiario, chaveDoUso, chavesDoAcompanhamentoDoPerfil } from './chaves';

// A promessa de Configurações é "Todos os dados clínicos locais foram
// excluídos" (ao apagar, e ao retirar a autorização). A evolução semanal, o
// diário da consulta (dor, sono, humor, nota) e as perguntas ao médico são
// dado de saúde guardado neste computador: se ficassem, a promessa seria falsa
// justamente para o que o paciente tem de mais íntimo.

const dados = (perfil: string) => ({
  uso: chaveDoUso(perfil),
  diario: chaveDoDiario(perfil),
  perguntas: chaveDasPerguntas(perfil),
});

describe('chaves locais do acompanhamento', () => {
  it('todas começam com "irisflow." (o prefixo das chaves do app) e são por paciente', () => {
    for (const chave of chavesDoAcompanhamentoDoPerfil('p1')) {
      expect(chave.startsWith('irisflow.')).toBe(true);
      expect(chave.endsWith('p1')).toBe(true);
    }
    expect(new Set(chavesDoAcompanhamentoDoPerfil('p1')).size).toBe(3);
    expect(chavesDoAcompanhamentoDoPerfil('p1')).not.toEqual(chavesDoAcompanhamentoDoPerfil('p2'));
  });
});

describe('apagar os dados clínicos leva junto o acompanhamento do paciente', () => {
  beforeEach(() => {
    definirPerfilAtivo('p1');
    for (const perfil of ['p1', 'p2']) {
      for (const chave of Object.values(dados(perfil))) localStorage.setItem(chave, '{"versao":1}');
    }
  });

  it('o paciente ativo é lido de fora do módulo', () => {
    expect(perfilAtivoDoHistorico()).toBe('p1');
    definirPerfilAtivo(null);
    expect(perfilAtivoDoHistorico()).toBeNull();
  });

  it('"Excluir todos os dados clínicos" apaga uso, diário e perguntas do ativo e deixa os do outro', () => {
    clearClinicalData();
    for (const chave of Object.values(dados('p1'))) expect(localStorage.getItem(chave)).toBeNull();
    for (const chave of Object.values(dados('p2'))) expect(localStorage.getItem(chave)).not.toBeNull();
  });

  it('retirar a autorização também apaga', () => {
    setConsent(false);
    for (const chave of Object.values(dados('p1'))) expect(localStorage.getItem(chave)).toBeNull();
    for (const chave of Object.values(dados('p2'))) expect(localStorage.getItem(chave)).not.toBeNull();
  });

  it('sem paciente escolhido não apaga o de ninguém', () => {
    definirPerfilAtivo(null);
    clearClinicalData();
    for (const perfil of ['p1', 'p2']) {
      for (const chave of Object.values(dados(perfil))) expect(localStorage.getItem(chave)).not.toBeNull();
    }
  });
});
