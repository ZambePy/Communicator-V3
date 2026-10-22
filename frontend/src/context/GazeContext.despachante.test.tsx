import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React, { useEffect } from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

// -----------------------------------------------------------------------------
// Falhas do despachante do olhar (relato de 19/10/2026, falhas silenciosas #11).
//
// Antes:
//   - uma exceção no despachante (o `elementFromPoint` com coordenada NaN lança
//     `TypeError`) sumia no `emitToSubscribers` do engine, com um log por
//     quadro: o dwell inteiro morria, Emergência inclusive, sem nada na tela;
//   - o aprendizado da correção por dwell rodava ANTES do clique e fora do
//     `try`: uma exceção nele fazia o anel completar e nada acontecer.
// -----------------------------------------------------------------------------

let emitir: (s: GazeSample) => void = () => {};
let relogio = 0;

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

vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return { ...real, createGazeEngine: () => engineMock };
});

vi.mock('./SettingsContext', () => ({
  useSettings: () => ({
    settings: { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both' },
    updateSettings: vi.fn(),
  }),
}));

/** Liga, por teste, o aprendizado forçado e a falha dele. */
const aprendizado = { forcar: false, lancar: false };
vi.mock('@tracker/interaction/correcaoPorDwell', async (orig) => {
  const real = await orig<typeof import('@tracker/interaction/correcaoPorDwell')>();
  return {
    ...real,
    deveAprender: vi.fn((...a: Parameters<typeof real.deveAprender>) =>
      aprendizado.forcar ? true : real.deveAprender(...a)
    ),
    aprenderComSelecao: vi.fn((...a: Parameters<typeof real.aprenderComSelecao>) => {
      if (aprendizado.lancar) throw new Error('correção por dwell quebrada');
      return real.aprenderComSelecao(...a);
    }),
  };
});

import { GazeProvider, useGaze, FALHAS_DO_DESPACHO_PARA_AVISAR } from './GazeContext';
import { aprenderComSelecao } from '@tracker/interaction/correcaoPorDwell';

const DWELL_MS = 1500;
const TITULO_DA_FALHA = 'O acionamento pelo olhar falhou';

function amostra(over: Partial<GazeSample> = {}): GazeSample {
  return {
    x: 50,
    y: 50,
    timestamp: 0,
    hasFace: true,
    degraded: false,
    uncalibrated: false,
    eyeState: 'open',
    ...over,
  } as GazeSample;
}

/** Emite quadros a 30 fps por `ms`, com o carimbo de tempo avançando. */
function olhar(ms: number, inicio: number, over: Partial<GazeSample> = {}): number {
  const passo = 1000 / 30;
  act(() => {
    for (let t = inicio; t <= inicio + ms; t += passo) {
      relogio = t;
      emitir(amostra({ timestamp: t, ...over }));
    }
  });
  return inicio + ms + passo;
}

const recebidas: GazeSample[] = [];
/** Um assinante comum do olhar (o teclado, o HUD…). */
const Assinante: React.FC = () => {
  const { subscribe } = useGaze();
  useEffect(() => subscribe((s) => recebidas.push(s)), [subscribe]);
  return null;
};

function montar(botao: React.ReactElement<{ onClick?: () => void }>) {
  const onClick = vi.fn();
  render(
    <GazeProvider>
      <Assinante />
      {React.cloneElement(botao, { onClick })}
    </GazeProvider>
  );
  const el = screen.getByTestId('alvo');
  document.elementFromPoint = vi.fn(() => el);
  return { onClick, el };
}

const errosDoDespachante = () =>
  (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) =>
    String(c[0]).includes('o despachante do olhar falhou')
  );

