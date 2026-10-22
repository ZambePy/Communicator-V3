import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

// -----------------------------------------------------------------------------
// Contraluz no provider (relato de 19/10/2026, falhas silenciosas #1).
//
// Antes: com uma janela às costas o EAR mentia, o detector de olhos fechados
// acusava, e a tela dizia "os olhos estão fechados… levante o olhar" — a coisa
// errada a fazer. E o cursor congelado na última posição seguia aceitando dwell.
// Agora o engine marca as amostras com `motivo: 'contraluz'` e o provider:
//   - mostra o aviso da luz, com prioridade, e não alimenta o detector de olhos;
//   - na fase 2 (posição não medida) não aciona nada, nem a Emergência;
//   - na fase 3 (predição degradada) aciona só a Emergência, com dwell maior.
// -----------------------------------------------------------------------------

let emitir: (s: GazeSample) => void = () => {};
/** O relógio do provider (`performance.now`) acompanha o carimbo das amostras:
 *  o detector de olhos fechados mede o tempo por ele. */
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
  // Consultado pelo vigia de recalibração, a cada 15 s.
  precisaDeRecalibracao: () => ({ precisa: false, motivo: null }),
  setFilterPreset: vi.fn(),
  calibration: {
    isCalibrated: () => true,
    onInvalidated: () => () => {},
    setCameraFovDeg: vi.fn(),
    setEyeDominance: vi.fn(),
    abort: vi.fn(),
    clear: vi.fn(),
    // Lidos pelo aviso de distância, a 2 Hz.
    getDistanceRange: () => null,
    getCalibrationDistancesCm: () => ({ cameraCm: null, screenCm: null }),
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

import { GazeProvider } from './GazeContext';
import {
  estadoDoProblemaPersistente,
  PERSISTENTE_APOS_MS,
  _reiniciarParaTeste as reiniciarProblemas,
} from '../services/problemaDoRastreamento';

const DWELL_MS = 1500;
const TITULO_DA_LUZ = 'Luz forte atrás de você';
const TITULO_DOS_OLHOS = 'Não estou vendo bem os seus olhos';

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

/** Fase 2 do episódio: a posição não é medida, o cursor espera parado. */
const FASE_DE_ESPERA: Partial<GazeSample> = {
  motivo: 'contraluz',
  degraded: true,
  eyeState: 'unknown',
  posicaoMedida: false,
};
/** Fase 3: a predição volta, degradada — só Emergência e recuperação. */
const FASE_DE_EMERGENCIA: Partial<GazeSample> = {
  motivo: 'contraluz',
  degraded: true,
  eyeState: 'unknown',
};

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

function montar(botao: React.ReactElement<{ onClick?: () => void }>) {
  const onClick = vi.fn();
  render(<GazeProvider>{React.cloneElement(botao, { onClick })}</GazeProvider>);
  const el = screen.getByTestId('alvo');
  // jsdom não implementa layout: `elementFromPoint` devolveria null sempre.
  document.elementFromPoint = vi.fn(() => el);
  return { onClick, el };
}

beforeEach(() => {
  window.location.hash = '#/menu';
  emitir = () => {};
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

describe('aviso da contraluz', () => {
  it('controle: olhos fechados por mais de 2,6 s SEM contraluz acendem o aviso dos olhos', () => {
    montar(<button data-testid="alvo">Ok</button>);
    olhar(3500, 0, { eyeState: 'closed' });
    expect(screen.getByText(TITULO_DOS_OLHOS)).toBeInTheDocument();
    expect(screen.queryByText(TITULO_DA_LUZ)).not.toBeInTheDocument();
  });

  it('com contraluz, o mesmo "olho fechado" NÃO vira aviso de olhos: a tela fala da luz', () => {
    montar(<button data-testid="alvo">Ok</button>);
    olhar(3500, 0, { ...FASE_DE_ESPERA, eyeState: 'closed' });
    expect(screen.getByText(TITULO_DA_LUZ)).toBeInTheDocument();
    expect(screen.queryByText(TITULO_DOS_OLHOS)).not.toBeInTheDocument();
    // Nada de culpar a pessoa nem de mandar levantar o olhar.
    expect(screen.queryByText(/levante/i)).not.toBeInTheDocument();
    expect(screen.getByText(/o cursor espera parado/)).toBeInTheDocument();
  });

  it('na fase 3 o texto diz o que o olhar ainda aciona', () => {
    montar(<button data-testid="alvo">Ok</button>);
    const t = olhar(500, 0, FASE_DE_ESPERA);
    olhar(500, t, FASE_DE_EMERGENCIA);
    expect(screen.getByText(/só aciona a Emergência e os botões de recuperação/)).toBeInTheDocument();
  });

  it('o rosto que some e volta numa silhueta não apaga o aviso da luz', () => {
    montar(<button data-testid="alvo">Ok</button>);
    let t = olhar(600, 0, FASE_DE_ESPERA);
    // Sem rosto a amostra não diz nada sobre a luz: o episódio continua.
    t = olhar(3000, t, { hasFace: false, eyeState: 'unknown' });
    expect(screen.getByText(TITULO_DA_LUZ)).toBeInTheDocument();
    olhar(300, t, FASE_DE_ESPERA);
    expect(screen.getByText(TITULO_DA_LUZ)).toBeInTheDocument();
  });

  it('a contraluz que dura vira problema persistente no serviço (a entrada do aviso ao cuidador)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    // A câmera nunca responde: sem isto, a falha dela viraria o aviso em vigor.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => new Promise(() => {})) },
    });
    try {
      reiniciarProblemas();
      montar(<button data-testid="alvo">Ok</button>);
      olhar(600, 0, FASE_DE_ESPERA);
      expect(estadoDoProblemaPersistente()).toBeNull();
      act(() => {
        vi.advanceTimersByTime(PERSISTENTE_APOS_MS + 2000);
      });
      const p = estadoDoProblemaPersistente();
      expect(p?.tipo).toBe('contraluz');
      // O mesmo texto calmo que a tela mostra: título e detalhe.
      expect(p?.mensagem).toMatch(/^Luz forte atrás de você\. /);
      expect(p?.mensagem).toMatch(/o cursor espera parado/);
    } finally {
      vi.useRealTimers();
      reiniciarProblemas();
    }
  });

  it('a luz resolvida tira o aviso', () => {
    montar(<button data-testid="alvo">Ok</button>);
    const t = olhar(600, 0, FASE_DE_ESPERA);
    expect(screen.getByText(TITULO_DA_LUZ)).toBeInTheDocument();
    olhar(200, t);
    expect(screen.queryByText(TITULO_DA_LUZ)).not.toBeInTheDocument();
  });
});

