import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EmergencyProvider } from './EmergencyContext';
import { _reiniciarSocorroParaTestes } from '../services/emergencia/pedidoDeSocorro';

let testIsDegraded = false;
vi.mock('./GazeContext', () => ({
  useGaze: () => ({
    isDegraded: testIsDegraded,
  }),
}));

let testIsCaregiver = false;
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    currentProfile: { id: 'patient123' },
    isCaregiver: testIsCaregiver,
  }),
}));

describe('EmergencyContext — Sistema de Emergência Canônica', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testIsDegraded = false;
    testIsCaregiver = false;
    _reiniciarSocorroParaTestes();
  });

  it.each(['/menu', '/settings', '/caregiver', '/conta', '/login', '/', '/profiles'])(
    'o botão de emergência existe em %s — inclusive no portão do PIN e no login',
    (rota) => {
      // A regra antiga era por rota: `/settings*`, `/caregiver*`, `/` e `/login`
      // ficavam sem botão. O menu do paciente leva a `/settings`, e licença
      // bloqueada joga tudo no `/login`: o paciente ficava sem socorro.
      render(
        <MemoryRouter initialEntries={[rota]}>
          <EmergencyProvider>
            <div>Tela</div>
          </EmergencyProvider>
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /Emergência/i })).toBeInTheDocument();
    }
  );

  it('continua lá com o cuidador conectado; só some na própria tela de emergência', () => {
    testIsCaregiver = true;
    const { unmount } = render(
      <MemoryRouter initialEntries={['/settings']}>
        <EmergencyProvider>
          <div>Tela do Cuidador</div>
        </EmergencyProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Emergência/i })).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter initialEntries={['/emergency']}>
        <EmergencyProvider>
          <div>Tela de emergência</div>
        </EmergencyProvider>
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /Emergência/i })).toBeNull();
  });

  it('o aviso "Recalibre aqui" não aparece com o cuidador conectado (ele usa o mouse)', () => {
    testIsDegraded = true;
    testIsCaregiver = true;
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <EmergencyProvider>
          <div>Conteúdo</div>
        </EmergencyProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText(/Rastreamento impreciso/i)).toBeNull();
  });

  it('no portão do PIN (cuidador desconectado) o aviso "Recalibre aqui" aparece: é caminho do paciente', () => {
    testIsDegraded = true;
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <EmergencyProvider>
          <div>Conteúdo</div>
        </EmergencyProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(/Rastreamento impreciso/i)).toBeInTheDocument();
  });

  it('deve entrar em estado de confirmação e iniciar contagem regressiva ao clicar no botão', () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <div>Conteúdo</div>
        </EmergencyProvider>
      </MemoryRouter>
    );

    const button = screen.getByRole('button', { name: /Emergência/i });
    fireEvent.click(button);

    // Modal de confirmação deve aparecer
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Enviando alerta de socorro em/i)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    // Avança 2s
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('3')).toBeInTheDocument();

    // Clica em Cancelar
    const cancelBtn = screen.getByRole('button', { name: /CANCELAR/i });
    fireEvent.click(cancelBtn);

    // Modal deve sumir
    expect(screen.queryByRole('alertdialog')).toBeNull();
    vi.useRealTimers();
  });

  it('deve disparar redirecionamento de emergência se a contagem chegar a 0', () => {
    vi.useFakeTimers();
    
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <Routes>
            <Route path="/menu" element={<div>Menu</div>} />
            <Route path="/emergency" element={<div>Tela de Escalabilidade de Emergência</div>} />
          </Routes>
        </EmergencyProvider>
      </MemoryRouter>
    );

    const button = screen.getByRole('button', { name: /Emergência/i });
    fireEvent.click(button);

    // Avança 5s completos
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // O modal desaparece e fomos redirecionados
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Tela de Escalabilidade de Emergência')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('deve exibir o aviso de rastreamento impreciso quando isDegraded for true, e ocultar se false', () => {
    // 1. isDegraded = true
    testIsDegraded = true;
    const { unmount } = render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <div>Conteúdo</div>
        </EmergencyProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/Rastreamento impreciso — Recalibre aqui/i)).toBeInTheDocument();
    unmount();

    // 2. isDegraded = false
    testIsDegraded = false;
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <div>Conteúdo</div>
        </EmergencyProvider>
      </MemoryRouter>
    );

    expect(screen.queryByText(/Rastreamento impreciso/i)).toBeNull();
  });

  it('deve ocultar o aviso de rastreamento impreciso mesmo se isDegraded for true nas rotas de calibração ou emergência', () => {
    testIsDegraded = true;

    // Rota de calibração
    const { unmount } = render(
      <MemoryRouter initialEntries={['/calibration-check']}>
        <EmergencyProvider>
          <div>Conteúdo</div>
        </EmergencyProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText(/Rastreamento impreciso/i)).toBeNull();
    unmount();

    // Rota de emergência
    render(
      <MemoryRouter initialEntries={['/emergency']}>
        <EmergencyProvider>
          <div>Conteúdo</div>
        </EmergencyProvider>
      </MemoryRouter>
    );
    expect(screen.queryByText(/Rastreamento impreciso/i)).toBeNull();
  });

  it('deve redirecionar para a tela de calibração ao acionar o banner de rastreamento impreciso', () => {
    testIsDegraded = true;
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <Routes>
            <Route path="/menu" element={<div>Menu</div>} />
            <Route path="/calibration-check" element={<div>Tela de Calibração</div>} />
          </Routes>
        </EmergencyProvider>
      </MemoryRouter>
    );

    const banner = screen.getByRole('button', { name: /Rastreamento impreciso — Recalibre aqui/i });
    fireEvent.click(banner);

    expect(screen.getByText('Tela de Calibração')).toBeInTheDocument();
  });
});

