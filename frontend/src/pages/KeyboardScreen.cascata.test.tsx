import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { EXPERIMENT } from '@tracker/config/experiment';

// Dwell em cascata (M17) ligado ao teclado: as teclas das letras que
// continuam uma palavra sugerida ganham `data-dwell-ms` abaixo da base; as
// outras ficam sem o atributo (o dwell de sempre).

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()), isComposing: false, setIsComposing: vi.fn() }),
  useIsDwelling: () => false,
}));
vi.mock('../services/assistente', async (orig) => {
  const real = await orig<typeof import('../services/assistente')>();
  return {
    ...real,
    // O preditor, fixo: sempre sugere "QUERO".
    sugerirPalavras: () => ['QUERO'],
    palavraConhecida: () => false,
  };
});

import { KeyboardScreen } from './KeyboardScreen';
import { SettingsProvider } from '../context/SettingsContext';

if (typeof window !== 'undefined') {
  window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn() } as unknown as SpeechSynthesis;
}

const tecla = (texto: string) => screen.getByText(texto).closest('button') as HTMLButtonElement;

function montar() {
  render(
    <BrowserRouter>
      <SettingsProvider>
        <KeyboardScreen />
      </SettingsProvider>
    </BrowserRouter>,
  );
}

const antes = EXPERIMENT.dwellEmCascata;
beforeEach(() => localStorage.clear());
afterEach(() => {
  EXPERIMENT.dwellEmCascata = antes;
});

describe('dwell em cascata no teclado (M17)', () => {
  it('depois de "Q", o grupo e a tecla do "U" de QUERO aceleram; o resto fica na base', () => {
    EXPERIMENT.dwellEmCascata = true;
    montar();
    // Sem nada digitado o piso é a própria base: nada acelera.
    expect(tecla('S T U')).not.toHaveAttribute('data-dwell-ms');
    fireEvent.click(tecla('M N O'));
    fireEvent.click(tecla('Q'));
    // Uma letra na palavra: piso de 90 % da base de 1500 ms.
    expect(tecla('S T U')).toHaveAttribute('data-dwell-ms', '1350');
    expect(tecla('A B C')).not.toHaveAttribute('data-dwell-ms');
    fireEvent.click(tecla('S T U'));
    expect(tecla('U')).toHaveAttribute('data-dwell-ms', '1350');
    expect(tecla('S')).not.toHaveAttribute('data-dwell-ms');
  });

  it('desligado, nenhuma tecla recebe dwell próprio', () => {
    EXPERIMENT.dwellEmCascata = false;
    montar();
    fireEvent.click(tecla('M N O'));
    fireEvent.click(tecla('Q'));
    expect(tecla('S T U')).not.toHaveAttribute('data-dwell-ms');
    fireEvent.click(tecla('S T U'));
    expect(tecla('U')).not.toHaveAttribute('data-dwell-ms');
  });
});