describe('o que o olhar aciona sob contraluz', () => {
  it('fase 2 (posição não medida): nem a Emergência é acionada, por mais tempo que passe', () => {
    const { onClick } = montar(
      <button data-testid="alvo" data-emergency="true">
        Emergência
      </button>
    );
    olhar(8000, 0, FASE_DE_ESPERA);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fase 3: a Emergência é acionada, com o dobro do dwell', () => {
    const { onClick } = montar(
      <button data-testid="alvo" data-emergency="true">
        Emergência
      </button>
    );
    let t = olhar(3000, 0, FASE_DE_ESPERA);
    // A espera não deixou progresso guardado: a fase 3 começa do zero.
    t = olhar(2 * DWELL_MS - 300, t, FASE_DE_EMERGENCIA);
    expect(onClick).not.toHaveBeenCalled();
    olhar(400, t, FASE_DE_EMERGENCIA);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fase 3: um botão comum não é acionado', () => {
    const { onClick } = montar(<button data-testid="alvo">Sim</button>);
    olhar(8000, 0, FASE_DE_EMERGENCIA);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('controle: sem contraluz, o mesmo botão comum é acionado no dwell normal', () => {
    const { onClick } = montar(<button data-testid="alvo">Sim</button>);
    olhar(DWELL_MS + 200, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
