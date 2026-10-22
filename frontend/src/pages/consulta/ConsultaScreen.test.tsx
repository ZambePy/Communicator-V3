import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// A consulta (21/10/2026): um começo com três portas grandes — o diário do dia,
// as perguntas e a folha para o médico —, cada uma com poucos alvos. As três
// partes têm testes próprios; aqui se confere a moldura e o caminho entre elas.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('./DiarioRapido', () => ({ DiarioRapido: () => <section aria-label="parte do diário">diário</section> }));
vi.mock('./PerguntasDaConsulta', () => ({ PerguntasDaConsulta: () => <section aria-label="parte das perguntas">perguntas</section> }));
vi.mock('./FolhaDaConsulta', () => ({ FolhaDaConsulta: () => <section aria-label="parte da folha">folha</section> }));

import { ConsultaScreen } from './ConsultaScreen';

function Local() {
  const l = useLocation();
  return <span data-testid="local">{l.pathname + l.search}</span>;
}
const montar = (inicial = '/consulta') =>
  render(
    <MemoryRouter initialEntries={[inicial]}>
      <Local />
      <Routes>
        <Route path="/consulta" element={<ConsultaScreen />} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );

describe('ConsultaScreen', () => {
  it('o começo tem o título e três portas, e nada das partes ainda', () => {
    const { container } = montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Consulta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /diário de hoje/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /perguntas para o médico/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /folha da consulta/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/parte d/i)).toBeNull();
    // Três portas e o Voltar: bem abaixo de seis alvos.
    expect(container.querySelectorAll('button.gaze-button').length).toBeLessThanOrEqual(6);
  });

  it.each([
    ['Diário de hoje', 'diario', /parte do diário/i],
    ['Perguntas para o médico', 'perguntas', /parte das perguntas/i],
    ['Folha da consulta', 'folha', /parte da folha/i],
  ])('"%s" abre a parte certa, e o endereço guarda onde se está', (nome, v, parte) => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(nome, 'i') }));
    expect(screen.getByTestId('local')).toHaveTextContent(`/consulta?v=${v}`);
    expect(screen.getByLabelText(parte)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /diário de hoje/i })).toBeNull();
  });

  it('abrir direto pelo endereço mostra a parte', () => {
    montar('/consulta?v=perguntas');
    expect(screen.getByLabelText(/parte das perguntas/i)).toBeInTheDocument();
  });

  it('um valor desconhecido volta ao começo, sem tela em branco', () => {
    montar('/consulta?v=qualquer');
    expect(screen.getByRole('button', { name: /diário de hoje/i })).toBeInTheDocument();
  });

  it('Voltar: do começo vai às Configurações; de uma parte, ao começo da consulta', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'common.backAria' }));
    expect(screen.getByTestId('local')).toHaveTextContent('/settings');
  });

  it('de uma parte, Voltar leva ao começo da consulta', () => {
    montar('/consulta?v=folha');
    fireEvent.click(screen.getByRole('button', { name: 'common.backAria' }));
    expect(screen.getByTestId('local')).toHaveTextContent(/^\/consulta$/);
  });

  it('a coluna deixa livre o canto da Emergência', () => {
    const { container } = montar();
    expect(container.querySelector('.coluna-livre-da-emergencia')).not.toBeNull();
  });
});
