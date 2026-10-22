import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SettingsProvider } from '../../context/SettingsContext';
import { AjustesDeEmergenciaEHospital } from './AjustesDeEmergenciaEHospital';

// Configurações (rodada 3, 21/10/2026): quanto dura a contagem da Emergência
// (decisão 5, de 3 a 10 s) e o modo hospital. Tela do cuidador: mouse e teclado.

const montar = () => render(<SettingsProvider><AjustesDeEmergenciaEHospital estiloDoCartao={{}} /></SettingsProvider>);
const gravado = (campo: string) => JSON.parse(localStorage.getItem('irisflow_settings') ?? '{}')[campo];

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('contagem da Emergência', () => {
  const mais = () => screen.getByRole('button', { name: 'Contagem mais longa' });
  const menos = () => screen.getByRole('button', { name: 'Contagem mais curta' });

  it('mostra os 5 s de sempre e muda de 1 em 1 s, gravando', () => {
    montar();
    expect(screen.getByText('Contagem de 5 s')).toBeInTheDocument();
    fireEvent.click(mais());
    expect(screen.getByText('Contagem de 6 s')).toBeInTheDocument();
    expect(gravado('contagemDaEmergenciaS')).toBe(6);
    fireEvent.click(menos());
    fireEvent.click(menos());
    expect(screen.getByText('Contagem de 4 s')).toBeInTheDocument();
    expect(gravado('contagemDaEmergenciaS')).toBe(4);
  });

  it('para nos limites da faixa segura (3 e 10 s): os botões desligam e nada passa', () => {
    montar();
    for (let i = 0; i < 12; i++) fireEvent.click(menos());
    expect(screen.getByText('Contagem de 3 s')).toBeInTheDocument();
    expect(menos()).toBeDisabled();
    expect(gravado('contagemDaEmergenciaS')).toBe(3);
    for (let i = 0; i < 12; i++) fireEvent.click(mais());
    expect(screen.getByText('Contagem de 10 s')).toBeInTheDocument();
    expect(mais()).toBeDisabled();
    expect(gravado('contagemDaEmergenciaS')).toBe(10);
  });

  it('lembra o que estava gravado; um valor fora da faixa no disco aparece já corrigido', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ contagemDaEmergenciaS: 8, schemaVersion: 1 }));
    montar();
    expect(screen.getByText('Contagem de 8 s')).toBeInTheDocument();

    localStorage.setItem('irisflow_settings', JSON.stringify({ contagemDaEmergenciaS: 0, schemaVersion: 1 }));
    document.body.innerHTML = '';
    montar();
    expect(screen.getByText('Contagem de 3 s')).toBeInTheDocument();
  });

  it('o texto diz a faixa, o padrão e o que a contagem faz', () => {
    montar();
    const texto = screen.getByRole('region', { name: /Contagem da Emergência/ }).textContent ?? '';
    expect(texto).toContain('de 3 a 10 s');
    expect(texto).toContain('o padrão é 5 s');
    expect(texto).toContain('CANCELAR');
  });
});

describe('modo hospital', () => {
  const chave = () => screen.getByRole('switch', { name: /Modo hospital/ });

  it('vem desligado, e o texto diz o que muda (a tela inicial) e que o menu completo continua a um olhar', () => {
    montar();
    expect(chave()).toHaveAttribute('aria-checked', 'false');
    expect(chave()).toHaveTextContent('Modo hospital: desligado');
    const texto = screen.getByRole('region', { name: /Modo hospital/ }).textContent ?? '';
    expect(texto).toMatch(/tela inicial/);
    expect(texto).toMatch(/dor/);
    expect(texto).toMatch(/menu completo/);
  });

  it('ligar e desligar grava no disco', () => {
    montar();
    fireEvent.click(chave());
    expect(chave()).toHaveAttribute('aria-checked', 'true');
    expect(chave()).toHaveTextContent('Modo hospital: ligado');
    expect(gravado('modoHospital')).toBe(true);
    fireEvent.click(chave());
    expect(chave()).toHaveAttribute('aria-checked', 'false');
    expect(gravado('modoHospital')).toBe(false);
  });

  // Revisão final, rodada 1 (M8, 21/10/2026): os dois modos ligados juntos — o horizontal vale, e o
  // cuidador precisa saber, em vez de achar que a tela do quarto está quebrada.
  it('com o modo só horizontal também ligado, a seção avisa que a tela do hospital não vira a inicial', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ modoHospital: true, modoHorizontal: true, schemaVersion: 1 }));
    montar();
    expect(screen.getByRole('note')).toHaveTextContent(/modo só horizontal está ligado/i);
    expect(screen.getByRole('note')).toHaveTextContent(/menu de sempre/i);
  });

  it('sem o modo só horizontal, não há esse aviso', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ modoHospital: true, schemaVersion: 1 }));
    montar();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('lembra o que estava gravado', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ modoHospital: true, schemaVersion: 1 }));
    montar();
    expect(chave()).toHaveAttribute('aria-checked', 'true');
  });
});
