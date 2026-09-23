import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { MainMenu } from './MainMenu';
import { guardarPasso, limparMissoes } from './tutorial/missao';

/**
 * O menu principal precisa de uma volta ao tutorial pelo olhar.
 *
 * As missões mandam a pessoa para as telas reais, e as saídas próprias dessas
 * telas levam ao menu. Sem este cartão, quem chegava aqui no meio do tutorial
 * ficava fora dele — sem nenhum alvo que o trouxesse de volta.
 */
vi.mock('../cloud/CloudContext', () => ({ useCloud: () => ({ naoFaladas: 0 }) }));
vi.mock('../context/ReminderContext', () => ({
  useReminders: () => ({ activeReminder: null, dismissActiveReminder: vi.fn() }),
}));
vi.mock('../components/ui/EstadoDaSessao', () => ({ EstadoDaSessao: () => null }));
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()) }),
  useIsDwelling: () => false,
}));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const montar = () =>
  render(
    <MemoryRouter>
      <MainMenu />
    </MemoryRouter>
  );

describe('MainMenu', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pt-BR');
    navigate.mockClear();
    sessionStorage.clear();
  });

  it('nomeia o módulo de lazer com o mesmo nome que a tela e o tutorial usam', () => {
    montar();
    expect(screen.getByText('Lazer e bem-estar')).toBeInTheDocument();
    expect(screen.queryByText('Ajuda e Lazer')).toBeNull();
    // Textos via i18n, não fixos em português.
    expect(screen.getByText('Comunicação')).toBeInTheDocument();
  });

  it('sem tutorial em curso não há cartão de continuar', () => {
    montar();
    expect(screen.queryByRole('button', { name: 'Continuar o tutorial' })).toBeNull();
  });

  it('com um passo guardado mostra "Continuar o tutorial" e volta para ele', () => {
    guardarPasso('lazer');
    montar();
    const cartao = screen.getByRole('button', { name: 'Continuar o tutorial' });
    expect(cartao.className).toContain('gaze-button');
    expect(cartao).toHaveTextContent(/passo 7 de 10/i);
    fireEvent.click(cartao);
    expect(navigate).toHaveBeenCalledWith('/tutorial');
  });

  it('o cartão some sem remontar quando o tutorial termina', () => {
    guardarPasso('lazer');
    montar();
    expect(screen.getByRole('button', { name: 'Continuar o tutorial' })).toBeInTheDocument();
    act(() => limparMissoes());
    expect(screen.queryByRole('button', { name: 'Continuar o tutorial' })).toBeNull();
  });
});
