import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

/**
 * Revisão final de 22/10/2026 (R1). Um ponto concluído agenda o próximo
 * (`startNextPoint(step + 1)`, ~0,6–1,2 s depois). Se a rodada é interrompida
 * nesse intervalo (a janela perde o foco, a contagem da Emergência abre) e uma
 * NOVA calibração começa antes de o timer disparar, o timer velho achava a
 * tela em `calibrating` e seguia: abria uma coleta da sequência antiga por
 * cima da nova — duas cadeias de coleta disputando o mesmo núcleo. A guarda é
 * o número da sessão de coleta, que já existia para o treino.
 */

const GRADE = Array.from({ length: 9 }, (_, i) => ({ x: 0.1 + (i % 3) * 0.4, y: 0.1 + Math.floor(i / 3) * 0.4 }));

vi.mock('@tracker/accuracy', () => ({ startAccuracyTest: vi.fn(), abortAccuracyTest: vi.fn() }));
vi.mock('../../utils/autoTestMeta', () => ({ buildAutoTestMeta: () => ({}), montarMetaDeMedicao: () => ({}) }));

/** Cada coleta aberta no núcleo, com o callback dela. */
const coletas: Array<{ x: number; y: number; done: (ok: boolean) => void }> = [];

const calibration = {
  startCalibrationMode: vi.fn(() => true),
  getCalibrationTargets: () => GRADE,
  getCalibrationMode: () => 'full',
  startCollectingPoint: (x: number, y: number, done: (ok: boolean) => void) => {
    coletas.push({ x, y, done });
  },
  completeCalibration: vi.fn(),
  getPoseDriftVerdict: () => null,
  getTargetsSkipped: () => [],
  setCalibrationDistancesCm: vi.fn(),
  setCameraFovDeg: vi.fn(),
  getCurrentCameraDistanceCm: () => null,
  isCalibrated: () => true,
  clear: vi.fn(),
  abort: vi.fn(),
  getActiveOpticalCondition: () => 'desconhecido',
  iniciarRodadaDeReforco: vi.fn(() => [] as { x: number; y: number }[]),
  alvosParaRecoletar: vi.fn(() => []),
  iniciarRecoletaDeAlvos: vi.fn(() => []),
  concluirRecoletaDeAlvos: vi.fn(),
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

/** O `PREPARE_MS` da tela: a primeira coleta abre 1,5 s depois do "Começar". */
const PREPARO_MS = 1500;

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  vi.useFakeTimers();
  coletas.length = 0;
  calibration.abort.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

function avancar(ms: number) {
  for (let t = 0; t < ms; t += 25) act(() => { vi.advanceTimersByTime(25); });
}

describe('timer de uma sequência interrompida (revisão final de 22/10/2026)', () => {
  it('não abre coleta na calibração nova que começou logo depois', () => {
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    avancar(PREPARO_MS + 50);
    expect(coletas).toHaveLength(1);

    // O primeiro ponto fecha: o próximo fica agendado.
    act(() => { coletas[0].done(true); });
    // A janela perde o foco antes do próximo ponto: a rodada volta ao início.
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(calibration.abort).toHaveBeenCalled();

    // E a calibração recomeça já (o cuidador clicou de volta em "Começar").
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    const antesDaNova = coletas.length;
    // Até o fim do preparo da sequência NOVA, nenhuma coleta pode abrir: o
    // timer da sequência velha dispara nesse intervalo.
    avancar(PREPARO_MS - 100);
    expect(coletas.length - antesDaNova).toBe(0);
    avancar(200);
    // Agora sim: uma coleta, a do primeiro ponto da sequência nova.
    expect(coletas.length - antesDaNova).toBe(1);
  });
});
