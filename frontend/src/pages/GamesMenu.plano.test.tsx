import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '../i18n';
import { LICENSE_KEY } from '../context/LicenseContext';
import { SoComLazer } from '../components/ui/SoComLazer';
import { GamesMenu } from './GamesMenu';

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()) }),
  useIsDwelling: () => false,
}));

/* Lazer e bem-estar é dos planos Completo e Voz (e da beta): a licença diz
   isso em features.lazer. Sem o recurso, o hub explica e as telas voltam. */

const planoSemLazer = () =>
  localStorage.setItem(
    LICENSE_KEY,
    JSON.stringify({
      plan: {
        id: 'essencial',
        name: 'IrisFlow Essencial',
        validUntil: null,
        deviceLimit: 1,
        features: { relatorios: false, multiplos_dispositivos: false, assistente: false, voz: false, lazer: false },
      },
    }),
  );

const montar = (inicio: string) =>
  render(
    <MemoryRouter initialEntries={[inicio]}>
      <Routes>
        <Route path="/games" element={<GamesMenu />} />
        <Route path="/menu" element={<div>MENU</div>} />
        <Route
          path="/games/bubble"
          element={
            <SoComLazer>
              <div>JOGO</div>
            </SoComLazer>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => localStorage.clear());

describe('Lazer e bem-estar por plano', () => {
  it('com o recurso no plano, mostra as atividades', () => {
    montar('/games');
    expect(screen.getByText('Estoura Bolhas')).toBeInTheDocument();
    expect(screen.queryByText(/não faz parte do plano/)).not.toBeInTheDocument();
  });

  it('sem o recurso, explica o motivo, não mostra cartões e volta ao menu', () => {
    planoSemLazer();
    montar('/games');
    expect(screen.getByRole('status')).toHaveTextContent('Lazer e bem-estar não faz parte do plano desta conta');
    expect(screen.getByText(/IrisFlow Completo e IrisFlow Voz/)).toBeInTheDocument();
    expect(screen.queryByText('Estoura Bolhas')).not.toBeInTheDocument();
    const voltar = screen.getAllByLabelText('Voltar ao menu principal');
    fireEvent.click(voltar[voltar.length - 1]);
    expect(screen.getByText('MENU')).toBeInTheDocument();
  });

  it('sem o recurso, uma tela de jogo volta para o hub em vez de abrir', () => {
    planoSemLazer();
    montar('/games/bubble');
    expect(screen.queryByText('JOGO')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('com o recurso, a tela de jogo abre', () => {
    montar('/games/bubble');
    expect(screen.getByText('JOGO')).toBeInTheDocument();
  });
});
