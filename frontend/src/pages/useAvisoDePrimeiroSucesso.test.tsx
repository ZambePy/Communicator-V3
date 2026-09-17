/**
 * Regressão: o aviso do primeiro sucesso disparava em laço — cada toast
 * recriava o contexto, o efeito rodava de novo e empilhava outro cartão até
 * a tela travar. Aqui o hook roda sob um provedor real e o contador de
 * cartões tem de ficar em UM, mesmo com re-renderizações forçadas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import i18n from '../i18n';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../context/ToastContext';
import { useAvisoDePrimeiroSucesso } from './useAvisoDePrimeiroSucesso';
import React, { useState } from 'react';

function Tela() {
  useAvisoDePrimeiroSucesso();
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      rerender {n}
    </button>
  );
}

describe('useAvisoDePrimeiroSucesso', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('pt-BR');
  });

  it('emite um único aviso e não repete em re-renderizações', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={[{ pathname: '/phrases', state: { primeiroSucesso: true } }]}>
          <Routes>
            <Route path="/phrases" element={<Tela />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );
    const botao = await screen.findByRole('button', { name: /rerender/ });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        botao.click();
      });
    }
    const avisos = screen.getAllByText(/controlar o IrisFlow usando apenas o olhar/);
    expect(avisos).toHaveLength(1);
  });
});
