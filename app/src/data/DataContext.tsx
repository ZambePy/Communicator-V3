import React, { createContext, useContext, useMemo } from 'react';
import { DataProvider } from './types';
import { SupabaseProvider } from './supabaseProvider';

const DataContext = createContext<DataProvider | null>(null);

/**
 * Camada de dados do app: sempre o Supabase real (EXPO_PUBLIC_SUPABASE_URL /
 * EXPO_PUBLIC_SUPABASE_ANON_KEY). Não existe modo de demonstração: um build sem
 * essas variáveis nem chega aqui — `app/_layout.tsx` mostra o aviso de serviço
 * indisponível (`hasSupabaseConfig`).
 */
export function DataProviderRoot({ children }: { children: React.ReactNode }) {
  const provider = useMemo<DataProvider>(() => new SupabaseProvider(), []);
  return <DataContext.Provider value={provider}>{children}</DataContext.Provider>;
}

export function useData(): DataProvider {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData deve ser usado dentro de DataProviderRoot');
  return ctx;
}
