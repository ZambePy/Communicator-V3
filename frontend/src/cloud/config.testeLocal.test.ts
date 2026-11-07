import { afterEach, describe, expect, it, vi } from 'vitest';

// O modo de teste local desliga a nuvem mesmo com o `frontend/.env.local` do
// desenvolvedor preenchido: nenhuma mensagem, heartbeat ou login real sai dele.

const URL = 'https://projeto-de-exemplo.supabase.co';
const CHAVE = 'chave-anonima-de-exemplo-com-mais-de-vinte-caracteres';

async function nuvemNoModo(modo: string, dev = true): Promise<boolean> {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  vi.stubEnv('MODE', modo);
  vi.stubEnv('VITE_SUPABASE_URL', URL);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', CHAVE);
  return (await import('./config')).nuvemConfigurada;
}

afterEach(() => vi.unstubAllEnvs());

describe('nuvem no modo de teste local', () => {
  it('desligada no teste-local, mesmo com URL e chave', async () => {
    expect(await nuvemNoModo('teste-local')).toBe(false);
  });

  it('ligada no npm run dev de sempre, com URL e chave', async () => {
    expect(await nuvemNoModo('development')).toBe(true);
  });

  // O comando gera o build de produção com `--mode teste-local`.
  it('desligada no build de produção do teste-local', async () => {
    expect(await nuvemNoModo('teste-local', false)).toBe(false);
  });

  it('ligada no build do instalador, com URL e chave', async () => {
    expect(await nuvemNoModo('production', false)).toBe(true);
  });
});
