import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { LicenseProvider, useLicense } from './LicenseContext';
import type { LicenseService } from '../services/license';

// No modo de teste local (`npm run teste-local`) a licença está ativa desde o
// boot, sem login e sem perguntar a serviço nenhum. Fora dele, o caminho de
// sempre: sem licença gravada, `none` (vai para o login).

const Sonda: React.FC = () => {
  const { status, license } = useLicense();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="conta">{license?.account.email ?? '—'}</span>
    </div>
  );
};

/** Um serviço que acusa qualquer chamada: o modo de teste não pode falar com ele. */
const servicoQueNaoPodeSerChamado = new Proxy({} as LicenseService, {
  get: () => () => { throw new Error('o modo de teste local chamou o serviço de licença'); },
});

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('LicenseProvider no modo de teste local', () => {
  it('fica ativo sem login e sem chamar o serviço', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('MODE', 'teste-local');
    render(<LicenseProvider service={servicoQueNaoPodeSerChamado}><Sonda /></LicenseProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('active'));
    expect(screen.getByTestId('conta').textContent).toBe('teste-local@irisflow.local');
  });

  it('fora do modo, sem licença gravada, pede login como sempre', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('MODE', 'development');
    render(<LicenseProvider service={servicoQueNaoPodeSerChamado}><Sonda /></LicenseProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('none'));
  });

  // O comando gera o build de produção com `--mode teste-local`; o instalador
  // sai com `production`.
  it('no build de produção do teste-local, fica ativo do mesmo jeito', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'teste-local');
    render(<LicenseProvider service={servicoQueNaoPodeSerChamado}><Sonda /></LicenseProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('active'));
  });

  it('no build do instalador, sem licença gravada, pede login como sempre', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    render(<LicenseProvider service={servicoQueNaoPodeSerChamado}><Sonda /></LicenseProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('none'));
  });
});
