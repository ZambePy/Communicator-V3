import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import i18n from '../../i18n';
import { IntroScreen } from './IntroScreen';
import { INTRO_SEEN_KEY } from './bootDestination';

// -----------------------------------------------------------------------------
// Boas-vindas: símbolo, nome, UMA frase e UM botão. Zero parágrafos — a
// explicação que convence é a experiência dos próximos três minutos.
// -----------------------------------------------------------------------------

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/intro']}>
      <Routes>
        <Route path="/intro" element={<IntroScreen />} />
        <Route path="/login" element={<div>tela de login</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('o que a tela conta', () => {
  it('o nome do produto e a frase — e só', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'IrisFlow Communicator' })).toBeInTheDocument();
    expect(screen.getByText('Sua voz começa pelo seu olhar.')).toBeInTheDocument();
    // Nenhum parágrafo de explicação: não há texto corrido além da frase.
    expect(document.querySelectorAll('main p')).toHaveLength(1);
  });

  it('o símbolo animado está na tela, fora da árvore acessível', () => {
    montar();
    expect(document.querySelector('.iris-simbolo')).toHaveAttribute('aria-hidden', 'true');
  });

  it('há um único botão de ação além do idioma', () => {
    montar();
    const botoes = screen
      .getAllByRole('button')
      .filter((b) => !b.closest('[role="group"]'));
    expect(botoes).toHaveLength(1);
    expect(botoes[0]).toHaveTextContent(/começar/i);
  });
});

describe('escolha de idioma', () => {
  it('oferece o seletor', () => {
    montar();
    expect(screen.getByRole('button', { name: /portugu|português/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /english|inglês/i })).toBeInTheDocument();
  });

  it('troca o texto da própria tela ao mudar o idioma', () => {
    // O seletor precisa valer já aqui. Se só valesse depois, o cuidador
    // escolheria "English" e continuaria lendo português.
    montar();
    fireEvent.click(screen.getByRole('button', { name: /english|inglês/i }));
    expect(screen.getByText('Your voice begins with your gaze.')).toBeInTheDocument();
  });
});

describe('o botão Começar', () => {
  it('leva ao login', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /começar/i }));
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });

  it('marca a apresentação como vista, para não repetir todo boot', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /começar/i }));
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('true');
  });
});
