import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { SettingsProvider, useSettings } from './SettingsContext';

// -----------------------------------------------------------------------------
// Modo só horizontal (pedido de 21/10/2026): o cuidador liga quando o paciente
// perdeu o olhar vertical. Campo novo — o disco antigo não o tem, e só um
// booleano vale: um "sim" editado à mão não pode ligar o modo por engano.
// -----------------------------------------------------------------------------

const Sonda: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <span data-testid="modo">{String(settings.modoHorizontal)}</span>
      <button data-testid="ligar" onClick={() => updateSettings({ modoHorizontal: true })}>ligar</button>
    </div>
  );
};

const gravar = (v: unknown) =>
  localStorage.setItem('irisflow_settings', JSON.stringify({ modoHorizontal: v, schemaVersion: 1 }));
const montar = () => render(<SettingsProvider><Sonda /></SettingsProvider>);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('modoHorizontal no disco', () => {
  it('sem nada gravado: desligado', () => {
    montar();
    expect(screen.getByTestId('modo').textContent).toBe('false');
  });

  it('disco de antes do campo: desligado (e o resto continua valendo)', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ simNaoPorPiscada: true, schemaVersion: 1 }));
    montar();
    expect(screen.getByTestId('modo').textContent).toBe('false');
  });

  it('a escolha gravada volta', () => {
    gravar(true);
    montar();
    expect(screen.getByTestId('modo').textContent).toBe('true');
  });

  it.each([['texto', 'sim'], ['número', 1], ['nulo', null]])('valor que não é booleano (%s) volta ao padrão', (_n, v) => {
    gravar(v);
    montar();
    expect(screen.getByTestId('modo').textContent).toBe('false');
  });

  it('ligar em Configurações grava no disco', () => {
    montar();
    act(() => { screen.getByTestId('ligar').click(); });
    expect(screen.getByTestId('modo').textContent).toBe('true');
    expect(JSON.parse(localStorage.getItem('irisflow_settings')!).modoHorizontal).toBe(true);
  });
});
