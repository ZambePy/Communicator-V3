import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseLicenseService } from './supabaseLicenseService';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 7): depois do
// HTTP 200, `cofre.lerJson` e `cofre.gravarJson` rodavam sem `try`. Um cofre
// que recusa (chaveiro do sistema indisponível: o `invoke` do Electron
// rejeita) fazia `verify` LANÇAR, e o app ficava em "Carregando…" em todo
// boot. O servidor já disse "sim": o realinhamento do vínculo é opcional.
// -----------------------------------------------------------------------------

vi.mock('../../cloud/config', () => ({
  nuvemConfigurada: true,
  cloudConfig: {
    url: 'https://abc.supabase.co', anonKey: 'ANON'.padEnd(30, 'x'),
    desktopSyncUrl: 'https://abc.supabase.co/functions/v1/desktop-sync',
    siteUrl: 'https://irisflow.test', carenciaOfflineDias: 7, heartbeatMs: 30_000,
  },
}));

const LICENCA = {
  allowed: true, reason: 'avaliacao', status: 'avaliacao', plan_id: 'essencial', plan_name: 'Essencial',
  trial_ends_at: null, next_charge_at: null, access_until: '2026-12-26T00:00:00Z',
  checked_at: '2026-10-08T00:00:00Z', beneficiary: { id: 'ben-1', user_name: 'Carlos' },
  features: { relatorios: false, multiplos_dispositivos: false, assistente: false, voz: false },
};

const resposta200 = () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      device: { id: 'dev-9', name: 'PC', os: 'windows', app_version: '1' },
      beneficiary: { id: 'ben-1', user_name: 'Carlos' }, license: LICENCA, devices_active: 1,
    }),
  }) as unknown as Response;

const svc = () =>
  createSupabaseLicenseService({
    cliente: () => ({}) as unknown as SupabaseClient,
    fetchImpl: (async () => resposta200()) as unknown as typeof fetch,
  });

function ponteDoCofre(op: { lerRejeita?: boolean; gravarRejeita?: boolean; gravarDevolve?: boolean; vinculo?: unknown }) {
  const secureSet = vi.fn(async () => {
    if (op.gravarRejeita) throw new Error('o chaveiro do sistema recusou');
    return op.gravarDevolve ?? true;
  });
  (window as unknown as { irisflowCloud?: unknown }).irisflowCloud = {
    secureGet: vi.fn(async () => {
      if (op.lerRejeita) throw new Error('o chaveiro do sistema recusou');
      return op.vinculo ? JSON.stringify(op.vinculo) : null;
    }),
    secureSet,
    secureRemove: vi.fn(async () => true),
    appInfo: vi.fn(async () => ({ version: '1', hostname: 'pc', platform: 'win32', encryptionAvailable: false })),
  };
  return { secureSet };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  delete (window as unknown as { irisflowCloud?: unknown }).irisflowCloud;
  vi.restoreAllMocks();
});

describe('verify com o cofre recusando', () => {
  it('a leitura do vínculo rejeita: a licença confirmada vale do mesmo jeito', async () => {
    ponteDoCofre({ lerRejeita: true, gravarRejeita: true });
    const r = await svc().verify('CHAVE-9', 'local-uuid-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.license.account.beneficiaryId).toBe('ben-1');
  });

  it('o realinhamento do vínculo rejeita: não lança, e a licença vale', async () => {
    const { secureSet } = ponteDoCofre({ gravarRejeita: true, vinculo: null });
    await expect(svc().verify('CHAVE-9', 'local-uuid-1')).resolves.toMatchObject({ ok: true });
    expect(secureSet).toHaveBeenCalled();
  });

  it('o cofre devolve "não gravou": a licença vale, e fica registrado para tentar de novo', async () => {
    ponteDoCofre({ gravarDevolve: false, vinculo: null });
    await expect(svc().verify('CHAVE-9', 'local-uuid-1')).resolves.toMatchObject({ ok: true });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('realinhamento do vínculo'));
  });
});
