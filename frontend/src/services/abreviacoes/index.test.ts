import { beforeEach, describe, expect, it } from 'vitest';
import { LICENSE_KEY } from '../../context/LicenseContext';
import { definirAssistenteDesligado } from '../assistente';
import { reiniciarParaTeste } from '../assistente/armazenamento';
import { aprenderAbreviacoesDaFala, expansaoParaOTexto, salvarAbreviacao } from './index';

// `expansaoParaOTexto` é o que o teclado chama a cada mudança do texto: junta o
// dicionário do paciente com a regra de "o assistente está ligado?".

beforeEach(() => {
  localStorage.clear();
  reiniciarParaTeste();
});

describe('expansaoParaOTexto', () => {
  it('oferece a expansão da palavra que está sendo escrita, na caixa do teclado', () => {
    expect(expansaoParaOTexto('OBG')).toBe('OBRIGADO');
    expect(expansaoParaOTexto('QUERO PFV')).toBe('POR FAVOR');
    expect(expansaoParaOTexto('N')).toBe('NÃO');
  });

  it('depois do espaço, ou sem nada escrito, não oferece nada', () => {
    expect(expansaoParaOTexto('OBG ')).toBeNull();
    expect(expansaoParaOTexto('')).toBeNull();
  });

  it('usa o que a pessoa acrescentou e o que o aparelho aprendeu', () => {
    salvarAbreviacao('ctz', 'certeza');
    for (let i = 0; i < 3; i++) aprenderAbreviacoesDaFala('Estou com dor');
    expect(expansaoParaOTexto('CTZ')).toBe('CERTEZA');
    expect(expansaoParaOTexto('ECD')).toBe('ESTOU COM DOR');
  });

  it('com as sugestões desligadas nos ajustes, o chip também some', () => {
    definirAssistenteDesligado(true);
    expect(expansaoParaOTexto('OBG')).toBeNull();
    definirAssistenteDesligado(false);
    expect(expansaoParaOTexto('OBG')).toBe('OBRIGADO');
  });

  it('com o plano sem assistente, o chip some', () => {
    localStorage.setItem(LICENSE_KEY, JSON.stringify({ plan: { features: { assistente: false } } }));
    expect(expansaoParaOTexto('OBG')).toBeNull();
  });

  it('desligar as sugestões não impede de aprender: ao religar a sigla está lá', () => {
    definirAssistenteDesligado(true);
    for (let i = 0; i < 3; i++) aprenderAbreviacoesDaFala('Estou com dor');
    definirAssistenteDesligado(false);
    expect(expansaoParaOTexto('ECD')).toBe('ESTOU COM DOR');
  });
});
