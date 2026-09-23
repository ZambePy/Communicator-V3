import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AtalhoDeTutorial } from './AtalhoDeTutorial';
import { guardarPasso, iniciarMissao, cumprirMissao, passoGuardado, missaoCumprida } from './missao';

/**
 * "Refazer o tutorial" tem de REFAZER: começar do primeiro passo, sem as
 * missões cumpridas numa passagem anterior. Antes ele só navegava, e o wizard
 * retomava do passo guardado — no meio.
 */
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ currentProfile: { id: 'p1', name: 'Teste' } }),
}));

describe('AtalhoDeTutorial — refazer', () => {
  beforeEach(() => {
    navigate.mockClear();
    sessionStorage.clear();
  });

  it('limpa o progresso da sessão antes de abrir o tutorial', () => {
    guardarPasso('lazer');
    iniciarMissao('digitacao');
    cumprirMissao('digitacao');
    expect(passoGuardado()).toBe('lazer');
    expect(missaoCumprida('digitacao')).toBe(true);

    render(<AtalhoDeTutorial />);
    fireEvent.click(screen.getByRole('button', { name: /tutorial\.atalho\.button/ }));

    expect(passoGuardado()).toBeNull();
    expect(missaoCumprida('digitacao')).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/tutorial');
  });
});
