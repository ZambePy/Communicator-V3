import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AtalhoDeEvolucaoEConsulta } from './AtalhoDeEvolucaoEConsulta';

// O único caminho pela interface até a evolução e a consulta é esta seção das
// Configurações (21/10/2026): o menu do paciente tem nove cartões e o hub da
// Comunicação, seis — nenhum cabe mais um.

function Local() {
  return <span data-testid="local">{useLocation().pathname}</span>;
}
const montar = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Local />
      <Routes>
        <Route path="/settings" element={<AtalhoDeEvolucaoEConsulta />} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );

describe('AtalhoDeEvolucaoEConsulta', () => {
  it('é uma seção com título e diz, em uma frase, para que serve cada tela', () => {
    montar();
    expect(screen.getByRole('region', { name: /evolução e consulta/i })).toBeInTheDocument();
    expect(screen.getByText(/semana a semana/i)).toBeInTheDocument();
    expect(screen.getByText(/uma página para levar ao médico/i)).toBeInTheDocument();
  });

  it('Ver a evolução semanal leva a /evolucao', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /ver a evolução semanal/i }));
    expect(screen.getByTestId('local')).toHaveTextContent('/evolucao');
  });

  it('Abrir a consulta leva a /consulta', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /abrir a consulta/i }));
    expect(screen.getByTestId('local')).toHaveTextContent('/consulta');
  });
});
