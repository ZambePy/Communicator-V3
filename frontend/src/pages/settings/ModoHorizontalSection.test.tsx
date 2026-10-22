import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SettingsProvider } from '../../context/SettingsContext';
import { ModoHorizontalSection } from './ModoHorizontalSection';

// Configurações → modo só horizontal (pedido de 21/10/2026): o cuidador liga
// e abre as telas laterais.

const montar = () =>
  render(
    <SettingsProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<ModoHorizontalSection estiloDoCartao={{}} />} />
          <Route path="/sim-nao" element={<p>tela sim não</p>} />
          <Route path="/teclado-lateral" element={<p>tela teclado lateral</p>} />
        </Routes>
      </MemoryRouter>
    </SettingsProvider>
  );

describe('Configurações — modo só horizontal', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('desligado por padrão; ligar grava o ajuste', () => {
    montar();
    const chave = screen.getByRole('switch', { name: /Modo só horizontal/ });
    expect(chave).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(chave);
    expect(screen.getByRole('switch', { name: /Modo só horizontal/ })).toHaveAttribute('aria-checked', 'true');
    expect(JSON.parse(localStorage.getItem('irisflow_settings')!).modoHorizontal).toBe(true);
  });

  it('explica o que muda, em palavras simples', () => {
    montar();
    expect(screen.getByText(/olhar para cima e para baixo/)).toBeInTheDocument();
    expect(screen.getByText(/faixa vermelha na borda direita/)).toBeInTheDocument();
  });

  it('abre o teclado lateral', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o teclado lateral' }));
    expect(screen.getByText('tela teclado lateral')).toBeInTheDocument();
  });

  it('abre a tela Sim · Não', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir a tela Sim · Não' }));
    expect(screen.getByText('tela sim não')).toBeInTheDocument();
  });
});
