import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsProvider } from '../context/SettingsContext';
import { AjustesDoPlanoB } from './AjustesDoPlanoB';

// A explicação do Plano B diz quanto tempo segurar — o tempo do ajuste, não
// os 2 s de antes (revisão de UX de 19/10/2026, item 7): uma instrução errada
// ensina o cuidador a desconfiar da tela.

const montar = () =>
  render(
    <MemoryRouter>
      <SettingsProvider><AjustesDoPlanoB estiloDoCartao={{}} /></SettingsProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('AjustesDoPlanoB', () => {
  it('a explicação usa o tempo de segurar em vigor e o prazo da pausa', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ acionadorPressaoLongaMs: 3000, schemaVersion: 1 }));
    montar();
    const texto = screen.getByText(/chama a emergência/).textContent ?? '';
    expect(texto).toContain('Segurar por 3 s chama a emergência');
    expect(texto).toContain('pausa a varredura por até 2 minutos');
  });

  it('sem ajuste gravado: 2 s', () => {
    montar();
    expect(screen.getByText(/chama a emergência/).textContent).toContain('Segurar por 2 s chama a emergência');
  });
});

// A varredura falada (rodada 3, 21/10/2026): a voz do computador diz o nome do
// botão destacado. Desligada por padrão — quem enxerga bem não precisa dela, e
// uma voz repetindo cada botão cansa.
describe('AjustesDoPlanoB — varredura falada', () => {
  const chave = () => screen.getByRole('switch', { name: /Varredura falada/ });

  it('vem desligada, e o texto diz o que ela faz e que nunca fala por cima do paciente', () => {
    montar();
    expect(chave()).toHaveAttribute('aria-checked', 'false');
    expect(chave()).toHaveTextContent('Varredura falada: desligada');
    const explicacao = screen.getByText(/diz o nome de cada botão/).textContent ?? '';
    expect(explicacao).toMatch(/baixinho/);
    expect(explicacao).toMatch(/nunca fala por cima/);
  });

  it('ligar e desligar grava no disco', () => {
    montar();
    fireEvent.click(chave());
    expect(chave()).toHaveAttribute('aria-checked', 'true');
    expect(chave()).toHaveTextContent('Varredura falada: ligada');
    expect(JSON.parse(localStorage.getItem('irisflow_settings')!).varreduraFalada).toBe(true);
    fireEvent.click(chave());
    expect(chave()).toHaveAttribute('aria-checked', 'false');
    expect(JSON.parse(localStorage.getItem('irisflow_settings')!).varreduraFalada).toBe(false);
  });

  it('lembra o que estava gravado', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ varreduraFalada: true, schemaVersion: 1 }));
    montar();
    expect(chave()).toHaveAttribute('aria-checked', 'true');
  });

  it('é independente da varredura por acionador (os dois são chaves separadas)', () => {
    montar();
    fireEvent.click(chave());
    expect(screen.getByRole('switch', { name: /Varredura com acionador/ })).toHaveAttribute('aria-checked', 'false');
  });
});
