import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import type { ColetaInterrompida } from '@tracker/calibration';

/**
 * Revisão do pipeline de 20/10/2026 — `startNextPoint` ganhou em 19/10 a guarda
 * "sequência interrompida não segue", mas o treino é disparado pelo callback de
 * `esperarPintura`, que não conferia nada: uma interrupção que chegava DEPOIS
 * do último ponto e ANTES da pintura deixava o `completeCalibration` rodar
 * sobre a sessão cancelada (e, numa recoleta, o fechamento dela seguir para o
 * reforço e o teste por cima da mensagem da interrupção).
 *
 * O teste da revisão (scratchpad/revisao2_pipeline/front/testes/
 * interrupcaoAntesDoTreino.test.tsx) afirmava que o treino rodava depois da
 * interrupção; aqui, invertido: o número da sessão de coleta muda na
 * interrupção, e o callback da pintura não segue.
 */

const GRADE = Array.from({ length: 9 }, (_, i) => ({ x: 0.1 + (i % 3) * 0.4, y: 0.1 + Math.floor(i / 3) * 0.4 }));
const CANTO_RUIM = { x: 0.1, y: 0.9, borda: true, motivos: ['erro'] as const };

const startAccuracyTest = vi.fn();
vi.mock('@tracker/accuracy', () => ({ startAccuracyTest: (...a: unknown[]) => startAccuracyTest(...a), abortAccuracyTest: vi.fn() }));
vi.mock('../../utils/autoTestMeta', () => ({ buildAutoTestMeta: () => ({}), montarMetaDeMedicao: () => ({}) }));
let ouvinte: ((e: ColetaInterrompida) => void) | null = null;
vi.mock('@tracker/calibration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tracker/calibration')>()),
  onColetaInterrompida: (cb: (e: ColetaInterrompida) => void) => {
    ouvinte = cb;
    return () => { if (ouvinte === cb) ouvinte = null; };
  },
}));

const eventos: string[] = [];
let chamadas = 0;
/** Depois de qual coleta (1, 2, …) o núcleo interrompe — no intervalo até a pintura. */
let interromperDepoisDa = GRADE.length;
let rodadaDaInterrupcao: ColetaInterrompida['rodada'] = 'calibracao';
let paraRecoletar: { x: number; y: number; borda: boolean; motivos: readonly string[] }[] = [];
let abrirColetaMs = 0;

const calibration = {
  startCalibrationMode: vi.fn(() => true),
  getCalibrationTargets: () => GRADE,
  getCalibrationMode: () => 'full',
  startCollectingPoint: (_x: number, _y: number, done: (ok: boolean) => void) => {
    chamadas++;
    done(true);
    if (chamadas === interromperDepoisDa) {
      // Logo depois do passo final (`startNextPoint(n)` → `setStage('testing')`
      // → `esperarPintura`): o núcleo interrompe a coleta (o recorte do modelo
      // do rosto mudou) e a tela volta ao início com a explicação.
      setTimeout(() => {
        eventos.push('interrupção');
        ouvinte?.({ motivo: 'lado_do_recorte', rodada: rodadaDaInterrupcao, detalhe: 'x', em: 0 });
      }, abrirColetaMs + 1);
    }
  },
  completeCalibration: vi.fn((cb?: (o: { ok: true }) => void) => { eventos.push('completeCalibration'); cb?.({ ok: true }); }),
  getPoseDriftVerdict: () => null,
  getTargetsSkipped: () => [],
  setCalibrationDistancesCm: vi.fn(),
  setCameraFovDeg: vi.fn(),
  getCurrentCameraDistanceCm: () => null,
  isCalibrated: () => true,
  clear: vi.fn(),
  abort: vi.fn(() => { eventos.push('abort'); }),
  getActiveOpticalCondition: () => 'desconhecido',
  iniciarRodadaDeReforco: vi.fn(() => { eventos.push('iniciarRodadaDeReforco'); return [] as { x: number; y: number }[]; }),
  alvosParaRecoletar: vi.fn(() => paraRecoletar),
  iniciarRecoletaDeAlvos: vi.fn((alvos: { x: number; y: number }[]) => alvos.map((a) => ({ x: a.x, y: a.y }))),
  concluirRecoletaDeAlvos: vi.fn((cb?: (r: { aceito: boolean }) => void) => { eventos.push('concluirRecoletaDeAlvos'); cb?.({ aceito: true }); }),
  podeRecoletarAlvos: () => true,
};
const recording = { isActive: () => false, start: vi.fn(), stop: vi.fn(), getStats: () => ({ frames: 0, dropped: 0 }), exportAsJSONL: () => '', clear: vi.fn() };
vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({ l2csStatus: 'ready', getSessionUptimeMs: () => 1000, getDiagnostics: () => null, recording, calibration }),
}));
vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({ settings: { screenDiagonalIn: 23.6, viewingDistanceCm: 60, screenGeometrySource: 'default', screenScaleFactor: 1, linguagemDoRelatorio: 'tecnica' }, updateSettings: vi.fn() }),
}));

import i18n from '../../i18n';
import { CalibrationCheck } from './CalibrationCheck';
import { aberturaDaColetaMs } from '@tracker/calibration';

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  vi.useFakeTimers();
  eventos.length = 0;
  chamadas = 0;
  interromperDepoisDa = GRADE.length;
  rodadaDaInterrupcao = 'calibracao';
  paraRecoletar = [];
  abrirColetaMs = aberturaDaColetaMs();
  startAccuracyTest.mockClear();
  calibration.completeCalibration.mockClear();
  calibration.concluirRecoletaDeAlvos.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

function rodar() {
  render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
  act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
  for (let i = 0; i < 600; i++) act(() => { vi.advanceTimersByTime(25); });
}

describe('interrupção entre o último ponto e o treino (revisão de 20/10/2026)', () => {
  it('o treino não roda: a tela fica no início, com a explicação, e o teste de precisão não abre', () => {
    expect(abrirColetaMs).toBeLessThanOrEqual(2_000);
    rodar();
    expect(eventos).toContain('interrupção');
    expect(eventos).not.toContain('completeCalibration');
    expect(eventos).not.toContain('iniciarRodadaDeReforco');
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
    expect(screen.getByText(/precisou reiniciar a leitura do rosto no meio da calibração/)).toBeInTheDocument();
    expect(startAccuracyTest).not.toHaveBeenCalled();
  });

  it('sem interrupção, o caminho é o de sempre: um treino e o teste de precisão', () => {
    interromperDepoisDa = -1;
    rodar();
    expect(eventos.filter((e) => e === 'completeCalibration')).toHaveLength(1);
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);
  });

  it('na recoleta automática, o mesmo: ela não é fechada e a tela não segue para o reforço e o teste', () => {
    paraRecoletar = [CANTO_RUIM];
    interromperDepoisDa = GRADE.length + 1; // a coleta do canto refeito
    rodadaDaInterrupcao = 'recoleta';
    rodar();
    expect(eventos.filter((e) => e === 'completeCalibration')).toHaveLength(1); // o da calibração, antes da recoleta
    expect(eventos).toContain('interrupção');
    expect(eventos).not.toContain('concluirRecoletaDeAlvos');
    expect(eventos).not.toContain('iniciarRodadaDeReforco');
    expect(startAccuracyTest).not.toHaveBeenCalled();
    expect(screen.getByText(/enquanto refazíamos alguns pontos/)).toBeInTheDocument();
  });
});
