import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { FatigueIndicator, FATIGUE_POLL_INTERVAL_MS, MIN_CONSECUTIVE_ABOVE } from './FatigueIndicator';

// A evolução semanal conta os avisos de fadiga (21/10/2026). Contar é uma
// consequência do aviso, não pode mudar quando ele aparece: UMA vez por aviso,
// só quando o aviso sustentado dispara (não num pico único) e nunca de novo
// enquanto ele continua visível.

let mockBlinkRate = 0;
const stableCalibration = { getRecentBlinkRatePerMinute: (_windowMs?: number) => mockBlinkRate };

vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ calibration: stableCalibration, isDegraded: false }),
}));

vi.mock('./ui/GazeButton', () => ({
  GazeButton: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}));

const registrarAvisoDeFadiga = vi.fn();
vi.mock('../services/evolucao/registroDeUso', () => ({
  registrarAvisoDeFadiga: (agora: number) => registrarAvisoDeFadiga(agora),
}));

describe('FatigueIndicator registra o aviso na evolução', () => {
  beforeEach(() => {
    mockBlinkRate = 0;
    registrarAvisoDeFadiga.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const renderAt = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
      <FatigueIndicator />
    </MemoryRouter>,
  );
  const polls = (n: number) => {
    act(() => { vi.advanceTimersByTime(FATIGUE_POLL_INTERVAL_MS * n + 50); });
  };

  it('registra uma vez, com a hora do aviso, quando a taxa sustentada faz o aviso aparecer', () => {
    mockBlinkRate = 30;
    renderAt('/menu');
    // O primeiro poll roda na montagem; faltando um poll, ainda não é sustentado.
    polls(MIN_CONSECUTIVE_ABOVE - 2);
    expect(registrarAvisoDeFadiga).not.toHaveBeenCalled();
    polls(1);
    expect(registrarAvisoDeFadiga).toHaveBeenCalledTimes(1);
    // A hora é a do aviso (3º poll, 20 s depois da montagem), não a de agora.
    const inicio = Date.parse('2026-10-21T15:00:00Z');
    const hora = registrarAvisoDeFadiga.mock.calls[0][0] as number;
    expect(hora).toBeGreaterThanOrEqual(inicio + 2 * FATIGUE_POLL_INTERVAL_MS);
    expect(hora).toBeLessThan(inicio + 3 * FATIGUE_POLL_INTERVAL_MS);
  });

  it('não registra de novo enquanto o aviso continua visível', () => {
    mockBlinkRate = 30;
    renderAt('/menu');
    polls(MIN_CONSECUTIVE_ABOVE + 6);
    expect(registrarAvisoDeFadiga).toHaveBeenCalledTimes(1);
  });

  it('um pico único não é aviso e não conta', () => {
    renderAt('/menu');
    mockBlinkRate = 40;
    polls(1);
    mockBlinkRate = 5;
    polls(8);
    expect(registrarAvisoDeFadiga).not.toHaveBeenCalled();
  });

  it('um novo aviso, depois de a taxa baixar e subir de novo, conta outra vez', () => {
    mockBlinkRate = 30;
    renderAt('/menu');
    polls(MIN_CONSECUTIVE_ABOVE);
    expect(registrarAvisoDeFadiga).toHaveBeenCalledTimes(1);
    mockBlinkRate = 5;
    polls(2);
    mockBlinkRate = 30;
    polls(MIN_CONSECUTIVE_ABOVE);
    expect(registrarAvisoDeFadiga).toHaveBeenCalledTimes(2);
  });

  it('se o registro quebrar, o aviso aparece do mesmo jeito (contar nunca derruba o aviso)', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registrarAvisoDeFadiga.mockImplementationOnce(() => { throw new Error('armazenamento cheio'); });
    mockBlinkRate = 30;
    const { queryByTestId } = renderAt('/menu');
    polls(MIN_CONSECUTIVE_ABOVE);
    expect(queryByTestId('fatigue-indicator')).not.toBeNull();
    // A falha não é calada: vai ao console (e o registro diz na tela, por conta própria).
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining('[fadiga]'), expect.any(Error));
    aviso.mockRestore();
  });
});
