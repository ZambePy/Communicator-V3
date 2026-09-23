import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import i18n from '../i18n';
import { GamesMenu } from './GamesMenu';

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

// Mock do hook useGaze
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({
    isDwelling: false,
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

describe('GamesMenu — Lazer e bem-estar', () => {
  it('deve renderizar o título de Lazer e bem-estar e todos os cards de atividade incluindo Tirar Foto', () => {
    render(
      <BrowserRouter>
        <GamesMenu />
      </BrowserRouter>
    );

    // Verifica título principal — o mesmo nome do menu principal e do tutorial.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lazer e bem-estar');
    expect(screen.queryByText('Ajuda e Lazer')).toBeNull();

    // Verifica novos itens adicionados
    expect(screen.getByText('Tirar Foto')).toBeInTheDocument();
    expect(screen.getByText('Galeria de Fotos')).toBeInTheDocument();

    // Verifica jogos anteriores mantidos com tamanho ampliado
    expect(screen.getByText('Estoura Bolhas')).toBeInTheDocument();
    expect(screen.getByText('Jogo da Memória')).toBeInTheDocument();
    expect(screen.getByText('Siga o Alvo')).toBeInTheDocument();
    expect(screen.getByText('Desenho com Olhar')).toBeInTheDocument();

    // Verifica botão de voltar
    expect(screen.getByText('Voltar')).toBeInTheDocument();
  });
});
