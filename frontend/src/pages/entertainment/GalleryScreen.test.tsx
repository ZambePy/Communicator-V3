import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { GalleryScreen } from './GalleryScreen';
import { CHAVE_DO_ALBUM, lerAlbum } from './album';

/**
 * A galeria mostra só o que o paciente fez. As quatro fotos de exemplo do
 * unsplash saíram: quebravam offline e não eram de ninguém.
 */
vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()) }),
  useIsDwelling: () => false,
}));

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

const renderizar = () =>
  render(
    <BrowserRouter>
      <GalleryScreen />
    </BrowserRouter>
  );

describe('GalleryScreen', () => {
  beforeEach(() => localStorage.clear());

  it('sem fotos mostra o estado vazio, sem nada vindo da rede', () => {
    renderizar();
    expect(screen.getByText('Nenhuma foto ainda — tire a primeira.')).toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain('unsplash');
    expect(screen.getByLabelText('Tirar a primeira foto')).toBeInTheDocument();
  });

  it('lista as fotos do álbum, abre, e os alvos do modal têm 76 px', () => {
    localStorage.setItem(
      CHAVE_DO_ALBUM,
      JSON.stringify([
        { id: 'p1', dataUrl: 'data:image/jpeg;base64,AAA', timestamp: 1, filter: 'Normal' },
        { id: 'd1', dataUrl: 'data:image/jpeg;base64,BBB', timestamp: 2, filter: 'Desenho' },
      ])
    );
    renderizar();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // Nenhum <button> cru: todo alvo é GazeButton.
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('gaze-button');

    const abrir = screen.getByLabelText(/^Ver foto: Desenho de/);
    fireEvent.click(abrir);
    const fechar = screen.getByLabelText('Fechar visualização');
    expect(fechar.style.height).toBe('76px');
    expect(fechar).toHaveAttribute('data-isolado', 'true');
    // Sem "Baixar": abre diálogo nativo que o olhar não fecha.
    expect(screen.queryByLabelText(/Baixar/)).toBeNull();

    const excluir = screen.getByLabelText('Excluir foto do álbum');
    expect(Number(excluir.getAttribute('data-dwell-ms'))).toBeGreaterThanOrEqual(2000);
    fireEvent.click(excluir);
    expect(lerAlbum().map((p) => p.id)).toEqual(['p1']);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
