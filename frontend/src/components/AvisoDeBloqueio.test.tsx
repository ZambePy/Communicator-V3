import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../i18n';
import { AvisoDeBloqueio } from './AvisoDeBloqueio';
import { LicenseProvider, LICENSE_KEY, GRACE_PERIOD_MS } from '../context/LicenseContext';
import {
  createMockLicenseService,
  CONTAS_DE_TESTE,
  SENHA_DE_TESTE,
  MOCK_NETWORK_KEY,
  getDeviceBinding,
  getDeviceId,
} from '../services/license';
import type { LicenseService } from '../services/license';

// -----------------------------------------------------------------------------
// FE-10: licença bloqueada deixava o paciente no login sem dizer por quê. O
// motivo (`blockedReason`) era calculado e nenhuma tela o lia.
// -----------------------------------------------------------------------------

let service: LicenseService;

beforeEach(async () => {
  service = createMockLicenseService();
  await i18n.changeLanguage('pt-BR');
});

/** Licença conhecida do serviço simulado, verificada há mais que a carência, sem rede. */
async function semearBloqueioPorFaltaDeInternet() {
  const device = getDeviceBinding();
  const r = await service.login(CONTAS_DE_TESTE.ativa, SENHA_DE_TESTE, device);
  if (!r.ok) throw new Error('o mock deveria aceitar a conta ativa');
  localStorage.setItem(
    LICENSE_KEY,
    JSON.stringify({
      account: r.license.account,
      plan: r.license.plan,
      token: r.license.token,
      deviceId: getDeviceId(),
      boundAt: device.boundAt,
      lastVerifiedAt: Date.now() - (GRACE_PERIOD_MS + 60_000),
    })
  );
  localStorage.setItem(MOCK_NETWORK_KEY, 'offline');
}

const montar = (rota: string) =>
  render(
    <LicenseProvider service={service}>
      <MemoryRouter initialEntries={[rota]}>
        <AvisoDeBloqueio />
        <Routes>
          <Route path="/" element={<div>splash</div>} />
          <Route path="/login" element={<div>tela de login</div>} />
          <Route path="/menu" element={<div>menu</div>} />
        </Routes>
      </MemoryRouter>
    </LicenseProvider>
  );

describe('aviso de bloqueio da licença', () => {
  it('no login, diz o motivo, o que fazer e que a Emergência local continua', async () => {
    await semearBloqueioPorFaltaDeInternet();
    montar('/login');

    const aviso = await screen.findByTestId('aviso-de-bloqueio');
    expect(aviso).toHaveTextContent('Faz mais de 7 dias que o IrisFlow não consegue confirmar a assinatura');
    expect(aviso).toHaveTextContent('Conecte este computador à internet');
    expect(aviso).toHaveTextContent('O botão de Emergência continua funcionando neste computador');
    // É leitura: não rouba fixação nem clique.
    expect(aviso.style.pointerEvents).toBe('none');
  });

  it('não aparece sem bloqueio', async () => {
    montar('/login');
    // Sem licença gravada o status vira "none" (primeiro acesso), não "blocked".
    await waitFor(() => expect(screen.getByText('tela de login')).toBeInTheDocument());
    expect(screen.queryByTestId('aviso-de-bloqueio')).toBeNull();
  });

  it('quando a licença volta a valer, tira o paciente do login (que não tem Voltar)', async () => {
    await semearBloqueioPorFaltaDeInternet();
    montar('/login');
    await screen.findByTestId('aviso-de-bloqueio');

    localStorage.setItem(MOCK_NETWORK_KEY, 'online');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(screen.getByText('splash')).toBeInTheDocument());
    expect(screen.queryByTestId('aviso-de-bloqueio')).toBeNull();
  });
});
