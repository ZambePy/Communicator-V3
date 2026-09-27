import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import { CaregiverPageLayout } from './CaregiverPageLayout';

// -----------------------------------------------------------------------------
// FE-12: "Encerrar Acesso" chamava `logout()`, que também desmarcava o
// paciente — o app ia para /profiles, onde o olhar escolhia um perfil sem
// cursor e mandava para o preparo. Encerrar o acesso do cuidador fecha só a
// área do cuidador; o paciente continua escolhido e o app volta ao menu dele.
// -----------------------------------------------------------------------------

const Estado: React.FC = () => {
  const { isCaregiver, currentProfile } = useAuth();
  return <span data-testid="estado">{`${isCaregiver ? 'cuidador' : 'sem-cuidador'}|${currentProfile?.name ?? 'sem-paciente'}`}</span>;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('irisflow_auth', JSON.stringify({ currentProfile: { id: 'p1', name: 'Joana' } }));
  sessionStorage.setItem('irisflow_caregiver_session', JSON.stringify({ isCaregiver: true, authToken: 'local-caregiver-session' }));
});

describe('Encerrar Acesso', () => {
  it('fecha só a área do cuidador e volta ao menu do paciente', () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route path="/settings" element={<CaregiverPageLayout title="Configurações"><Estado /></CaregiverPageLayout>} />
            <Route path="/menu" element={<div>menu do paciente <Estado /></div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    expect(screen.getByTestId('estado').textContent).toBe('cuidador|Joana');
    act(() => screen.getByRole('button', { name: /Encerrar Acesso/i }).click());
    expect(screen.getByText(/menu do paciente/)).toBeInTheDocument();
    expect(screen.getByTestId('estado').textContent).toBe('sem-cuidador|Joana');
  });
});
