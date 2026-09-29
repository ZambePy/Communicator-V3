import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { GazeSample } from '@tracker/tracker/engine';

// -----------------------------------------------------------------------------
// O teclado inteiro, com o despachante de verdade, e o olhar parado numa célula
// — o paciente que abre um grupo e fica lendo as letras.
//
// O grupo e as letras são nós diferentes do DOM na mesma rota: o grupo clicado
// some e a letra da mesma célula aparece sob o olhar. O rearme bloqueava só o
// nó que sumiu, e a letra era escrita sozinha; o teclado voltava aos grupos, o
// grupo abria de novo, e a mesma letra saía outra vez a cada ~4 s — "OO" em
// doze segundos de olhar parado (percurso da Fase 8).
// -----------------------------------------------------------------------------

let emitir: (s: GazeSample) => void = () => {};
const engineMock = {
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  dispose: vi.fn(),
  subscribe: (cb: (s: GazeSample) => void) => {
    emitir = cb;
    return () => {};
  },
  onStateChange: () => () => {},
  onL2CSStatusChange: () => () => {},
  getState: () => 'tracking',
  getSessionUptimeMs: () => 1000,
  getDiagnostics: () => null,
  setFilterPreset: vi.fn(),
  calibration: {
    isCalibrated: () => true,
    onInvalidated: () => () => {},
    setCameraFovDeg: vi.fn(),
    setEyeDominance: vi.fn(),
    abort: vi.fn(),
    clear: vi.fn(),
  },
  recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
};

vi.mock('@tracker/tracker/engine', async (orig) => ({
  ...(await orig<typeof import('@tracker/tracker/engine')>()),
  createGazeEngine: () => engineMock,
}));

import { GazeProvider } from '../context/GazeContext';
import { SettingsProvider } from '../context/SettingsContext';
import { KeyboardScreen } from './KeyboardScreen';

/** As seis células da grade, na ordem da tela. */
const grade = () => Array.from(document.querySelectorAll('button')).filter((b) => /\bkb-key\b/.test(b.className));
/** O texto escrito até agora ('' quando a barra mostra "Escolha um grupo"). */
const escrito = () => document.querySelector('.kb-landing')?.textContent ?? '';

/** Um quadro por `act`: cada clique troca a grade, e o React só troca quando o `act` fecha. */
function olhar(ms: number, inicio: number, x: number) {
  for (let t = inicio; t <= inicio + ms; t += 1000 / 30) {
    act(() => {
      emitir({ x, y: 300, timestamp: t, hasFace: true, degraded: false, uncalibrated: false, eyeState: 'open' } as GazeSample);
    });
  }
  return inicio + ms;
}

beforeEach(() => {
  window.location.hash = '#/keyboard';
  localStorage.clear();
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera no teste'); }) },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('teclado com o olhar parado numa célula', () => {
  it('abre o grupo uma vez e não escreve a letra que aparece sob o olhar', () => {
    render(
      <MemoryRouter>
        <SettingsProvider>
          <GazeProvider>
            <KeyboardScreen />
          </GazeProvider>
        </SettingsProvider>
      </MemoryRouter>
    );
    // A terceira célula: "M N O / P Q R" nos grupos, "O" dentro dele. À
    // esquerda (x < 500) o olhar cai fora da grade.
    document.elementFromPoint = vi.fn((x: number) => (x < 500 ? null : grade()[2] ?? null));
    expect(grade()[2]).toHaveTextContent('M N O');

    let t = olhar(12000, 0, 900);
    expect(grade()[2]).toHaveTextContent(/^O$/);
    expect(escrito()).toBe('');
    expect(screen.getByText('Escolha um grupo')).toBeInTheDocument();

    // O paciente escolhe a letra: o olhar sai da célula e volta a ela.
    t = olhar(500, t + 33, 100);
    olhar(3000, t + 33, 900);
    expect(escrito()).toBe('O');
  });
});
