import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** true quando as variáveis de ambiente do Supabase estão configuradas. */
export const hasSupabaseConfig = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

/**
 * Armazena a sessão de autenticação no SecureStore (iOS/Android) ou AsyncStorage (web).
 * SecureStore tem limite de 2 KB por chave; o token JWT do Supabase cabe, mas dividimos por segurança.
 */
const CHUNK = 1800;
const secureStorage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (!count) return SecureStore.getItemAsync(key);
    let out = '';
    for (let i = 0; i < Number(count); i++) out += (await SecureStore.getItemAsync(`${key}.${i}`)) ?? '';
    return out;
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'g')) ?? [];
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
