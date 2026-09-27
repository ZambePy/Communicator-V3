import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { TravaDoCuidador, ehRotaDoCuidador, INATIVIDADE_DO_CUIDADOR_MS } from './TravaDoCuidador';
import { env } from '../config/env';

// -----------------------------------------------------------------------------
// FE-1: o PIN destravava a área do cuidador pela sessão inteira. Depois do
// cuidador, o paciente chegava a Configurações pelo menu, sem PIN, e ligava
// pelo olhar o modo apresentação (que descarta os socorros).
// -----------------------------------------------------------------------------

let navegar: (rota: string) => void = () => {};
const Sonda: React.FC = () => {
  const { isCaregiver, currentProfile, loginCaregiver, selectProfile } = useAuth();
  navegar = useNavigate();
  return (
    <div>
      <span>{isCaregiver ? 'destravada' : 'travada'}</span>
      <span>{currentProfile ? `paciente:${currentProfile.name}` : 'sem paciente'}</span>
      <button onClick={() => loginCaregiver(env.caregiverPin)}>pin</button>
      <button onClick={() => selectProfile({ id: 'p1', name: 'Joana' })}>escolher</button>
    </div>
  );
};

function montar(rota = '/settings') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[rota]}>
        <TravaDoCuidador />
        <Sonda />
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('trava automática da área do cuidador', () => {
  it('rotas do cuidador: Configurações e o que sai dela', () => {
    for (const r of ['/settings', '/settings/voice', '/caregiver', '/caregiver/guide', '/conta', '/historico', '/relatorio']) {
      expect(ehRotaDoCuidador(r)).toBe(true);
    }
    for (const r of ['/menu', '/emergency', '/calibration-check', '/', '/login', '/settingsx', '/keyboard']) {
      expect(ehRotaDoCuidador(r)).toBe(false);
    }
  });

  it('andar entre telas do cuidador mantém a área aberta; sair dela fecha — e o paciente continua escolhido', () => {
    montar('/settings');
    act(() => screen.getByText('escolher').click());
    act(() => screen.getByText('pin').click());
    expect(screen.getByText('destravada')).toBeInTheDocument();

    act(() => navegar('/conta'));
    act(() => navegar('/historico'));
    expect(screen.getByText('destravada')).toBeInTheDocument();

    act(() => navegar('/menu'));
    expect(screen.getByText('travada')).toBeInTheDocument();
    expect(screen.getByText('paciente:Joana')).toBeInTheDocument();
  });

  it('esquecida aberta: fecha sozinha depois do tempo de inatividade', () => {
    vi.useFakeTimers();
    montar('/settings');
    act(() => screen.getByText('pin').click());
    expect(screen.getByText('destravada')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(INATIVIDADE_DO_CUIDADOR_MS - 1000); });
    expect(screen.getByText('destravada')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('travada')).toBeInTheDocument();
  });

  it('eventos sintéticos (o clique pelo olhar é um .click() da página) não contam como alguém no mouse', () => {
    vi.useFakeTimers();
    montar('/settings');
    act(() => screen.getByText('pin').click());
    act(() => { vi.advanceTimersByTime(INATIVIDADE_DO_CUIDADOR_MS - 1000); });
    act(() => {
      window.dispatchEvent(new Event('pointermove'));
      window.dispatchEvent(new Event('keydown'));
    });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('travada')).toBeInTheDocument();
  });

  it('uma sessão do cuidador que sobrou (recarga da página) não vale fora da área', () => {
    sessionStorage.setItem('irisflow_caregiver_session', JSON.stringify({ isCaregiver: true, authToken: 'x' }));
    montar('/menu');
    expect(screen.getByText('travada')).toBeInTheDocument();
  });
});
