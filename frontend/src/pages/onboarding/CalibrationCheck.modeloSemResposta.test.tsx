import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React, { useEffect } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// -----------------------------------------------------------------------------
// Modelo do olhar sem resposta na calibração (relato de 19/10/2026, auditoria
// A3 e falhas silenciosas #10).
//
// 1. Com o bloco angular zerado em todas as amostras, o treino recusa por
//    "features mortas" — e a tela dizia que a causa mais comum é reflexo nos
//    ÓCULOS. A causa ali é o modelo; mandar tirar os óculos é pedir o esforço
//    errado a quem tem pouca energia para gastar.
// 2. Um worker que morreu e está sendo reiniciado não é "não carregou": a tela
//    não pode oferecer calibrar só com a íris (gravado no disco) por um soluço.
// -----------------------------------------------------------------------------

type Desfecho = { ok: true } | { ok: false; reason: string; detail: string; causa?: string };

let desfecho: Desfecho = { ok: true };
let l2csStatus: 'ready' | 'error' = 'ready';
let diagDoL2cs: Record<string, unknown> = { status: 'ready', executionProvider: 'webgpu' };
/** O que o diagnóstico passa a dizer do L2CS no instante do fim do treino. */
let l2csNoFimDoTreino: Record<string, unknown> | null = null;

const alvos = Array.from({ length: 9 }, (_, i) => ({ x: 0.1 + (i % 3) * 0.4, y: 0.1 + Math.floor(i / 3) * 0.4 }));

vi.mock('@tracker/accuracy', () => ({
  startAccuracyTest: vi.fn(),
  abortAccuracyTest: vi.fn(),
}));
vi.mock('../../utils/autoTestMeta', () => ({
  buildAutoTestMeta: () => ({}),
  montarMetaDeMedicao: () => ({}),
}));
vi.mock('../../components/ui/ChecksDaCamera', () => ({
  ChecksDaCamera: ({ onPronto }: { onPronto?: (p: boolean) => void }) => {
    useEffect(() => {
      onPronto?.(true);
    });
    return null;
  },
}));

vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({
    l2csStatus,
    getSessionUptimeMs: () => 1000,
    getDiagnostics: () => ({ l2cs: diagDoL2cs }),
    recording: { isActive: () => false, start: vi.fn(), stop: vi.fn() },
    calibration: {
      startCalibrationMode: vi.fn(() => true),
      getCalibrationTargets: () => alvos,
      getCalibrationMode: () => 'full',
      startCollectingPoint: (_x: number, _y: number, done: (ok: boolean) => void) => done(true),
      completeCalibration: (cb?: (o: Desfecho) => void) => {
        if (l2csNoFimDoTreino) diagDoL2cs = l2csNoFimDoTreino;
        cb?.(desfecho);
      },
      getPoseDriftVerdict: () => null,
      setCalibrationDistancesCm: vi.fn(),
      setCameraFovDeg: vi.fn(),
      isCalibrated: () => false,
      clear: vi.fn(),
      abort: vi.fn(),
    },
  }),
}));

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { screenDiagonalIn: 23.6, viewingDistanceCm: 60, opticalCondition: 'oculos_simples', dwellMs: 1500 },
    updateSettings: vi.fn(),
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ currentProfile: { id: 'p1', name: 'Joana' } }),
}));

import { CalibrationCheck } from './CalibrationCheck';

function montar() {
  return render(
    <MemoryRouter initialEntries={['/calibration-check']}>
      <Routes>
        <Route path="/calibration-check" element={<CalibrationCheck />} />
        <Route path="/menu" element={<div>tela de menu</div>} />
      </Routes>
    </MemoryRouter>
  );
}

/** Começa a calibração completa e anda pelos nove pontos até o treino. */
function calibrar(): void {
  act(() => {
    fireEvent.click(screen.getByTestId('start-calibration-full'));
  });
  for (let i = 0; i < 14; i++) {
    act(() => {
      vi.advanceTimersByTime(1300);
    });
  }
}

