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

/**
 * Nome com que o supabase-js guarda a sessão (access + refresh token) no
 * `secureStorage`: exatamente o padrão dele, `sb-<ref do projeto>-auth-token`.
 * Fica explícito porque o app também precisa dela por fora do supabase-js:
 * (1) sem rede para renovar um token vencido ele responde "sem sessão", mas a
 * sessão continua guardada — e isso não é "saiu da conta"; (2) o `signOut`
 * sem rede e com token vencido volta com erro SEM apagá-la. Mudar este nome
 * desconecta todos os celulares.
 */
export const CHAVE_DA_SESSAO = (() => {
  try {
    return `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'sb-irisflow-auth-token';
  }
})();

/** O que interessa da sessão guardada: quem é e a credencial de renovação. */
export interface SessaoGuardada {
  refresh_token?: string;
  user?: { id?: string; email?: string | null };
}

/** A sessão guardada neste aparelho, lida direto do armazenamento (ou `null`). */
export async function lerSessaoGuardada(): Promise<SessaoGuardada | null> {
  try {
    const bruto = await secureStorage.getItem(CHAVE_DA_SESSAO);
    return bruto ? (JSON.parse(bruto) as SessaoGuardada) : null;
  } catch {
    return null;
  }
}

/** Apaga a sessão guardada — o que o `signOut` do supabase-js não faz quando não alcança o servidor com token vencido. */
export async function apagarSessaoGuardada(): Promise<void> {
  await secureStorage.removeItem(CHAVE_DA_SESSAO).catch(() => undefined);
}

/**
 * Cliente descartável: sem sessão guardada, sem renovação automática e com
 * outra chave de armazenamento. Serve só para concluir, com a credencial da
 * conta que saiu, a remoção do token de push que não deu para fazer sem rede —
 * sem reabrir aquela sessão no app.
 */
export function criarClienteIsolado(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'irisflow-saida-pendente' },
  });
}

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
        storageKey: CHAVE_DA_SESSAO,
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
