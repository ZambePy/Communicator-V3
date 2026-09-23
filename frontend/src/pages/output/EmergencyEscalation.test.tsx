import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { EmergencyEscalation } from './EmergencyEscalation';

// O único envio da tela é o pedido de ajuda no barramento da nuvem (que o modo
// apresentação corta). Nada de backend de demonstração em localhost.
const emitirPedidoDeAjuda = vi.fn();
vi.mock('../../cloud/eventos', () => ({
  emitirPedidoDeAjuda: (...a: unknown[]) => emitirPedidoDeAjuda(...a),
}));
const fetchEspiao = vi.fn();

// Mock GazePageLayout para simplificar os testes de renderização da página
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Estado da nuvem controlado pelo teste: prazo remoto e confirmação do cuidador.
const cloud: { ajustesRemotos: { emergency_timeout_s: number } | null; reconhecimento: { id: string; kind: string; created_at: string; acknowledged_at: string; resolved_at: string | null } | null } = {
  ajustesRemotos: null,
  reconhecimento: null,
};
vi.mock('../../cloud/CloudContext', () => ({ useCloud: () => cloud }));

describe('EmergencyEscalation Page — Escalonamento de Emergência', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    emitirPedidoDeAjuda.mockClear();
    fetchEspiao.mockClear();
    vi.stubGlobal('fetch', fetchEspiao);
    cloud.ajustesRemotos = null;
    cloud.reconhecimento = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deve carregar os botões e permitir disparo manual de socorro', () => {
    render(
      <MemoryRouter initialEntries={['/emergency']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /emergency.items.pain/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /emergency.items.breath/i })).toBeInTheDocument();

    // Dispara Dor
    fireEvent.click(screen.getByRole('button', { name: /emergency.items.pain/i }));

    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    expect(emitirPedidoDeAjuda).toHaveBeenCalledWith('emergencia', 'emergency.items.pain');
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(screen.getByText(/Seu alerta foi enviado. Aguarde atendimento./i)).toBeInTheDocument();
  });

  it('deve autodisparar se a URL vier com autoTrigger e escalar para crítico após 15 segundos', () => {
    vi.useFakeTimers();

    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );

    // Disparou automaticamente
    expect(emitirPedidoDeAjuda).toHaveBeenCalledWith('emergencia', 'emergency.items.pain');
    expect(screen.getByText(/Aguarde atendimento/i)).toBeInTheDocument();

    // Avança o relógio em 15 segundos para simular não-resposta do cuidador
    act(() => {
      vi.advanceTimersByTime(15000);
    });

    // Escala o alarme LOCAL. Não reenvia nada daqui: quem reenvia ao celular
    // é o servidor (pg_cron), e a tela não diz que mandou o que não mandou.
    expect(screen.getByText(/ALERTA ESCALADO/i)).toBeInTheDocument();
    expect(screen.getByText('Ninguém confirmou ainda. O alarme continua tocando neste computador.')).toBeInTheDocument();
    expect(screen.queryByText(/enviados repetidamente/i)).toBeNull();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    expect(fetchEspiao).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('usa o prazo de patient_settings (emergency_timeout_s) em vez dos 15 s fixos', () => {
    vi.useFakeTimers();
    cloud.ajustesRemotos = { emergency_timeout_s: 45 };

    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );

    act(() => { vi.advanceTimersByTime(15000); });
    // Aos 15 s ainda não escalou: o prazo agora é o do cuidador.
    expect(screen.queryByText(/ALERTA ESCALADO/i)).toBeNull();

    act(() => { vi.advanceTimersByTime(30000); });
    expect(screen.getByText(/ALERTA ESCALADO/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('confirmação do cuidador: mostra "Seu cuidador viu o pedido às HH:MM", fala por TTS e cancela o escalonamento', () => {
    vi.useFakeTimers();
    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; rate = 1; pitch = 1; volume = 1; constructor(t: string) { this.text = t; } });

    const { rerender } = render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    speak.mockClear();

    const vistoEm = new Date(Date.now() + 5_000).toISOString();
    const hora = new Date(vistoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    cloud.reconhecimento = { id: 'hr-1', kind: 'emergencia', created_at: new Date().toISOString(), acknowledged_at: vistoEm, resolved_at: null };
    act(() => {
      rerender(
        <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
          <EmergencyEscalation />
        </MemoryRouter>
      );
    });

    expect(screen.getByText(new RegExp(`Seu cuidador viu o pedido às ${hora}`))).toBeInTheDocument();
    expect(speak).toHaveBeenCalledTimes(1);
    expect((speak.mock.calls[0][0] as { text: string }).text).toMatch(new RegExp(`viu o pedido às ${hora}`));

    // Confirmado antes do prazo: o escalonamento local não dispara mais.
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.queryByText(/ALERTA ESCALADO/i)).toBeNull();

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('um reconhecimento ANTIGO (anterior ao disparo) não é tratado como resposta a este pedido', () => {
    cloud.reconhecimento = { id: 'hr-0', kind: 'emergencia', created_at: '2026-01-01T10:00:00Z', acknowledged_at: '2026-01-01T10:00:30Z', resolved_at: null };
    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    expect(screen.queryByText(/Seu cuidador viu/i)).toBeNull();
    expect(screen.getByText(/Aguarde atendimento/i)).toBeInTheDocument();
  });
});
