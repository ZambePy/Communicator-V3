import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SettingsProvider } from '../../context/SettingsContext';
import { AjusteDaPressaoLonga } from './AjusteDaPressaoLonga';

// Configurações → quanto tempo segurar o acionador para a emergência
// (revisão de UX de 19/10/2026, item 7). Tela do cuidador: mouse e teclado.

const montar = () => render(<SettingsProvider><AjusteDaPressaoLonga estiloDoCartao={{}} /></SettingsProvider>);
const gravado = () => JSON.parse(localStorage.getItem('irisflow_settings') ?? '{}').acionadorPressaoLongaMs;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('AjusteDaPressaoLonga', () => {
  it('mostra o tempo em vigor e muda de meio em meio segundo, gravando', () => {
    montar();
    expect(screen.getByText('Segurar por 2 s')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Segurar por mais tempo' }));
    expect(screen.getByText('Segurar por 2,5 s')).toBeInTheDocument();
    expect(gravado()).toBe(2500);
    fireEvent.click(screen.getByRole('button', { name: 'Segurar por menos tempo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Segurar por menos tempo' }));
    expect(screen.getByText('Segurar por 1,5 s')).toBeInTheDocument();
    expect(gravado()).toBe(1500);
  });

  it('diz que, com a contagem aberta ou o alarme tocando, segurar não escolhe nada (revisão de UX de 20/10/2026, achado 1)', () => {
    montar();
    const texto = screen.getByRole('region', { name: /segurar o acionador para a emergência/ }).textContent ?? '';
    expect(texto).toContain('Com a contagem aberta ou o alarme tocando, segurar não escolhe nada');
    expect(texto).toContain('aperta rápido');
    // A regra antiga ("segurar escolhe o CANCELAR") não aparece mais.
    expect(texto).not.toMatch(/segurar escolhe/i);
  });

  it('para nos limites da faixa segura (1 a 4 s)', () => {
    montar();
    const menos = screen.getByRole('button', { name: 'Segurar por menos tempo' });
    const mais = screen.getByRole('button', { name: 'Segurar por mais tempo' });
    for (let i = 0; i < 10; i++) fireEvent.click(menos);
    expect(screen.getByText('Segurar por 1 s')).toBeInTheDocument();
    expect(menos).toBeDisabled();
    for (let i = 0; i < 10; i++) fireEvent.click(mais);
    expect(screen.getByText('Segurar por 4 s')).toBeInTheDocument();
    expect(mais).toBeDisabled();
    expect(gravado()).toBe(4000);
  });
});
