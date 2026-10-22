import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { SettingsProvider, useSettings, linguagemDoRelatorioValida } from './SettingsContext';

// -----------------------------------------------------------------------------
// Como o resultado da calibração e do teste aparece (pedido de 19/10/2026):
// em palavras simples ou com os números. A pergunta é feita UMA vez — então o
// "ainda não perguntado" (`null`) precisa sobreviver ao disco antigo, e um
// valor editado à mão não pode virar uma terceira linguagem.
// -----------------------------------------------------------------------------

const Sonda: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <span data-testid="linguagem">{String(settings.linguagemDoRelatorio)}</span>
      <button data-testid="tecnica" onClick={() => updateSettings({ linguagemDoRelatorio: 'tecnica' })}>
        tecnica
      </button>
    </div>
  );
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('linguagemDoRelatorioValida', () => {
  it('aceita só as duas linguagens', () => {
    expect(linguagemDoRelatorioValida('simples')).toBe('simples');
    expect(linguagemDoRelatorioValida('tecnica')).toBe('tecnica');
    for (const v of ['técnica', 'SIMPLES', '', 1, true, {}, null, undefined]) {
      expect(linguagemDoRelatorioValida(v)).toBeNull();
    }
  });
});

describe('a escolha no disco', () => {
  it('sem nada gravado: ainda não perguntado', () => {
    render(<SettingsProvider><Sonda /></SettingsProvider>);
    expect(screen.getByTestId('linguagem').textContent).toBe('null');
  });

  it('disco de antes do campo: ainda não perguntado (e o resto continua valendo)', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ dwellMs: 800, schemaVersion: 1 }));
    render(<SettingsProvider><Sonda /></SettingsProvider>);
    expect(screen.getByTestId('linguagem').textContent).toBe('null');
  });

  it('a escolha gravada volta', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ linguagemDoRelatorio: 'simples', schemaVersion: 1 }));
    render(<SettingsProvider><Sonda /></SettingsProvider>);
    expect(screen.getByTestId('linguagem').textContent).toBe('simples');
  });

  it('valor editado à mão vira "não perguntado", não uma terceira linguagem', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ linguagemDoRelatorio: 'bonita', schemaVersion: 1 }));
    render(<SettingsProvider><Sonda /></SettingsProvider>);
    expect(screen.getByTestId('linguagem').textContent).toBe('null');
  });

  it('mudar em Configurações grava no disco', () => {
    render(<SettingsProvider><Sonda /></SettingsProvider>);
    act(() => { screen.getByTestId('tecnica').click(); });
    expect(screen.getByTestId('linguagem').textContent).toBe('tecnica');
    expect(JSON.parse(localStorage.getItem('irisflow_settings')!).linguagemDoRelatorio).toBe('tecnica');
  });
});
