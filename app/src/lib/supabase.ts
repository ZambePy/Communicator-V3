import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { secureStorage } from './secureStorage';

/**
 * Projeto Supabase "IrisFlow Communicator" — o mesmo do site e do desktop.
 * Os dois valores são públicos por definição (vão dentro do app); quem protege
 * os dados é a RLS. Vêm de `app/.env` no desenvolvimento e do `env` de cada
 * perfil do `eas.json` nos builds do EAS.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** true quando o build tem as variáveis do Supabase. Sem elas o app mostra "serviço indisponível". */
export const hasSupabaseConfig = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!hasSupabaseConfig) {
    // Só acontece em build mal configurado; `app/_layout.tsx` não monta a camada de dados nesse caso.
    throw new Error('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY ausentes neste build.');
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // Sessão (access + refresh token) no Keychain/Keystore, em pedaços
        // de < 2 KB — ver ./secureStorage.ts. Nunca no AsyncStorage.
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    // Recomendação do Supabase para React Native: com o app em segundo plano
    // os timers param e o refresh automático perde a hora; ao voltar para a
    // frente ele é religado e renova o token vencido antes da próxima query.
    if (Platform.OS !== 'web') {
      const sb = client;
      AppState.addEventListener('change', (estado) => {
        if (estado === 'active') void sb.auth.startAutoRefresh();
        else void sb.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}
