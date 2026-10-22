import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { EmergencyEscalation } from './EmergencyEscalation';
import { informarEntrega, entregaDaResposta, _limparOuvintes } from '../../cloud/eventos';
import { _reiniciarSocorroParaTestes, pedidoAtual, dispararPedidoDeSocorro } from '../../services/emergencia/pedidoDeSocorro';
import { alvoMinimoPx } from '../../design/gazeMetrics';

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
    _limparOuvintes();
    _reiniciarSocorroParaTestes();
  });

  afterEach(() => {
    _reiniciarSocorroParaTestes();
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

  it('link antigo com autoTrigger: dispara uma vez; sem resposta do envio, o alarme local toca em 12 s', () => {
    vi.useFakeTimers();

    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );

    expect(emitirPedidoDeAjuda).toHaveBeenCalledWith('emergencia', 'emergency.items.pain', expect.any(String));
    expect(screen.getByText(/Aguarde atendimento/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(12_100);
    });

    // Escala o alarme LOCAL e diz por quê. Não reenvia nada daqui: quem reenvia
    // ao celular é o servidor (pg_cron), e a tela não diz que mandou o que não mandou.
    expect(screen.getByText('emergency.entrega.sem_resposta.titulo')).toBeInTheDocument();
    expect(pedidoAtual()?.fase).toBe('escalado');
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    expect(fetchEspiao).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('entregue ao celular: usa o prazo do cuidador (patient_settings.emergency_timeout_s)', () => {
    vi.useFakeTimers();
    cloud.ajustesRemotos = { emergency_timeout_s: 30 };

    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    const id = emitirPedidoDeAjuda.mock.calls[0][2] as string;
    act(() => informarEntrega(id, 'enviado'));

    act(() => { vi.advanceTimersByTime(29_000); });
    expect(screen.queryByText('emergency.escalado.titulo')).toBeNull();

    act(() => { vi.advanceTimersByTime(1_200); });
    expect(screen.getByText('emergency.escalado.titulo')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('sem o ajuste do cuidador, o prazo é 45 s — o mesmo do servidor (antes eram 15 s aqui e 45 lá)', () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    const id = emitirPedidoDeAjuda.mock.calls[0][2] as string;
    act(() => informarEntrega(id, 'enviado'));
    act(() => { vi.advanceTimersByTime(44_000); });
    expect(screen.queryByText('emergency.escalado.titulo')).toBeNull();
    act(() => { vi.advanceTimersByTime(1_200); });
    expect(screen.getByText('emergency.escalado.titulo')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('sem internet (na fila): o alarme local começa em 5 s, mesmo com prazo do cuidador longo', () => {
    vi.useFakeTimers();
    cloud.ajustesRemotos = { emergency_timeout_s: 300 };
    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    const id = emitirPedidoDeAjuda.mock.calls[0][2] as string;
    act(() => informarEntrega(id, 'na_fila'));
    act(() => { vi.advanceTimersByTime(5_100); });
    expect(pedidoAtual()?.fase).toBe('escalado');
    expect(screen.getByText('emergency.entrega.na_fila.titulo')).toBeInTheDocument();
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
    // A confirmação DESTE pedido (o servidor grava o id do computador). A de
    // outro pedido não conta mais — revisão de segurança de 19/10/2026.
    cloud.reconhecimento = { id: pedidoAtual()!.id, kind: 'emergencia', created_at: new Date().toISOString(), acknowledged_at: vistoEm, resolved_at: null };
    act(() => {
      rerender(
        <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
          <EmergencyEscalation />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('emergency.visto.titulo')).toBeInTheDocument();
    expect(speak).toHaveBeenCalledTimes(1);
    expect((speak.mock.calls[0][0] as { text: string }).text).toMatch(new RegExp(`viu o pedido às ${hora}`));

    // Confirmado antes do prazo: o escalonamento local não dispara mais.
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.queryByText('emergency.escalado.titulo')).toBeNull();
    expect(pedidoAtual()?.fase).toBe('visto');

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
    expect(screen.getByText('emergency.visto.titulo')).toBeInTheDocument();
  });

  it('parar o alarme pede confirmação; só o "sim" para e volta ao menu, sem segundo pedido (FE-2)', () => {
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
    // Primeiro passo: pergunta. O alarme continua valendo.
    expect(screen.getByText('emergency.pararAlarme.pergunta')).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /emergency.pararAlarme.nao/i }));
    });
    expect(screen.queryByText('tela do menu')).toBeNull();
    expect(pedidoAtual()?.fase).not.toBe('encerrado');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /emergency.cancelAndReturn/i }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /emergency.pararAlarme.sim/i }));
    });

    expect(screen.getByText('tela do menu')).toBeInTheDocument();
    expect(pedidoAtual()?.fase).toBe('encerrado');
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
  });

  it('com um pedido em andamento, a tela abre nele (não na grade) e não dispara outro', () => {
    dispararPedidoDeSocorro('other', 'OUTRA');
    emitirPedidoDeAjuda.mockClear();
    render(
      <MemoryRouter initialEntries={['/emergency']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /emergency.items.pain/i })).toBeNull();
    expect(screen.getByText(/Aguarde atendimento/i)).toBeInTheDocument();
    expect(emitirPedidoDeAjuda).not.toHaveBeenCalled();
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
    expect(screen.queryByText('emergency.visto.titulo')).toBeNull();
    expect(screen.getByText(/Aguarde atendimento/i)).toBeInTheDocument();
  });
});

