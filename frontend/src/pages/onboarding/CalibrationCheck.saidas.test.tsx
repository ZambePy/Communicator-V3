import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React, { useEffect } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// -----------------------------------------------------------------------------
// Saídas da tela de calibração achadas no percurso da Fase 8 (o fluxograma
// testado como o paciente e o cuidador fariam):
//
// 1. A recalibração rápida começava com a câmera ainda "aguardando" — o botão
//    completo dizia "Ajuste a câmera para começar" e o rápido ia assim mesmo.
// 2. Com o modelo do L2CS sem carregar, nenhum dos dois botões funcionava e a
//    tela mandava "recarregar", o que não traz de volta um arquivo ausente. A
//    saída (calibrar só com a íris) é só para a falha de CARGA: a saída
//    travada depois dela volta sozinha e não pode rebaixar a máquina.
// 3. "Recalibrar" no painel do teste apagava o modelo recém-treinado: sem
//    modelo o olhar não aciona nem o "Começar" nem a Emergência, e um "Voltar"
//    levava ao app sem calibração.
// -----------------------------------------------------------------------------

let l2csStatus: 'ready' | 'error' = 'ready';
/** Provider do L2CS em vigor: `null` enquanto o worker nunca ficou pronto. */
let providerDoL2cs: string | null = null;
let checksProntos = true;
const clear = vi.fn();
const startAccuracyTest = vi.fn();
const gravarExperimento = vi.fn((..._a: unknown[]) => true);

const alvos = Array.from({ length: 9 }, (_, i) => ({ x: 0.1 + (i % 3) * 0.4, y: 0.1 + Math.floor(i / 3) * 0.4 }));

vi.mock('@tracker/accuracy', () => ({
  startAccuracyTest: (...a: unknown[]) => startAccuracyTest(...a),
  abortAccuracyTest: vi.fn(),
}));
vi.mock('../../utils/autoTestMeta', () => ({
  buildAutoTestMeta: () => ({}),
  montarMetaDeMedicao: () => ({}),
}));
vi.mock('@tracker/config/experiment', async (orig) => ({
  ...(await orig<typeof import('@tracker/config/experiment')>()),
  gravarExperimento: (...a: unknown[]) => gravarExperimento(...a),
}));
vi.mock('../../components/ui/ChecksDaCamera', () => ({
  ChecksDaCamera: ({ onPronto }: { onPronto?: (p: boolean) => void }) => {
    useEffect(() => {
      onPronto?.(checksProntos);
    });
    return null;
  },
}));

vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({
    l2csStatus,
    getSessionUptimeMs: () => 1000,
    getDiagnostics: () => ({ l2cs: { executionProvider: providerDoL2cs } }),
    recording: { isActive: () => false, start: vi.fn(), stop: vi.fn() },
    calibration: {
      startCalibrationMode: vi.fn(() => true),
      getCalibrationTargets: () => alvos,
      getCalibrationMode: () => 'full',
      startCollectingPoint: (_x: number, _y: number, done: (ok: boolean) => void) => done(true),
      completeCalibration: (cb?: (o: { ok: true }) => void) => cb?.({ ok: true }),
      getPoseDriftVerdict: () => null,
      setCalibrationDistancesCm: vi.fn(),
      setCameraFovDeg: vi.fn(),
      isCalibrated: () => true,
      clear,
      abort: vi.fn(),
    },
  }),
}));

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { screenDiagonalIn: 23.6, viewingDistanceCm: 60, opticalCondition: 'sem_oculos', dwellMs: 1500 },
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
    </MemoryRouter>,
  );
}

beforeEach(() => {
  l2csStatus = 'ready';
  providerDoL2cs = null;
  checksProntos = true;
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a recalibração rápida espera a câmera como a completa', () => {
  it('com os checks pendentes, os dois botões de começar ficam travados', () => {
    checksProntos = false;
    montar();
    expect(screen.getByTestId('start-calibration-full')).toBeDisabled();
    expect(screen.getByTestId('start-calibration-full')).toHaveTextContent(/Ajuste a câmera/);
    expect(screen.getByTestId('start-calibration-quick')).toBeDisabled();
  });

  it('com a câmera pronta, os dois liberam', () => {
    montar();
    expect(screen.getByTestId('start-calibration-full')).toBeEnabled();
    expect(screen.getByTestId('start-calibration-quick')).toBeEnabled();
  });
});

describe('modelo do L2CS indisponível', () => {
  it('oferece calibrar só com a íris, grava a escolha e recarrega', () => {
    l2csStatus = 'error';
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    try {
      montar();
      expect(screen.getByTestId('start-calibration-full')).toBeDisabled();
      expect(screen.getByText(/calibrar só com a íris/i, { selector: '[role="alert"]' })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('calibrar-so-com-iris'));
      expect(gravarExperimento).toHaveBeenCalledWith('l2cs', 'off');
      expect(reload).toHaveBeenCalled();
      // Alcançável pelo olhar, como os outros caminhos desta tela.
      expect(screen.getByTestId('calibrar-so-com-iris').dataset.recovery).toBe('true');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('com o L2CS pronto a saída não aparece', () => {
    montar();
    expect(screen.queryByTestId('calibrar-so-com-iris')).toBeNull();
  });

  it('sem conseguir gravar a escolha (armazenamento cheio), não recarrega e diz por quê', () => {
    // Recarregar sem a escolha gravada voltaria a esta mesma tela: o botão
    // parecia não fazer nada.
    l2csStatus = 'error';
    gravarExperimento.mockReturnValueOnce(false);
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    try {
      montar();
      fireEvent.click(screen.getByTestId('calibrar-so-com-iris'));
      expect(reload).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/não deu para gravar a escolha/i);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('saída travada DEPOIS da carga: não oferece trocar de modelo e diz que volta sozinho', () => {
    // O worker ficou pronto (há provider) e a saída travou — imagem da câmera
    // parada ou preta. Gravar `l2cs: 'off'` por causa disso rebaixaria a
    // máquina para sempre por um soluço.
    l2csStatus = 'error';
    providerDoL2cs = 'webgpu';
    montar();
    expect(screen.queryByTestId('calibrar-so-com-iris')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/parou de responder/i);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/não carregou/i);
  });
});

describe('"Recalibrar" no painel do teste', () => {
  it('volta ao preparo sem apagar o modelo recém-treinado', () => {
    vi.useFakeTimers();
    montar();
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    for (let i = 0; i < 14; i++) act(() => { vi.advanceTimersByTime(1300); });
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);

    const aoTerminar = startAccuracyTest.mock.calls[0][0] as (r: unknown, a: 'continue' | 'redo') => void;
    act(() => { aoTerminar({ pontosMedidos: 0 }, 'redo'); });

    expect(clear).not.toHaveBeenCalled();
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
  });
});