describe('EmergencyContext — durante a medição o olhar não aciona a Emergência', () => {
  // Relato de 18/10/2026: no teste de precisão, o tremor do olhar em volta do
  // alvo do canto enchia o dwell do botão de Emergência sem querer. Na medição
  // o botão fica acionável só pelo mouse e pelo teclado.
  beforeEach(() => _reiniciarSocorroParaTestes());
  it('com o ponto do teste de precisão na tela, o botão sai do dwell mas o clique continua valendo', async () => {
    vi.useFakeTimers();
    try {
      const ponto = document.createElement('div');
      ponto.id = 'accuracy-dot';
      document.body.appendChild(ponto);
      render(
        <MemoryRouter initialEntries={['/calibration-check']}>
          <EmergencyProvider>
            <div>Teste</div>
          </EmergencyProvider>
        </MemoryRouter>
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      const botao = screen.getByRole('button', { name: /Emergência/i });
      expect(botao.getAttribute('data-no-dwell')).toBe('true');
      fireEvent.click(botao);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      ponto.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fora da medição o dwell continua ligado', () => {
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <div>Menu</div>
        </EmergencyProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Emergência/i }).getAttribute('data-no-dwell')).toBeNull();
  });

  it('o CANCELAR da contagem tem o alvo mínimo (5°) nos dois eixos (revisão de UX de 20/10/2026, achado 5)', () => {
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <div>Conteúdo</div>
        </EmergencyProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Emergência/i }));
    const cancelar = screen.getByRole('button', { name: /CANCELAR/i });
    // Era 320×84 px (~2,7° de altura). O token é o mesmo que `alvoMinimoPx()` lê.
    expect(cancelar.style.height).toMatch(/^var\(--gaze-target-min, \d+px\)$/);
    expect(cancelar.style.width).toContain('--gaze-target-min');
    expect(cancelar.style.width).toContain('320px');
    // Nunca mais largo que a janela. (Que a coluna cabe em 1024×640 o jsdom não
    // mede — ele nem guarda `clamp()` —: conferir na janela pequena do Windows.)
    expect(cancelar.style.maxWidth).toBe('90vw');
    fireEvent.click(cancelar);
  });
});