describe('EmergencyEscalation — a tela diz o que aconteceu com o pedido (FE-9)', () => {
  beforeEach(() => {
    emitirPedidoDeAjuda.mockClear();
    cloud.ajustesRemotos = null;
    cloud.reconhecimento = null;
    _limparOuvintes();
    _reiniciarSocorroParaTestes();
  });
  afterEach(() => _reiniciarSocorroParaTestes());

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

  it('reenvio que achou o pedido gravado, sem dado do push: a tela NÃO diz que o celular foi avisado (revisão de UX de 19/10/2026)', () => {
    const id = disparar();
    act(() => informarEntrega(id, entregaDaResposta({ ok: true, id, repetido: true })));
    expect(screen.queryByText('emergency.entrega.enviado.titulo')).toBeNull();
    expect(screen.getByText('emergency.entrega.push_incerto.titulo')).toBeInTheDocument();
    expect(screen.getByText('emergency.entrega.push_incerto.detalhe')).toBeInTheDocument();
  });

  it('a entrega de OUTRO pedido não muda esta tela', () => {
    disparar();
    act(() => informarEntrega('00000000-0000-4000-8000-000000000000', 'enviado'));
    expect(screen.getByText('emergency.entrega.enviando.titulo')).toBeInTheDocument();
  });
});

// Revisão de UX de 19/10/2026 (achado 10): com o rastreamento degradado só
// passam alvos de Emergência e de recuperação — parar um alarme falso não
// funcionava pelo olhar. E os botões tinham 96 px de altura (~2,4°) contra o
// mínimo de 5°, com o Não e o Sim a 24 px um do outro.
describe('EmergencyEscalation — parar o alarme pelo olhar, inclusive no modo degradado (achado 10)', () => {
  beforeEach(() => {
    emitirPedidoDeAjuda.mockClear();
    cloud.ajustesRemotos = null;
    cloud.reconhecimento = null;
    cloud.mensagens = [];
    _limparOuvintes();
    _reiniciarSocorroParaTestes();
  });
  afterEach(() => _reiniciarSocorroParaTestes());

  /** O valor do estilo em px; o token do alvo mínimo vale `alvoMinimoPx()` (o jsdom não resolve `var()`). */
  const emPx = (valor: string) => (valor.includes('--gaze-target-min') ? alvoMinimoPx() : parseFloat(valor));

  const alvoGrandeDeRecuperacao = (b: HTMLElement) => {
    expect(b.getAttribute('data-recovery')).toBe('true');
    expect(emPx(b.style.height)).toBeGreaterThanOrEqual(alvoMinimoPx());
    // A largura é fluida (`min(400px, 32vw)`), com o alvo mínimo como piso.
    expect(emPx(b.style.minWidth)).toBeGreaterThanOrEqual(alvoMinimoPx());
  };

  it('"Parar o alarme" e as duas respostas da pergunta: recuperação, com o alvo mínimo, e longe uma da outra', () => {
    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    alvoGrandeDeRecuperacao(screen.getByRole('button', { name: /emergency.cancelAndReturn/i }));

    act(() => { fireEvent.click(screen.getByRole('button', { name: /emergency.cancelAndReturn/i })); });
    const nao = screen.getByRole('button', { name: /emergency.pararAlarme.nao/i });
    const sim = screen.getByRole('button', { name: /emergency.pararAlarme.sim/i });
    alvoGrandeDeRecuperacao(nao);
    alvoGrandeDeRecuperacao(sim);
    // Um erro de mira no "Não" não pode cair no "Sim, parar": pelo menos meio
    // alvo mínimo (2,5°) entre os dois, já descontada a zona de acerto.
    const fileira = nao.parentElement!;
    expect(fileira).toBe(sim.parentElement);
    expect(emPx(fileira.style.columnGap || fileira.style.gap)).toBeGreaterThanOrEqual(alvoMinimoPx() / 2 + 24);
  });

  it('"Sim, parar" só aceita aperto curto do acionador (revisão de UX de 20/10/2026, achado 1)', () => {
    render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    act(() => { fireEvent.click(screen.getByRole('button', { name: /emergency.cancelAndReturn/i })); });
    expect(screen.getByRole('button', { name: /emergency.pararAlarme.sim/i })).toHaveAttribute('data-acionador-aperto-curto', 'true');
    // O "Não" continua um item comum (com o pedido em curso, segurar também não o escolhe).
    expect(screen.getByRole('button', { name: /emergency.pararAlarme.nao/i })).not.toHaveAttribute('data-acionador-aperto-curto');
  });

  it('"Voltar ao menu" depois de o cuidador ver: recuperação, com o alvo mínimo', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
        <EmergencyEscalation />
      </MemoryRouter>
    );
    cloud.reconhecimento = { id: pedidoAtual()!.id, kind: 'emergencia', created_at: new Date().toISOString(), acknowledged_at: new Date().toISOString(), resolved_at: null };
    act(() => {
      rerender(
        <MemoryRouter initialEntries={['/emergency?autoTrigger=pain']}>
          <EmergencyEscalation />
        </MemoryRouter>
      );
    });
    alvoGrandeDeRecuperacao(screen.getByRole('button', { name: /emergency.voltarAoMenu/i }));
  });
});

describe('EmergencyEscalation — a resposta do cuidador aparece na tela de emergência (FE-5)', () => {
  beforeEach(() => {
    emitirPedidoDeAjuda.mockClear();
    cloud.ajustesRemotos = null;
    cloud.reconhecimento = null;
    cloud.mensagens = [];
    _limparOuvintes();
    _reiniciarSocorroParaTestes();
  });
  afterEach(() => _reiniciarSocorroParaTestes());

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
