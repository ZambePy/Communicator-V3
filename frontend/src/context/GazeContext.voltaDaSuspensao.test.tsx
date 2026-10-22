import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

// Revisão de UX de 20/10/2026, achado 4: a pausa da varredura (Esc) devolve o
// olhar (`suspenderDwell(false, 'acionador')`), e o botão em que o olhar do
// paciente já estava parado — o destacado, que ele seguia — era clicado
// sozinho ~1,5 s depois: sair da suspensão não armava o rearme por saída (só a
// troca de tela, `aoNavegar`). O cenário é o do teste de reprodução da
// revisão, que afirmava o defeito; aqui afirma a correção, com o GazeProvider
// de verdade.

let emitir: (s: GazeSample) => void = () => {};
const engineMock = {
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  dispose: vi.fn(),
  subscribe: (cb: (s: GazeSample) => void) => { emitir = cb; return () => {}; },
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
vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return { ...real, createGazeEngine: () => engineMock };
});
vi.mock('./SettingsContext', () => ({
  useSettings: () => ({ settings: { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both' }, updateSettings: vi.fn() }),
}));

const { GazeProvider, suspenderDwell } = await import('./GazeContext');

/** O botão fica em volta de (50, 50); longe dali, o olhar está no fundo da tela. */
const ALVO = { x: 50, y: 50 };
const amostra = (t: number, x: number, y: number): GazeSample =>
  ({ x, y, timestamp: t, hasFace: true, degraded: false, uncalibrated: false, eyeState: 'open' } as GazeSample);
/** Olhar parado em (x, y) por `ms`, a 30 Hz; devolve o instante final. */
function olhar(ms: number, inicio: number, x = ALVO.x, y = ALVO.y) {
  const passo = 1000 / 30;
  act(() => { for (let t = inicio; t <= inicio + ms; t += passo) emitir(amostra(t, x, y)); });
  return inicio + ms;
}

function montar(onClick: () => void) {
  render(<GazeProvider><button data-testid="alvo" onClick={onClick}>Apagar</button></GazeProvider>);
  const el = screen.getByTestId('alvo');
  document.elementFromPoint = vi.fn((x: number, y: number) => (Math.hypot(x - ALVO.x, y - ALVO.y) < 60 ? el : document.body));
}

describe('achado 4 — o olhar que volta de uma suspensão do dwell', () => {
  beforeEach(() => {
    window.location.hash = '#/teclado';
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera'); }) } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    suspenderDwell(false, 'acionador');
    suspenderDwell(false, 'modo_computador');
    vi.restoreAllMocks();
  });

  it('controle: sem suspensão, o olhar parado no botão clica uma vez (o dwell de sempre)', () => {
    const onClick = vi.fn();
    montar(onClick);
    olhar(1700, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a pausa da varredura devolve o olhar: o botão sob o olhar parado NÃO é clicado sozinho', () => {
    const onClick = vi.fn();
    montar(onClick);
    // Acionador mandando: o olhar está suspenso, e o paciente segue o destaque
    // da varredura — o olhar dele está parado neste botão.
    suspenderDwell(true, 'acionador');
    let t = olhar(4000, 0);
    expect(onClick).not.toHaveBeenCalled();
    // O cuidador aperta Esc: a pausa devolve o olhar (calibração valendo).
    suspenderDwell(false, 'acionador');
    t = olhar(3000, t + 33);
    expect(onClick).not.toHaveBeenCalled();
    // O olhar sai do botão e volta: aí sim é uma escolha nova, e o dwell vale.
    t = olhar(500, t + 33, 600, 600);
    olhar(1700, t + 33);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('o fim do Modo Computador também arma o rearme', () => {
    const onClick = vi.fn();
    montar(onClick);
    suspenderDwell(true, 'modo_computador');
    const t = olhar(1000, 0);
    suspenderDwell(false, 'modo_computador');
    olhar(3000, t + 33);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('só a volta que esvazia os motivos arma; um provider montado depois dela não a toma por sua', () => {
    // A volta aconteceu antes de este provider existir: nada a tratar.
    suspenderDwell(true, 'acionador');
    suspenderDwell(false, 'acionador');
    const onClick = vi.fn();
    montar(onClick);
    olhar(1700, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