const DETALHE_MORTAS = '[calib] degenerate_features: mais de 30% das dimensões não variam entre alvos.';

beforeEach(() => {
  vi.useFakeTimers();
  desfecho = { ok: true };
  l2csStatus = 'ready';
  diagDoL2cs = { status: 'ready', executionProvider: 'webgpu' };
  l2csNoFimDoTreino = null;
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('features mortas: a culpa é do modelo ou do reflexo?', () => {
  it('controle: features mortas sem causa marcada e modelo bem — a mensagem de sempre, do reflexo', () => {
    desfecho = { ok: false, reason: 'degenerate_features', detail: DETALHE_MORTAS };
    montar();
    calibrar();
    expect(screen.getByText(/reflexo nos óculos/)).toBeInTheDocument();
  });

  it('o núcleo marcou o bloco angular zerado: fala do modelo, sem mencionar os óculos', () => {
    desfecho = {
      ok: false,
      reason: 'degenerate_features',
      detail: `${DETALHE_MORTAS} [bloco_angular_zerado]`,
      causa: 'bloco_angular_zerado',
    };
    montar();
    calibrar();
    const aviso = screen.getByText(/O modelo do olhar não respondeu durante a calibração/);
    expect(aviso).toHaveTextContent(/Não é nada que você tenha feito/);
    // A mensagem não fala de óculos (o seletor da condição óptica, sim — ele
    // é outra coisa e continua na tela).
    expect(aviso.textContent).not.toMatch(/óculos/);
    expect(screen.queryByText(/reflexo nos óculos/)).not.toBeInTheDocument();
  });

  it('o modelo morreu no meio da coleta (em erro no fim do treino): também fala do modelo', () => {
    desfecho = { ok: false, reason: 'degenerate_features', detail: DETALHE_MORTAS };
    l2csNoFimDoTreino = { status: 'error', motivoDoErro: 'falha_do_worker', executionProvider: 'webgpu' };
    montar();
    calibrar();
    expect(screen.getByText(/O modelo do olhar não respondeu durante a calibração/)).toBeInTheDocument();
    expect(screen.queryByText(/reflexo nos óculos/)).not.toBeInTheDocument();
  });

  it('outra recusa, com o modelo em erro, continua com a mensagem dela', () => {
    desfecho = { ok: false, reason: 'insufficient_samples', detail: 'poucas amostras' };
    l2csNoFimDoTreino = { status: 'error', motivoDoErro: 'falha_do_worker' };
    montar();
    calibrar();
    expect(screen.getByText(/Amostras insuficientes coletadas/)).toBeInTheDocument();
  });
});

describe('modelo do rosto em reinício não é "não carregou"', () => {
  it('worker em reinício: diz que está reiniciando e não oferece calibrar só com a íris', () => {
    l2csStatus = 'error';
    diagDoL2cs = {
      status: 'error',
      motivoDoErro: 'falha_do_worker',
      reinicio: { tentativas: 1, desistiu: false },
      executionProvider: null,
    };
    montar();
    expect(screen.getByRole('alert')).toHaveTextContent(/Estou reiniciando ele sozinho/);
    expect(screen.queryByTestId('calibrar-so-com-iris')).toBeNull();
  });

  it('acabadas as tentativas: aí sim, a saída é calibrar só com a íris', () => {
    l2csStatus = 'error';
    diagDoL2cs = {
      status: 'error',
      motivoDoErro: 'falha_do_worker',
      reinicio: { tentativas: 4, desistiu: true },
      executionProvider: 'webgpu',
    };
    montar();
    expect(screen.getByTestId('calibrar-so-com-iris')).toBeInTheDocument();
  });

  it('falha de carga (a meta não combina com o modelo): calibrar só com a íris', () => {
    l2csStatus = 'error';
    diagDoL2cs = { status: 'error', motivoDoErro: 'carga', reinicio: null, executionProvider: null };
    montar();
    expect(screen.getByTestId('calibrar-so-com-iris')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/não carregou/);
  });
});
