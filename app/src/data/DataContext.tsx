import React, { createContext, useContext, useMemo } from 'react';
import { hasSupabaseConfig } from '@/lib/supabase';
import { DataProvider } from './types';
import { MockProvider } from './mockProvider';
import { SupabaseProvider } from './supabaseProvider';

const DataContext = createContext<DataProvider | null>(null);

/**
 * Seleciona o provedor: Supabase quando EXPO_PUBLIC_SUPABASE_URL/ANON_KEY existem,
 * caso contrário o modo demonstração (MockProvider).
 */
export function DataProviderRoot({ children, forceMock = false }: { children: React.ReactNode; forceMock?: boolean }) {
  const provider = useMemo<DataProvider>(
    () => (hasSupabaseConfig && !forceMock ? new SupabaseProvider() : new MockProvider()),
    [forceMock],
  );
  return <DataContext.Provider value={provider}>{children}</DataContext.Provider>;
}

export function useData(): DataProvider {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData deve ser usado dentro de DataProviderRoot');
  return ctx;
}
