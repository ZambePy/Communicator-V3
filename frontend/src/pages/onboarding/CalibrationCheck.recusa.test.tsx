import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

/**
 * Regressão da tela travada na bola azul.
 *
 * `startCalibrationMode` RECUSA por estado — hoje só por contraluz forte,
 * porque um modelo treinado com o sol na janela não vale depois — devolvendo
 * `false`, sem lançar. A tela ignorava esse retorno: entrava em `calibrating`
 * com o motor parado, a bola pulsava no primeiro alvo para sempre, sem
 * mensagem e sem saída a não ser o botão Voltar.
 *
 * Dois contratos aqui, e o segundo é o mais silencioso dos dois:
 *
 *  1. na recusa a tela volta ao início e diz o motivo (que é acionável:
 *     fechar a cortina, virar a mesa);
 *  2. as distâncias da sessão recusada NÃO são gravadas. Elas são as mesmas
 *     variáveis que o modelo já treinado usa em produção (`mapGaze` e o ganho
 *     `d·tan Δ`): escritas antes da recusa, o paciente voltava a usar um
 *     rastreador funcional com a base de distância da sessão que nem começou —
 *     ~140 px de erro na borda em 1080p, sem nada na tela.
 */

const alvos = Array.from({ length: 9 }, (_, i) => ({
  x: 0.1 + (i % 3) * 0.4,
  y: 0.1 + Math.floor(i / 3) * 0.4,
}));

const startCalibrationMode = vi.fn(() => true);
const getRecusa = vi.fn(() => null as { motivo: string; mensagem: string } | null);
const setCalibrationDistancesCm = vi.fn();
const startCollectingPoint = vi.fn((_x: number, _y: number, done: (ok: boolean) => void) => done(true));

vi.mock('@tracker/accuracy', () => ({
  startAccuracyTest: vi.fn(),
  abortAccuracyTest: vi.fn(),
}));
vi.mock('../../utils/autoTestMeta', () => ({
  buildAutoTestMeta: () => ({}),
  montarMetaDeMedicao: () => ({}),
}));

vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({
    l2csStatus: 'ready',
    getSessionUptimeMs: () => 1000,
    getDiagnostics: () => null,
    recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
    calibration: {
      startCalibrationMode: (...a: unknown[]) => startCalibrationMode(...(a as [])),
      getRecusa: () => getRecusa(),
      getCalibrationTargets: () => alvos,
      getCalibrationMode: () => 'full',
      startCollectingPoint,
      completeCalibration: (cb?: (o: { ok: true }) => void) => cb?.({ ok: true }),
      getPoseDriftVerdict: () => null,
      getCalibrationFitDiagnostics: () => null,
      getTargetsSkipped: () => [],
      setCalibrationDistancesCm,
      setCameraFovDeg: vi.fn(),
      isCalibrated: () => true,
      clear: vi.fn(),
      abort: vi.fn(),
    },
  }),
}));

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { screenDiagonalIn: 23.6, viewingDistanceCm: 60, opticalCondition: 'oculos_simples' },
    updateSettings: vi.fn(),
  }),
}));

import { CalibrationCheck } from './CalibrationCheck';

const MENSAGEM = 'Há muita luz atrás de você. Feche a cortina ou vire a mesa antes de calibrar.';

function comecar() {
  act(() => {
    fireEvent.click(screen.getByTestId('start-calibration-full'));
  });
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

describe('CalibrationCheck — recusa de início não trava a tela', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    startCalibrationMode.mockReset();
    getRecusa.mockReset();
    setCalibrationDistancesCm.mockReset();
    startCollectingPoint.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('recusado: volta ao início, mostra o motivo e não coleta nada', () => {
    startCalibrationMode.mockReturnValue(false);
    getRecusa.mockReturnValue({ motivo: 'contraluz_forte', mensagem: MENSAGEM });

    render(
      <BrowserRouter>
        <CalibrationCheck />
      </BrowserRouter>
    );
    comecar();

    expect(screen.getByText(MENSAGEM)).toBeInTheDocument();
    // De volta ao início: o botão de começar está na tela outra vez.
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
    expect(startCollectingPoint).not.toHaveBeenCalled();
  });

  it('recusado sem motivo legível: ainda assim diz alguma coisa acionável', () => {
    startCalibrationMode.mockReturnValue(false);
    getRecusa.mockReturnValue(null);

    render(
      <BrowserRouter>
        <CalibrationCheck />
      </BrowserRouter>
    );
    comecar();

    expect(screen.getByText(/não foi possível começar a calibração/i)).toBeInTheDocument();
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
  });

  it('recusado: as distâncias da sessão abortada NÃO chegam ao modelo em uso', () => {
    startCalibrationMode.mockReturnValue(false);
    getRecusa.mockReturnValue({ motivo: 'contraluz_forte', mensagem: MENSAGEM });

    render(
      <BrowserRouter>
        <CalibrationCheck />
      </BrowserRouter>
    );
    comecar();

    expect(setCalibrationDistancesCm).not.toHaveBeenCalled();
  });

  it('aceito: o caminho normal segue, e aí sim as distâncias são gravadas', () => {
    startCalibrationMode.mockReturnValue(true);
    getRecusa.mockReturnValue(null);

    render(
      <BrowserRouter>
        <CalibrationCheck />
      </BrowserRouter>
    );
    comecar();

    expect(setCalibrationDistancesCm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(MENSAGEM)).toBeNull();
  });
});
