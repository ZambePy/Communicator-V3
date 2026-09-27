import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CloudBanners } from './CloudBanners';

// -----------------------------------------------------------------------------
// FE-6: no teclado, o cartão da mensagem do cuidador cobria a última fileira de
// teclas por 15 s, e "Responder" levava para a conversa — a frase em
// composição se perdia. No teclado ele fica só para leitura e o olhar o
// atravessa até as teclas.
// -----------------------------------------------------------------------------

vi.mock('./CloudContext', () => ({
  useCloud: () => ({
    mensagemNaTela: { id: 'm1', text: 'Já estou indo' },
    repetirUltimaMensagem: vi.fn(),
    dispensarMensagemNaTela: vi.fn(),
  }),
}));

const montar = (rota: string) =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <CloudBanners />
    </MemoryRouter>
  );

describe('cartão da mensagem do cuidador', () => {
  it('nas telas comuns: ouvir de novo e responder', () => {
    montar('/menu');
    expect(screen.getByText('Já estou indo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvir de novo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Responder/ })).toBeInTheDocument();
  });

  it('no teclado: só leitura, sem alvos, e transparente ao olhar', () => {
    montar('/keyboard');
    expect(screen.getByText('Já estou indo')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('cartao-mensagem-do-cuidador').style.pointerEvents).toBe('none');
  });

  it('na emergência o cartão global não aparece (a tela de emergência mostra a mensagem)', () => {
    montar('/emergency');
    expect(screen.queryByText('Já estou indo')).toBeNull();
  });
});
