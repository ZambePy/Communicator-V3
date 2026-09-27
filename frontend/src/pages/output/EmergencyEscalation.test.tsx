import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { EmergencyEscalation } from './EmergencyEscalation';
import { informarEntrega, _limparOuvintes } from '../../cloud/eventos';

// O único envio da tela é o pedido de ajuda no barramento da nuvem (que o modo
// apresentação corta). Nada de backend de demonstração em localhost.
const emitirPedidoDeAjuda = vi.fn();
vi.mock('../../cloud/eventos', async (original) => ({
  // O registro de entrega (informarEntrega/ouvirEntrega) é o de verdade.
  ...(await original<typeof import('../../cloud/eventos')>()),
  emitirPedidoDeAjuda: (...a: unknown[]) => emitirPedidoDeAjuda(...a),
}));
const fetchEspiao = vi.fn();

// Mock GazePageLayout para simplificar os testes de renderização da página
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Estado da nuvem controlado pelo teste: prazo remoto e confirmação do cuidador.
const cloud: {
  ajustesRemotos: { emergency_timeout_s: number } | null;
  reconhecimento: { id: string; kind: string; created_at: string; acknowledged_at: string; resolved_at: string | null } | null;
  mensagens?: Array<{ id: string; sender: string; kind: string; text: string; created_at: string }>;
} = {
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
    // O terceiro argumento é o id do pedido, escolhido aqui (UUID).
    expect(emitirPedidoDeAjuda).toHaveBeenCalledWith('emergencia', 'emergency.items.pain', expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(screen.getByText(/Alerta disparado. Aguarde atendimento./i)).toBeInTheDocument();
  });

  it('deve autodisparar se a URL vier com autoTrigger e escalar para crítico após 15 segundos', () => {
    vi.useFakeTimers();

    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );

    // Disparou automaticamente
    expect(emitirPedidoDeAjuda).toHaveBeenCalledWith('emergencia', 'emergency.items.pain', expect.any(String));
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

  it('a confirmação DESTE pedido (mesmo id) vale mesmo com o relógio do PC 10 min adiantado', () => {
    // acknowledged_at vem do relógio do celular; triggeredAt, do relógio deste
    // PC. Pela comparação de horários (tolerância de 60 s) ela seria ignorada
    // e o alarme continuaria tocando. Pelo id, é reconhecida.
    const agoraReal = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(agoraReal + 10 * 60_000);
    const { rerender } = render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    const idDoPedido = emitirPedidoDeAjuda.mock.calls[0][2] as string;
    cloud.reconhecimento = {
      id: idDoPedido, kind: 'emergencia', created_at: new Date(agoraReal).toISOString(),
      acknowledged_at: new Date(agoraReal + 20_000).toISOString(), resolved_at: null,
    };
    act(() => {
      rerender(
        <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
          <EmergencyEscalation />
        </MemoryRouter>
      );
    });
    expect(screen.getByText(/Seu cuidador viu o pedido/i)).toBeInTheDocument();
  });

  it('voltar ao menu depois do autodisparo NÃO manda um segundo pedido de socorro (FE-2)', () => {
    // O `setTriggered(null)` renderizava antes da navegação (que vai em
    // transição) com `autoTrigger` ainda na URL: o efeito disparava de novo —
    // segundo push no celular, segundo pedido no banco, alarme de novo.
    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=other']}>
        <Routes>
          <Route path="/emergency" element={<EmergencyEscalation />} />
          <Route path="/menu" element={<div>tela do menu</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /emergency.cancelAndReturn/i }));
    });

    expect(screen.getByText('tela do menu')).toBeInTheDocument();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
  });

  it('o parâmetro autoTrigger é consumido da URL logo depois do disparo', () => {
    // Enquanto ele ficasse na URL, qualquer render com `triggered` nulo — o
    // StrictMode do desenvolvimento, uma volta pelo histórico — disparava outro.
    let busca = '';
    const Sonda: React.FC = () => {
      busca = useLocation().search;
      return null;
    };
    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <Routes>
          <Route
            path="/emergency"
            element={
              <>
                <EmergencyEscalation />
                <Sonda />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    expect(busca).not.toContain('autoTrigger');
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

describe('EmergencyEscalation — a tela diz o que aconteceu com o pedido (FE-9)', () => {
  beforeEach(() => {
    emitirPedidoDeAjuda.mockClear();
    cloud.ajustesRemotos = null;
    cloud.reconhecimento = null;
    _limparOuvintes();
  });

  function disparar(): string {
    render(
      <MemoryRouter initialEntries={['/emergency']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /emergency.items.pain/i }));
    return emitirPedidoDeAjuda.mock.calls[0][2] as string;
  }

  it('antes da resposta: "enviando"; depois, o que o envio respondeu — e nunca "enviado" sem ter sido', () => {
    const id = disparar();
    expect(screen.getByText('emergency.entrega.enviando.titulo')).toBeInTheDocument();

    act(() => informarEntrega(id, 'na_fila'));
    expect(screen.getByText('emergency.entrega.na_fila.titulo')).toBeInTheDocument();
    expect(screen.queryByText('emergency.entrega.enviado.titulo')).toBeNull();

    // A fila entregou quando a internet voltou.
    act(() => informarEntrega(id, 'enviado'));
    expect(screen.getByText('emergency.entrega.enviado.titulo')).toBeInTheDocument();
  });

  it('sem celular vinculado ou no modo apresentação, a tela diz que o alarme é só local', () => {
    const id = disparar();
    act(() => informarEntrega(id, 'sem_nuvem'));
    expect(screen.getByText('emergency.entrega.sem_nuvem.titulo')).toBeInTheDocument();
    act(() => informarEntrega(id, 'ensaio'));
    expect(screen.getByText('emergency.entrega.ensaio.titulo')).toBeInTheDocument();
  });

  it('a entrega de OUTRO pedido não muda esta tela', () => {
    disparar();
    act(() => informarEntrega('00000000-0000-4000-8000-000000000000', 'enviado'));
    expect(screen.getByText('emergency.entrega.enviando.titulo')).toBeInTheDocument();
  });
});

describe('EmergencyEscalation — a resposta do cuidador aparece na tela de emergência (FE-5)', () => {
  beforeEach(() => {
    emitirPedidoDeAjuda.mockClear();
    cloud.ajustesRemotos = null;
    cloud.reconhecimento = null;
    cloud.mensagens = [];
  });

  it('mostra a mensagem do cuidador que chegou depois do pedido; não mostra as antigas nem as de sistema', () => {
    const agora = Date.now();
    cloud.mensagens = [
      { id: 'velha', sender: 'cuidador', kind: 'texto', text: 'mensagem de ontem', created_at: new Date(agora - 86_400_000).toISOString() },
      { id: 'sis', sender: 'cuidador', kind: 'sistema', text: 'Ninguém confirmou o pedido', created_at: new Date(agora + 1000).toISOString() },
    ];
    const { rerender } = render(
      <MemoryRouter initialEntries={['/emergency']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /emergency.items.pain/i }));
    expect(screen.queryByTestId('mensagem-do-cuidador-na-emergencia')).toBeNull();

    cloud.mensagens = [...cloud.mensagens, { id: 'nova', sender: 'cuidador', kind: 'texto', text: 'Estou chegando em dois minutos', created_at: new Date(agora + 2000).toISOString() }];
    rerender(
      <MemoryRouter initialEntries={['/emergency']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    expect(screen.getByTestId('mensagem-do-cuidador-na-emergencia').textContent).toContain('Estou chegando em dois minutos');
  });
});
