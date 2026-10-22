import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { LicenseProvider, useLicense, LICENSE_KEY, GRACE_PERIOD_MS } from './LicenseContext';
import { createMockLicenseService, CONTAS_DE_TESTE } from '../services/license';
import { getDeviceId } from '../services/license/deviceId';
import type { LicenseService } from '../services/license';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 7): uma exceção
// dentro da verificação da licença deixava o status em `checking` para
// sempre — teclado, frases e menu em "Carregando…", em todo boot, porque a
// falha se repetia. Só a Emergência continuava acessível.
// -----------------------------------------------------------------------------

const Sonda: React.FC = () => {
  const { status, blockedReason } = useLicense();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="motivo">{blockedReason ?? '—'}</span>
    </div>
  );
};

function semearLicenca(lastVerifiedAt: number) {
  localStorage.setItem(
    LICENSE_KEY,
    JSON.stringify({
      account: { email: CONTAS_DE_TESTE.ativa },
      plan: { id: 'familiar', name: 'IrisFlow Familiar', validUntil: null, deviceLimit: 1 },
      token: 'token-de-boot-anterior',
      deviceId: getDeviceId(),
      boundAt: new Date(lastVerifiedAt).toISOString(),
      lastVerifiedAt,
    }),
  );
}

/** O serviço de verdade, com `verify` lançando (cofre recusou, bug, o que for). */
function servicoQueLanca(): LicenseService {
  const base = createMockLicenseService();
  return { ...base, verify: vi.fn(async () => { throw new Error('safeStorage recusou'); }) };
}

const status = () => screen.getByTestId('status').textContent;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('verificar() que lança não prende o app em "Carregando…"', () => {
  it('licença verificada há pouco: a exceção vale como "sem conexão" → carência offline', async () => {
    semearLicenca(Date.now() - 60_000);
    render(<LicenseProvider service={servicoQueLanca()}><Sonda /></LicenseProvider>);
    await waitFor(() => expect(status()).toBe('grace'));
  });

  it('carência vencida: bloqueio honesto ("sem internet há dias"), não "Carregando…"', async () => {
    semearLicenca(Date.now() - GRACE_PERIOD_MS - 60_000);
    render(<LicenseProvider service={servicoQueLanca()}><Sonda /></LicenseProvider>);
    await waitFor(() => expect(status()).toBe('blocked'));
    expect(screen.getByTestId('motivo').textContent).toBe('grace-expired');
  });

  it('a licença gravada NÃO é apagada por uma exceção (só uma resposta "não" do servidor apaga)', async () => {
    semearLicenca(Date.now() - 60_000);
    render(<LicenseProvider service={servicoQueLanca()}><Sonda /></LicenseProvider>);
    await waitFor(() => expect(status()).toBe('grace'));
    expect(localStorage.getItem(LICENSE_KEY)).not.toBeNull();
  });
});
