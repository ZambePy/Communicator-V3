import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { FronteiraDeErroDaTela } from './FronteiraDeErroDaTela';

// -----------------------------------------------------------------------------
// FE-8: um erro de render numa tela derrubava o app inteiro (a única fronteira
// estava na raiz, por fora do olhar e da Emergência). A falha agora fica na
// tela, com uma saída grande pelo olhar, e o que está fora dela continua.
// -----------------------------------------------------------------------------

const Quebra: React.FC = () => {
  throw new Error('w.map is not a function');
};

let navegar: (r: string) => void = () => {};
const Nav: React.FC = () => {
  navegar = useNavigate();
  return null;
};

afterEach(() => vi.restoreAllMocks());

describe('fronteira de erro por tela', () => {
  it('a tela que quebra mostra uma saída pelo olhar; o que está fora (Emergência) continua', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/caregiver']}>
        <Nav />
        <button data-emergency="true">Emergência</button>
        <FronteiraDeErroDaTela>
          <Routes>
            <Route path="/caregiver" element={<Quebra />} />
            <Route path="/menu" element={<div>menu do paciente</div>} />
          </Routes>
        </FronteiraDeErroDaTela>
      </MemoryRouter>
    );
    expect(screen.getByTestId('fronteira-de-erro-da-tela')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emergência' })).toBeInTheDocument();
    const voltar = screen.getByRole('button', { name: 'Voltar ao menu' });
    // Aceito também com o rastreamento degradado.
    expect(voltar.getAttribute('data-recovery')).toBe('true');
    // Sem a mensagem técnica na tela.
    expect(screen.queryByText(/w\.map/)).toBeNull();

    act(() => voltar.click());
    expect(screen.getByText('menu do paciente')).toBeInTheDocument();
    expect(screen.queryByTestId('fronteira-de-erro-da-tela')).toBeNull();
  });

  it('trocar de rota limpa o erro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/quebra']}>
        <Nav />
        <FronteiraDeErroDaTela>
          <Routes>
            <Route path="/quebra" element={<Quebra />} />
            <Route path="/outra" element={<div>outra tela</div>} />
          </Routes>
        </FronteiraDeErroDaTela>
      </MemoryRouter>
    );
    expect(screen.getByTestId('fronteira-de-erro-da-tela')).toBeInTheDocument();
    act(() => navegar('/outra'));
    expect(screen.getByText('outra tela')).toBeInTheDocument();
  });
});
