import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EmergencyProvider } from './EmergencyContext';

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
