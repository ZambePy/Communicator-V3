import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { GazeSample } from '@tracker/tracker/engine';

// -----------------------------------------------------------------------------
// Gravação de 30/09: escrito o "H", o teclado volta aos grupos e a célula sob
// o olhar passa a ser o "G H I / J K L". Quem queria o "I" ficava olhando essa
// célula e nada acontecia — o grupo herdado só valia depois de o olhar sair e
// voltar, e nada na tela dizia isso. Os grupos agora rearmam também pela
// permanência do olhar; as letras continuam exigindo a saída (Fase 8).
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

/** Colunas da linha de cima da grade: x → célula 0, 1 ou 2. À esquerda de 500, fora da grade. */
const celulaEm = (x: number) => (x < 500 ? -1 : x < 800 ? 0 : x < 1100 ? 1 : 2);

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

describe('teclado: o mesmo grupo de novo, com o olhar parado nele', () => {
  it('depois de escrever o "H", o grupo "G H I" que volta sob o olhar abre de novo sem sair dele', () => {
    render(
      <MemoryRouter>
        <SettingsProvider>
          <GazeProvider>
            <KeyboardScreen />
          </GazeProvider>
        </SettingsProvider>
      </MemoryRouter>
    );
    document.elementFromPoint = vi.fn((x: number) => {
      const i = celulaEm(x);
      return i < 0 ? null : grade()[i] ?? null;
    });
    expect(grade()[1]).toHaveTextContent('G H I');

    // Abre o grupo e escreve o "H" (a letra da mesma célula exige sair e voltar).
    let t = olhar(4000, 0, 950);
    expect(grade()[1]).toHaveTextContent(/^H$/);
    t = olhar(500, t + 33, 100);
    t = olhar(3000, t + 33, 950);
    expect(escrito()).toBe('H');

    // O teclado voltou aos grupos, com o "G H I" sob o olhar parado. Antes
    // ficava assim para sempre; agora abre de novo depois da permanência.
    t = olhar(4000, t + 33, 950);
    expect(grade()[1]).toHaveTextContent(/^H$/);
    expect(grade()[2]).toHaveTextContent(/^I$/);
    // E o olhar parado não escreve outro "H" sozinho.
    expect(escrito()).toBe('H');

    // O "I" ao lado: um salto até ele, e o dwell normal.
    olhar(3000, t + 33, 1250);
    expect(escrito()).toBe('HI');
  });
});
