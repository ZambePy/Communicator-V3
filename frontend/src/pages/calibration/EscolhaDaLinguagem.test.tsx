import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import i18n from '../../i18n';
import { AjusteDaLinguagem, PerguntaDaLinguagem } from './EscolhaDaLinguagem';
import { alvoMinimoPx } from '../../design/gazeMetrics';

// -----------------------------------------------------------------------------
// Palavras ou números (pedido de 19/10/2026): o mesmo par de botões na pergunta
// de uma vez (começo da calibração) e em Configurações. Os dois precisam ser
// acionáveis pelo olhar, pelo mouse e pelo teclado.
// -----------------------------------------------------------------------------

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

const opcoes = () => [screen.getByTestId('linguagem-simples'), screen.getByTestId('linguagem-tecnica')];

describe('a pergunta de uma vez', () => {
  it('pergunta em pt-BR, com as duas opções e a nota de que dá para mudar depois', () => {
    render(<PerguntaDaLinguagem aoEscolher={vi.fn()} />);
    expect(screen.getByText(/como você prefere ver o resultado/i)).toBeInTheDocument();
    expect(screen.getByText('Em palavras simples')).toBeInTheDocument();
    expect(screen.getByText('Com os números')).toBeInTheDocument();
    expect(screen.getByText(/mudar depois em Configurações/i)).toBeInTheDocument();
  });

  it('nenhuma opção vem marcada: é uma pergunta, não um padrão escondido', () => {
    render(<PerguntaDaLinguagem aoEscolher={vi.fn()} />);
    for (const b of opcoes()) expect(b).toHaveAttribute('aria-checked', 'false');
  });

  it('pelo olhar: alvos de recuperação, dwell longo e do tamanho mínimo de 5°', () => {
    render(<PerguntaDaLinguagem aoEscolher={vi.fn()} />);
    for (const b of opcoes()) {
      expect(b.dataset.recovery).toBe('true');
      expect(Number(b.dataset.dwellMs)).toBeGreaterThanOrEqual(2000);
      // A zona de acerto soma 12 px de cada lado.
      expect(parseFloat(b.style.width) + 24).toBeGreaterThanOrEqual(alvoMinimoPx());
      expect(parseFloat(b.style.height) + 24).toBeGreaterThanOrEqual(alvoMinimoPx());
    }
  });

  it('pelo mouse e pelo teclado: são botões de verdade', () => {
    const aoEscolher = vi.fn();
    render(<PerguntaDaLinguagem aoEscolher={aoEscolher} />);
    const [simples, tecnica] = opcoes();
    expect(simples.tagName).toBe('BUTTON');
    expect(simples).toHaveAttribute('type', 'button');
    // Enter/Espaço num <button> nativo disparam o clique; o foco chega pelo Tab.
    simples.focus();
    expect(document.activeElement).toBe(simples);
    fireEvent.click(tecnica);
    expect(aoEscolher).toHaveBeenCalledWith('tecnica');
  });
});

describe('em Configurações', () => {
  it('mostra a escolha atual e muda com um clique', () => {
    const aoEscolher = vi.fn();
    render(<AjusteDaLinguagem valor="tecnica" aoEscolher={aoEscolher} />);
    expect(screen.getByTestId('linguagem-tecnica')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('linguagem-simples')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Resultado da calibração')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('linguagem-simples'));
    expect(aoEscolher).toHaveBeenCalledWith('simples');
  });

  it('é um grupo de opções para o leitor de tela', () => {
    render(<AjusteDaLinguagem valor={null} aoEscolher={vi.fn()} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});
