import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import i18n from '../../i18n';
import { IntroScreen } from './IntroScreen';
import { INTRO_SEEN_KEY } from './bootDestination';

let statusDaLicenca: 'none' | 'active' | 'grace' | 'blocked' = 'none';
vi.mock('../../context/LicenseContext', () => ({
  useLicense: () => ({ status: statusDaLicenca }),
}));

// -----------------------------------------------------------------------------
// Boas-vindas: símbolo, nome, UMA frase e UM botão. Zero parágrafos — a
// explicação que convence é a experiência dos próximos três minutos.
// -----------------------------------------------------------------------------

beforeEach(async () => {
  statusDaLicenca = 'none';
  await i18n.changeLanguage('pt-BR');
});

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/intro']}>
      <Routes>
        <Route path="/intro" element={<IntroScreen />} />
        <Route path="/login" element={<div>tela de login</div>} />
        <Route path="/activated" element={<div>tela da conta pronta</div>} />
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

describe('idioma (FE-24)', () => {
  it('sem seletor enquanto só o português está completo', () => {
    // Oferecer "English" com metade das telas em português era pior do que
    // não oferecer a escolha (ver i18n/index.ts).
    montar();
    expect(screen.queryByRole('button', { name: /english|inglês/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /idioma|language/i })).not.toBeInTheDocument();
  });

  it('a tela sai em português mesmo num sistema em inglês', () => {
    montar();
    expect(screen.queryByText('Your voice begins with your gaze.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /começar/i })).toBeInTheDocument();
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

describe('rever a apresentação com a licença valendo', () => {
  // "Refazer a apresentação" (Configurações) volta para cá com a licença
  // ativa. O login pedia e-mail e senha de novo, sem "Voltar" — e offline não
  // havia como passar.
  it.each(['active', 'grace'] as const)('licença %s: pula o login e mostra a conta pronta', (status) => {
    statusDaLicenca = status;
    montar();
    fireEvent.click(screen.getByRole('button', { name: /começar/i }));
    expect(screen.getByText('tela da conta pronta')).toBeInTheDocument();
  });

  it('licença bloqueada: o login continua sendo o caminho', () => {
    statusDaLicenca = 'blocked';
    montar();
    fireEvent.click(screen.getByRole('button', { name: /começar/i }));
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });
});
