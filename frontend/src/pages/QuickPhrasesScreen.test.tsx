import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';

// FE-23: o cartão "Comunicação" do menu promete "frases rápidas e
// pictogramas", mas a tela de pictogramas não tinha caminho pela interface.
vi.mock('../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/FaixaDeMissao', () => ({ FaixaDeMissao: () => null }));
vi.mock('../components/ui/DicaContextual', () => ({ DicaContextual: () => null }));
vi.mock('../services/voz', () => ({ falar: vi.fn(async () => undefined) }));
vi.mock('../cloud/eventos', () => ({ emitirFalaDoPaciente: vi.fn() }));

import { QuickPhrasesScreen } from './QuickPhrasesScreen';

describe('Frases rápidas → pictogramas', () => {
  it('a última página leva aos pictogramas', () => {
    render(
      <MemoryRouter initialEntries={['/phrases']}>
        <Routes>
          <Route path="/phrases" element={<QuickPhrasesScreen />} />
          <Route path="/pictograms" element={<div>tela de pictogramas</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText('Pictogramas')).toBeNull();
    fireEvent.click(screen.getByText('Mais frases'));
    fireEvent.click(screen.getByText('Pictogramas'));
    expect(screen.getByText('tela de pictogramas')).toBeInTheDocument();
  });
});

describe('Frases rápidas → frases favoritas (FE-23)', () => {
  it('a última página leva a "Minhas opções"', () => {
    render(
      <MemoryRouter initialEntries={['/phrases']}>
        <Routes>
          <Route path="/phrases" element={<QuickPhrasesScreen />} />
          <Route path="/options" element={<div>tela de favoritas</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText('Minhas opções')).toBeNull();
    fireEvent.click(screen.getByText('Mais frases'));
    fireEvent.click(screen.getByText('Minhas opções'));
    expect(screen.getByText('tela de favoritas')).toBeInTheDocument();
  });
});
