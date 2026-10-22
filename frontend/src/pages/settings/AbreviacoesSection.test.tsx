import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { AbreviacoesSection } from './AbreviacoesSection';
import {
  MAX_SIGNIFICADO,
  SEMENTES,
  aprenderAbreviacoesDaFala,
  dicionarioDasAbreviacoes,
  salvarAbreviacao,
  sementesAlteradasDoPaciente,
} from '../../services/abreviacoes';
import { apagarModelo, reiniciarParaTeste } from '../../services/assistente/armazenamento';
import { _esquecerAvisosParaTeste } from '../../services/assistente/avisoUnico';
import {
  AMOSTRA_MINIMA,
  lerAceitacao,
  registrarSugestaoAceita,
  registrarSugestaoMostrada,
} from '../../services/assistente/aceitacao';

// Ajustes do cuidador: as abreviações do paciente e a medida das respostas
// sugeridas (roadmap 1 e 2, rodada 3, 21/10/2026). Tela de mouse e teclado.

beforeEach(() => {
  localStorage.clear();
  reiniciarParaTeste();
  _esquecerAvisosParaTeste();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const linha = (sigla: string) => screen.getByTestId(`abreviacao-${sigla}`);
const escrever = (sigla: string, significado: string) => {
  fireEvent.change(screen.getByLabelText('Abreviação'), { target: { value: sigla } });
  fireEvent.change(screen.getByLabelText('Significado'), { target: { value: significado } });
};
const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar abreviação' }));

describe('a lista de abreviações', () => {
  it('mostra as catorze de fábrica, cada uma com o significado e a origem', () => {
    render(<AbreviacoesSection />);
    expect(within(screen.getByTestId('lista-de-abreviacoes')).getAllByRole('listitem')).toHaveLength(
      Object.keys(SEMENTES).length,
    );
    const obg = linha('obg');
    expect(obg).toHaveTextContent('obg');
    expect(obg).toHaveTextContent('obrigado');
    expect(obg).toHaveTextContent('de fábrica');
  });

  it('as aprendidas com as frases que o paciente escreve entram na lista, com a origem dita', () => {
    for (let i = 0; i < 3; i++) aprenderAbreviacoesDaFala('Estou com dor');
    render(<AbreviacoesSection />);
    expect(linha('ecd')).toHaveTextContent('Estou com dor');
    expect(linha('ecd')).toHaveTextContent('aprendida');
  });

  it('apagar o aprendizado pelos ajustes tira as aprendidas da lista, sem recarregar a tela', () => {
    for (let i = 0; i < 3; i++) aprenderAbreviacoesDaFala('Estou com dor');
    render(<AbreviacoesSection />);
    expect(screen.getByTestId('abreviacao-ecd')).toBeInTheDocument();
    act(() => apagarModelo());
    expect(screen.queryByTestId('abreviacao-ecd')).toBeNull();
    // As de fábrica e as da pessoa não são "aprendizado": ficam.
    expect(screen.getByTestId('abreviacao-obg')).toBeInTheDocument();
  });
});

describe('acrescentar', () => {
  it('guarda a abreviação, mostra na lista como feita pela pessoa, confirma e limpa o formulário', () => {
    render(<AbreviacoesSection />);
    escrever('ctz', 'certeza');
    guardar();
    expect(dicionarioDasAbreviacoes().ctz).toBe('certeza');
    expect(linha('ctz')).toHaveTextContent('certeza');
    expect(linha('ctz')).toHaveTextContent('feita por você');
    expect(screen.getByTestId('abreviacoes-aviso')).toHaveTextContent('ctz');
    expect(screen.getByLabelText('Abreviação')).toHaveValue('');
    expect(screen.getByLabelText('Significado')).toHaveValue('');
  });

  it('a maiúscula e os espaços de quem digita não atrapalham', () => {
    render(<AbreviacoesSection />);
    escrever('  CTZ ', '  certeza  ');
    guardar();
    expect(dicionarioDasAbreviacoes().ctz).toBe('certeza');
  });

  it.each([
    ['sem abreviação', '', 'certeza', /Escreva a abreviação/],
    ['com espaço ou número', 'c t', 'certeza', /só letras/],
    ['comprida demais', 'abcdefghi', 'certeza', /até 8 letras/],
    ['sem significado', 'ctz', '   ', /o que a abreviação quer dizer/],
    ['com significado maior que a célula do teclado', 'ctz', 'a'.repeat(MAX_SIGNIFICADO + 1), /até 42 letras/],
    ['com significado igual à abreviação', 'ok', 'OK', /iguais/],
  ])('recusa %s com uma mensagem visível e não guarda nada', (_nome, sigla, significado, mensagem) => {
    render(<AbreviacoesSection />);
    const antes = JSON.stringify(dicionarioDasAbreviacoes());
    escrever(sigla, significado);
    guardar();
    expect(screen.getByRole('alert')).toHaveTextContent(mensagem);
    expect(JSON.stringify(dicionarioDasAbreviacoes())).toBe(antes);
  });

  it('a mensagem de erro some quando a pessoa volta a escrever', () => {
    render(<AbreviacoesSection />);
    escrever('', 'certeza');
    guardar();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Abreviação'), { target: { value: 'ctz' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o armazenamento cheio vira mensagem na tela (e uma linha no console), não um clique que não faz nada', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<AbreviacoesSection />);
    escrever('ctz', 'certeza');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota');
    });
    guardar();
    expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível guardar/);
    expect(aviso).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
    expect(dicionarioDasAbreviacoes().ctz).toBeUndefined();
  });
});

