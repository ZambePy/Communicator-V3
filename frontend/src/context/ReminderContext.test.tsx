import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { ReminderProvider, useReminders } from './ReminderContext';

const mockUseGaze = vi.fn(() => ({
  isComposing: false,
  setIsComposing: () => {},
}));
vi.mock('./GazeContext', () => ({
  useGaze: () => mockUseGaze(),
}));

let testIsComposing = false;
const wrapper = ({ children }: { children: React.ReactNode }) => {
  mockUseGaze.mockReturnValue({ isComposing: testIsComposing, setIsComposing: () => {} });
  return <ReminderProvider>{children}</ReminderProvider>;
};

describe('ReminderContext — Rotinas e Lembretes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testIsComposing = false;
    mockUseGaze.mockReturnValue({
      isComposing: false,
      setIsComposing: () => {},
    });
    localStorage.clear();
  });

  // FE-20: toda instalação nova abria às 16:00 o modal "Medicação da tarde",
  // um lembrete clínico que ninguém tinha configurado.
  it('instalação nova começa SEM lembretes e suporta CRUD básico', () => {
    const { result } = renderHook(() => useReminders(), { wrapper });
    expect(result.current.reminders).toEqual([]);

    // Adição
    act(() => {
      result.current.addReminder({ title: 'Fisioterapia Pulmonar', time: '11:30' });
    });
    expect(result.current.reminders.length).toBe(1);
    expect(result.current.reminders[0].title).toBe('Fisioterapia Pulmonar');
    expect(result.current.reminders[0].time).toBe('11:30');

    // Exclusão
    const idToDelete = result.current.reminders[0].id;
    act(() => {
      result.current.deleteReminder(idToDelete);
    });
    expect(result.current.reminders.length).toBe(0);
  });

  it('sem lembrete cadastrado, nada abre sobre a tela do paciente (nem às 16:00)', () => {
    vi.useFakeTimers();
    const as16 = new Date();
    as16.setHours(16, 0, 0);
    vi.setSystemTime(as16);
    const { result } = renderHook(() => useReminders(), { wrapper });
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(result.current.activeReminder).toBeNull();
    vi.useRealTimers();
  });

  it('deve suspender disparos se o usuário estiver digitando (composing) e disparar ao desocupar', () => {
    // 1. Configura timers falsos antes de montar o hook
    vi.useFakeTimers();
    const mockTime = new Date();
    mockTime.setHours(10, 0, 0); // Coincide com o lembrete cadastrado para as 10:00
    vi.setSystemTime(mockTime);
    localStorage.setItem('irisflow_reminders', JSON.stringify([{ id: 'r1', title: 'Tomar água', time: '10:00' }]));

    // 2. Monta o hook com isComposing = true via closure
    testIsComposing = true;
    const { result, rerender } = renderHook(() => useReminders(), { wrapper });
    expect(result.current.activeReminder).toBeNull();

    // 3. Dispara a verificação em background (intervalo de 10s)
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // O lembrete disparou, mas isComposing=true deve ter impedido a exibição imediata
    expect(result.current.activeReminder).toBeNull();

    // 4. Simula que o usuário enviou/limpou o texto (isComposing = false)
    act(() => {
      testIsComposing = false;
      rerender();
    });

    // Agora o lembrete deve estar ativo
    expect(result.current.activeReminder).not.toBeNull();
    expect(result.current.activeReminder?.title).toBe('Tomar água');

    // Descarta o lembrete
    act(() => {
      result.current.dismissActiveReminder();
    });
    expect(result.current.activeReminder).toBeNull();

    vi.useRealTimers();
  });
});
