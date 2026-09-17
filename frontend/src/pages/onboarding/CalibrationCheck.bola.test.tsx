import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

/**
 * A tela de coleta é UMA bola azul que percorre a grade.
 *
 * O desenho antigo desenhava nove elementos: um ponto cinza em cada posição
 * futura, o alvo aceso, um ✓ no recém-concluído. O paciente via um campo de
 * pontos e tinha de descobrir qual deles era o de agora — e o ponto cinza, que
 * existia para "avisar onde o alvo vai aparecer", é justamente um segundo
 * ponto claro competindo pela fixação que se está tentando medir.
 *
 * Este arquivo trava as três propriedades que o desenho novo depende:
 * uma bola só, ordem de leitura, e pulso apenas durante a coleta.
 */

const GRADE = [
  { x: 0.1, y: 0.1 },
  { x: 0.5, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.9, y: 0.5 },
  { x: 0.1, y: 0.9 },
  { x: 0.5, y: 0.9 },
  { x: 0.9, y: 0.9 },
];

/** Grade devolvida FORA de ordem, para provar que a tela é quem ordena. */
const GRADE_EMBARALHADA = [
  GRADE[8],
  GRADE[3],
  GRADE[0],
  GRADE[5],
  GRADE[7],
  GRADE[1],
  GRADE[4],
  GRADE[6],
  GRADE[2],
];

/** Callback da coleta em curso — só chamado quando o teste mandar. */
let concluirColeta: ((ok: boolean) => void) | null = null;

const startCollectingPoint = vi.fn((_x: number, _y: number, done: (ok: boolean) => void) => {
  concluirColeta = done;
});

vi.mock('@tracker/accuracy', () => ({
  startAccuracyTest: vi.fn(),
  abortAccuracyTest: vi.fn(),
}));
vi.mock('../../utils/autoTestMeta', () => ({ buildAutoTestMeta: () => ({}) }));

vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({
    l2csStatus: 'ready',
    getSessionUptimeMs: () => 1000,
    getDiagnostics: () => null,
    recording: { isActive: () => false, start: vi.fn(), stop: vi.fn() },
    calibration: {
      startCalibrationMode: vi.fn(),
      getCalibrationTargets: () => GRADE_EMBARALHADA,
      getCalibrationMode: () => 'full',
      startCollectingPoint: (...a: unknown[]) =>
        startCollectingPoint(...(a as [number, number, (ok: boolean) => void])),
      completeCalibration: (cb?: (o: { ok: true }) => void) => cb?.({ ok: true }),
      getPoseDriftVerdict: () => null,
      setCalibrationDistancesCm: vi.fn(),
      setCameraFovDeg: vi.fn(),
      isCalibrated: () => true,
      clear: vi.fn(),
    },
  }),
}));

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      screenDiagonalIn: 23.6,
      viewingDistanceCm: 60,
      opticalCondition: 'oculos_simples',
    },
    updateSettings: vi.fn(),
  }),
}));

import { CalibrationCheck } from './CalibrationCheck';

const PREPARO_MS = 1500;

function iniciar() {
  render(
    <BrowserRouter>
      <CalibrationCheck />
    </BrowserRouter>
  );
  act(() => {
    fireEvent.click(screen.getByTestId('start-calibration-full'));
  });
  // A tela mostra "Prepare-se" antes de abrir a primeira janela de coleta.
  act(() => {
    vi.advanceTimersByTime(PREPARO_MS + 10);
  });
}

function bola(): HTMLElement {
  return screen.getByTestId('calib-bola');
}

/** Fecha o ponto em curso e deixa a bola chegar no próximo. */
function concluirPonto() {
  act(() => {
    concluirColeta?.(true);
  });
  act(() => {
    vi.advanceTimersByTime(1300);
  });
}

describe('CalibrationCheck — a bola que percorre a grade', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    concluirColeta = null;
    startCollectingPoint.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('desenha UMA bola, não um elemento por alvo', () => {
    iniciar();
    expect(screen.getAllByTestId('calib-bola')).toHaveLength(1);
    // `data-calibration-target` é o que esconde o botão de emergência quando
    // um alvo passa por baixo dele: antes eram nove marcados, agora é um.
    expect(document.querySelectorAll('[data-calibration-target]')).toHaveLength(1);
  });

  it('é o MESMO nó que muda de posição — a bola não é recriada a cada alvo', () => {
    iniciar();
    const primeira = bola();
    concluirPonto();
    expect(bola()).toBe(primeira);
    concluirPonto();
    expect(bola()).toBe(primeira);
  });

  it('percorre a grade em ordem de leitura, mesmo com o motor devolvendo embaralhado', () => {
    iniciar();
    for (let i = 0; i < GRADE.length - 1; i++) concluirPonto();

    const percorridos = startCollectingPoint.mock.calls.map((c) => [
      Math.round((c[0] as number) * 100) / 100,
      Math.round((c[1] as number) * 100) / 100,
    ]);
    expect(percorridos).toEqual(GRADE.map((p) => [p.x, p.y]));
  });

  it('começa no canto superior esquerdo', () => {
    iniciar();
    expect(startCollectingPoint.mock.calls[0].slice(0, 2)).toEqual([0.1, 0.1]);
  });

  it('pulsa SÓ enquanto a janela de coleta está aberta', () => {
    iniciar();
    // Coletando: o pulso é o sinal de "estou medindo agora".
    expect(bola()).toHaveAttribute('data-coletando', 'true');
    expect(bola().querySelector('.cf-bola--coletando')).not.toBeNull();

    // Ponto fechado: a bola continua na tela, sem pulsar, a caminho do próximo.
    act(() => {
      concluirColeta?.(true);
    });
    expect(bola()).toHaveAttribute('data-coletando', 'false');
    expect(bola().querySelector('.cf-bola--coletando')).toBeNull();
    expect(bola().querySelector('.cf-bola')).not.toBeNull();
  });

  it('mantém o contador e a instrução que já existiam', () => {
    render(
      <BrowserRouter>
        <CalibrationCheck />
      </BrowserRouter>
    );
    act(() => {
      fireEvent.click(screen.getByTestId('start-calibration-full'));
    });
    // Durante o preparo a instrução está na tela e o contador começa em 00/09.
    expect(screen.getByText(/Siga o ponto com os olhos/)).toBeInTheDocument();
    expect(screen.getByTestId('calib-progress-total')).toHaveTextContent('09');
  });
});