beforeEach(() => {
  window.location.hash = '#/menu';
  emitir = () => {};
  recebidas.length = 0;
  aprendizado.forcar = false;
  aprendizado.lancar = false;
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        throw new Error('sem câmera no teste');
      }),
    },
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  relogio = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
});
afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('despachante que falha seguidamente', () => {
  it(`depois de ${FALHAS_DO_DESPACHO_PARA_AVISAR} falhas seguidas a tela avisa; o console recebe um aviso a cada 2 s`, () => {
    montar(<button data-testid="alvo">Ok</button>);
    document.elementFromPoint = vi.fn(() => {
      throw new TypeError('layout quebrado');
    });
    // Menos que o limite: nenhum aviso na tela (uma exceção isolada não é pane).
    let t = olhar((FALHAS_DO_DESPACHO_PARA_AVISAR - 5) * (1000 / 30), 0);
    expect(screen.queryByText(TITULO_DA_FALHA)).not.toBeInTheDocument();
    t = olhar(1500, t);
    expect(screen.getByText(TITULO_DA_FALHA)).toBeInTheDocument();
    // ~2,4 s de falhas a 30 fps (~70 quadros): dois avisos no console, não setenta.
    expect(errosDoDespachante().length).toBe(2);
    // Os assinantes continuaram recebendo as amostras.
    expect(recebidas.length).toBeGreaterThan(60);
  });

  it('o despachante que volta a funcionar tira o aviso', () => {
    const { el } = montar(<button data-testid="alvo">Ok</button>);
    document.elementFromPoint = vi.fn(() => {
      throw new TypeError('layout quebrado');
    });
    const t = olhar(1500, 0);
    expect(screen.getByText(TITULO_DA_FALHA)).toBeInTheDocument();
    document.elementFromPoint = vi.fn(() => el);
    olhar(100, t);
    expect(screen.queryByText(TITULO_DA_FALHA)).not.toBeInTheDocument();
  });

  it('um assinante que lança não derruba os outros nem o clique, e loga com limite', () => {
    const outra: GazeSample[] = [];
    const Quebrado: React.FC = () => {
      const { subscribe } = useGaze();
      useEffect(
        () =>
          subscribe(() => {
            throw new Error('assinante quebrado');
          }),
        [subscribe]
      );
      return null;
    };
    const Bom: React.FC = () => {
      const { subscribe } = useGaze();
      useEffect(() => subscribe((s) => outra.push(s)), [subscribe]);
      return null;
    };
    const onClick = vi.fn();
    render(
      <GazeProvider>
        <Quebrado />
        <Bom />
        <button data-testid="alvo" onClick={onClick}>
          Ok
        </button>
      </GazeProvider>
    );
    const el = screen.getByTestId('alvo');
    document.elementFromPoint = vi.fn(() => el);
    olhar(DWELL_MS + 200, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(outra.length).toBeGreaterThan(40);
    const logs = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) =>
      String(c[0]).includes('subscriber threw')
    );
    expect(logs.length).toBe(1);
  });
});

describe('coordenada não finita', () => {
  it('NaN nunca chega ao elementFromPoint, e o dwell não conta sobre a posição repetida', () => {
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    // Começa o dwell com posição boa…
    let t = olhar(600, 0);
    // …e a predição vira NaN por bem mais que o dwell.
    t = olhar(4000, t, { x: Number.NaN, y: Number.NaN });
    const chamadas = (document.elementFromPoint as unknown as { mock: { calls: number[][] } }).mock.calls;
    expect(chamadas.length).toBeGreaterThan(0);
    expect(chamadas.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
    expect(errosDoDespachante()).toHaveLength(0);
    // Os assinantes recebem a amostra saneada: última posição finita, não medida.
    const ultima = recebidas.at(-1)!;
    expect(ultima.x).toBe(50);
    expect(ultima.y).toBe(50);
    expect(ultima.posicaoMedida).toBe(false);
    // Voltando a posição, o dwell recomeça do zero e completa normalmente.
    t = olhar(DWELL_MS - 300, t);
    expect(onClick).not.toHaveBeenCalled();
    olhar(500, t);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('clique primeiro, aprendizado depois', () => {
  it('o aprendizado que lança não impede o clique', () => {
    aprendizado.forcar = true;
    aprendizado.lancar = true;
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    olhar(DWELL_MS + 200, 0);
    expect(aprenderComSelecao).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
    const logs = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) =>
      String(c[0]).includes('falhou ao aprender')
    );
    expect(logs.length).toBe(1);
    // E não é uma falha do despachante: nenhum aviso de acionamento.
    expect(screen.queryByText(TITULO_DA_FALHA)).not.toBeInTheDocument();
  });

  it('o clique sai ANTES do aprendizado', () => {
    aprendizado.forcar = true;
    const ordem: string[] = [];
    vi.mocked(aprenderComSelecao).mockImplementation(() => {
      ordem.push('aprendeu');
      return undefined as unknown as ReturnType<typeof aprenderComSelecao>;
    });
    const onClick = vi.fn(() => ordem.push('clicou'));
    render(
      <GazeProvider>
        <button data-testid="alvo" onClick={onClick}>
          Ok
        </button>
      </GazeProvider>
    );
    const el = screen.getByTestId('alvo');
    document.elementFromPoint = vi.fn(() => el);
    olhar(DWELL_MS + 200, 0);
    expect(ordem).toEqual(['clicou', 'aprendeu']);
  });
});
