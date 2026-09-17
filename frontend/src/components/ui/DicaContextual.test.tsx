import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import i18n from '../../i18n';
import { DicaContextual } from './DicaContextual';

// -----------------------------------------------------------------------------
// Uma linha, uma vez. Dispensada com "Entendi", persiste em Settings e não
// volta na próxima entrada no módulo.
// -----------------------------------------------------------------------------

let dicasVistas: string[] = [];
const updateSettings = vi.fn((s: { dicasVistas?: string[] }) => {
  if (s.dicasVistas) dicasVistas = s.dicasVistas;
});

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({ settings: { dicasVistas }, updateSettings }),
}));

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  dicasVistas = [];
  updateSettings.mockClear();
});

describe('DicaContextual', () => {
  it('mostra a linha do módulo com o botão Entendi na primeira entrada', () => {
    render(<DicaContextual id="comunicacao" />);
    expect(screen.getByRole('note')).toHaveTextContent(/olhe para uma frase/i);
    expect(screen.getByRole('button', { name: 'Entendi' })).toBeInTheDocument();
  });

  it('"Entendi" grava o id em Settings sem apagar os já vistos', () => {
    dicasVistas = ['jogos'];
    render(<DicaContextual id="comunicacao" />);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(updateSettings).toHaveBeenCalledWith({ dicasVistas: ['jogos', 'comunicacao'] });
  });

  it('não volta depois de dispensada', () => {
    dicasVistas = ['comunicacao'];
    render(<DicaContextual id="comunicacao" />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('cada módulo tem a própria dica: dispensar uma não some com as outras', () => {
    dicasVistas = ['comunicacao'];
    render(<DicaContextual id="computador" />);
    expect(screen.getByRole('note')).toHaveTextContent(/cursor sai do aplicativo/i);
  });
});
