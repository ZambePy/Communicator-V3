import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { SettingsProvider, useSettings } from './SettingsContext';
import { PRESSAO_LONGA_MAX_MS, PRESSAO_LONGA_MIN_MS } from '@tracker/interaction/varreduraPorAcionador';

// -----------------------------------------------------------------------------
// Quanto tempo segurar o acionador chama a emergência (revisão de UX de
// 19/10/2026, item 7: era fixo em 2 s). Campo novo: o disco antigo não o tem,
// e um valor editado à mão não pode sair da faixa segura — um limiar de 50 ms
// faria de cada aperto comum uma emergência.
// -----------------------------------------------------------------------------

const Sonda: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <span data-testid="pressao">{String(settings.acionadorPressaoLongaMs)}</span>
      <button data-testid="tres" onClick={() => updateSettings({ acionadorPressaoLongaMs: 3000 })}>3 s</button>
    </div>
  );
};

const gravar = (v: unknown) =>
  localStorage.setItem('irisflow_settings', JSON.stringify({ acionadorPressaoLongaMs: v, schemaVersion: 1 }));
const montar = () => render(<SettingsProvider><Sonda /></SettingsProvider>);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('acionadorPressaoLongaMs no disco', () => {
  it('sem nada gravado: 2 s, como sempre foi', () => {
    montar();
    expect(screen.getByTestId('pressao').textContent).toBe('2000');
  });

  it('disco de antes do campo: 2 s (e o resto continua valendo)', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ acionadorPassoMs: 2000, schemaVersion: 1 }));
    montar();
    expect(screen.getByTestId('pressao').textContent).toBe('2000');
  });

  it('a escolha gravada volta', () => {
    gravar(3500);
    montar();
    expect(screen.getByTestId('pressao').textContent).toBe('3500');
  });

  it('fora da faixa volta para dentro dela', () => {
    gravar(50);
    const { unmount } = montar();
    expect(screen.getByTestId('pressao').textContent).toBe(String(PRESSAO_LONGA_MIN_MS));
    unmount();
    gravar(99_000);
    montar();
    expect(screen.getByTestId('pressao').textContent).toBe(String(PRESSAO_LONGA_MAX_MS));
  });

  it.each([['texto', '3000'], ['nulo', null], ['objeto', { ms: 3000 }]])('valor que não é número (%s) volta ao padrão', (_n, v) => {
    gravar(v);
    montar();
    expect(screen.getByTestId('pressao').textContent).toBe('2000');
  });

  it('mudar em Configurações grava no disco', () => {
    montar();
    act(() => { screen.getByTestId('tres').click(); });
    expect(screen.getByTestId('pressao').textContent).toBe('3000');
    expect(JSON.parse(localStorage.getItem('irisflow_settings')!).acionadorPressaoLongaMs).toBe(3000);
  });
});
