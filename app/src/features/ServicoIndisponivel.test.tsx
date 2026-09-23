/**
 * Build sem as variáveis do Supabase: em vez de um modo de demonstração, um
 * aviso neutro e humano, com uma saída ("Tentar de novo") e um contato.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ServicoIndisponivel } from './ServicoIndisponivel';

describe('ServicoIndisponivel', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => (console.error as jest.Mock).mockRestore());

  it('mostra o aviso humano, sem jargão e sem demonstração', async () => {
    await render(<ServicoIndisponivel />);
    expect(screen.getByText('Não conseguimos conectar agora')).toBeTruthy();
    expect(screen.getByText('Tentar de novo')).toBeTruthy();
    expect(screen.getByText('Falar com a equipe')).toBeTruthy();
    expect(screen.queryByText(/demonstra|Supabase|EXPO_PUBLIC/i)).toBeNull();
    // O motivo técnico vai para o console de quem desenvolve.
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('EXPO_PUBLIC_SUPABASE_URL'));
  });
});

describe('hasSupabaseConfig', () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = url;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = key;
  });

  it('é falso sem as variáveis e verdadeiro com elas', () => {
    jest.isolateModules(() => {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      const m = require('@/lib/supabase') as typeof import('@/lib/supabase');
      expect(m.hasSupabaseConfig).toBe(false);
      expect(() => m.getSupabase()).toThrow(/ausentes/);
    });
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://exemplo.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'x'.repeat(40);
      const m = require('@/lib/supabase') as typeof import('@/lib/supabase');
      expect(m.hasSupabaseConfig).toBe(true);
    });
  });
});