describe('editar, apagar e restaurar', () => {
  it('editar uma de fábrica muda o significado, marca "alterada" e liga o Restaurar', () => {
    render(<AbreviacoesSection />);
    expect(screen.getByRole('button', { name: 'Restaurar abreviações de fábrica' })).toBeDisabled();

    fireEvent.click(within(linha('pq')).getByRole('button', { name: 'Editar a abreviação pq' }));
    // A sigla fica travada na edição: trocar a sigla seria criar outra.
    expect(screen.getByLabelText('Abreviação')).toHaveValue('pq');
    expect(screen.getByLabelText('Abreviação')).toBeDisabled();
    expect(screen.getByLabelText('Significado')).toHaveValue('por que');

    fireEvent.change(screen.getByLabelText('Significado'), { target: { value: 'porque' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alteração' }));

    expect(dicionarioDasAbreviacoes().pq).toBe('porque');
    expect(linha('pq')).toHaveTextContent('porque');
    expect(linha('pq')).toHaveTextContent('alterada');
    expect(sementesAlteradasDoPaciente()).toBe(1);
    expect(screen.getByRole('button', { name: 'Restaurar abreviações de fábrica' })).toBeEnabled();
    // O formulário volta ao estado de acrescentar.
    expect(screen.getByLabelText('Abreviação')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Guardar abreviação' })).toBeInTheDocument();
  });

  it('cancelar a edição deixa tudo como estava', () => {
    render(<AbreviacoesSection />);
    fireEvent.click(within(linha('pq')).getByRole('button', { name: 'Editar a abreviação pq' }));
    fireEvent.change(screen.getByLabelText('Significado'), { target: { value: 'porque' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(dicionarioDasAbreviacoes().pq).toBe('por que');
    expect(screen.getByLabelText('Significado')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Guardar abreviação' })).toBeInTheDocument();
  });

  it('apagar tira a abreviação da lista e do dicionário', () => {
    render(<AbreviacoesSection />);
    fireEvent.click(within(linha('blz')).getByRole('button', { name: 'Apagar a abreviação blz' }));
    expect(screen.queryByTestId('abreviacao-blz')).toBeNull();
    expect(dicionarioDasAbreviacoes().blz).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Restaurar abreviações de fábrica' })).toBeEnabled();
  });

  it('restaurar devolve as de fábrica mudadas ou apagadas e guarda as feitas pela pessoa', () => {
    expect(salvarAbreviacao('ctz', 'certeza').ok).toBe(true);
    expect(salvarAbreviacao('pq', 'porque').ok).toBe(true);
    render(<AbreviacoesSection />);
    fireEvent.click(within(linha('blz')).getByRole('button', { name: 'Apagar a abreviação blz' }));

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar abreviações de fábrica' }));

    expect(dicionarioDasAbreviacoes().pq).toBe('por que');
    expect(dicionarioDasAbreviacoes().blz).toBe('beleza');
    expect(dicionarioDasAbreviacoes().ctz).toBe('certeza');
    expect(linha('pq')).not.toHaveTextContent('alterada');
    expect(screen.getByRole('button', { name: 'Restaurar abreviações de fábrica' })).toBeDisabled();
  });
});

describe('as respostas sugeridas', () => {
  it('sem nada contado, diz isso e deixa o botão de zerar desligado', () => {
    render(<AbreviacoesSection />);
    expect(screen.getByTestId('aceitacao')).toHaveTextContent(/ainda não apareceu nenhuma/i);
    expect(screen.getByRole('button', { name: /Zerar a contagem/ })).toBeDisabled();
  });

  it('conta as mostradas, as escolhidas e a taxa, e avisa que ainda são poucas para decidir', () => {
    for (let i = 0; i < 4; i++) registrarSugestaoMostrada(`m${i}`);
    registrarSugestaoAceita('m0');
    render(<AbreviacoesSection />);
    const bloco = screen.getByTestId('aceitacao');
    expect(bloco).toHaveTextContent('4 mostradas');
    expect(bloco).toHaveTextContent('1 escolhida');
    expect(bloco).toHaveTextContent('25%');
    expect(bloco).toHaveTextContent(`${AMOSTRA_MINIMA}`);
    expect(bloco).not.toHaveTextContent(/recolhida/i);
  });

  it('quando a faixa recolheu, diz por quê, e o botão devolve a faixa', () => {
    for (let i = 0; i < AMOSTRA_MINIMA; i++) registrarSugestaoMostrada(`m${i}`);
    render(<AbreviacoesSection />);
    expect(screen.getByTestId('aceitacao')).toHaveTextContent(/recolhida/i);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar a faixa de novo' }));

    expect(lerAceitacao().mostradas).toBe(0);
    expect(screen.getByTestId('aceitacao')).not.toHaveTextContent(/está recolhida/i);
  });

  it('o texto diz que nada é falado sozinho e que a faixa some em emergência e na dor', () => {
    render(<AbreviacoesSection />);
    const secao = screen.getByTestId('secao-abreviacoes');
    expect(secao).toHaveTextContent(/só são faladas se o paciente escolher/i);
    expect(secao).toHaveTextContent(/emergência/i);
    expect(secao).toHaveTextContent(/dor/i);
  });
});

describe('é tela do cuidador', () => {
  it('os botões que mudam dados não são alvo do olhar: quem olha a lista não apaga nada por acaso', () => {
    render(<AbreviacoesSection />);
    const botoes = within(screen.getByTestId('secao-abreviacoes')).getAllByRole('button');
    expect(botoes.length).toBeGreaterThan(14);
    for (const b of botoes) expect(b).toHaveAttribute('data-no-dwell', 'true');
  });

  it('cada campo tem rótulo e a seção tem título', () => {
    render(<AbreviacoesSection />);
    expect(screen.getByRole('region', { name: /Abreviações/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Abreviação')).toBeInTheDocument();
    expect(screen.getByLabelText('Significado')).toBeInTheDocument();
  });
});
