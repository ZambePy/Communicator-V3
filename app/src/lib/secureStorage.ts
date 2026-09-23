import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Onde a sessão do Supabase (access token + refresh token) fica guardada.
 *
 * iOS/Android: `expo-secure-store` — Keychain no iOS, Keystore (AES) no
 * Android. É o único lugar aceitável para um refresh token: o AsyncStorage é
 * um arquivo em texto puro que sai em backup e em aparelho com root.
 *
 * Web (`expo start --web`, só desenvolvimento): AsyncStorage/localStorage —
 * não existe SecureStore no navegador.
 *
 * O SecureStore avisa (e em versões futuras recusa) valores acima de 2048
 * BYTES. A sessão do Supabase passa disso com folga (dois JWTs + o objeto do
 * usuário), então o valor é quebrado em pedaços:
 *
 *   <key>.n  → quantos pedaços
 *   <key>.0, <key>.1, … → os pedaços
 *
 * O limite é em bytes UTF-8, não em caracteres: um nome com acento no
 * `user_metadata` ocupa 2 bytes por letra. Por isso o corte é por unidades
 * UTF-16 com teto que, no pior caso (3 bytes por unidade), ainda cabe em
 * 2048 bytes — e nunca parte um par substituto (emoji) ao meio.
 */

/** 600 unidades UTF-16 × 3 bytes (pior caso) = 1800 bytes < 2048. */
export const CHUNK_UNITS = 600;

/** Chaves do SecureStore só aceitam [A-Za-z0-9._-]; a do Supabase é `sb-<ref>-auth-token`. */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Quebra `value` em pedaços de até `size` unidades sem separar pares substitutos. */
export function splitChunks(value: string, size = CHUNK_UNITS): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < value.length) {
    let end = Math.min(i + size, value.length);
    // Se o último caractere do pedaço é a metade alta de um par, recua um.
    const last = value.charCodeAt(end - 1);
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    parts.push(value.slice(i, end));
    i = end;
  }
  return parts;
}

async function readCount(key: string): Promise<number> {
  const n = Number(await SecureStore.getItemAsync(`${key}.n`));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

async function deleteChunks(key: string, from: number, to: number): Promise<void> {
  const ops: Promise<void>[] = [];
  for (let i = from; i < to; i++) ops.push(SecureStore.deleteItemAsync(`${key}.${i}`));
  await Promise.all(ops);
}

export const secureStorage = {
  async getItem(rawKey: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(rawKey);
    const key = safeKey(rawKey);
    const count = await readCount(key);
    // Formato antigo (valor inteiro numa chave só): ainda legível.
    if (!count) return SecureStore.getItemAsync(key);
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    // Pedaço faltando = sessão corrompida (gravação interrompida). Devolver
    // meio JSON faria o supabase-js quebrar no parse; `null` leva ao login.
    if (parts.some((p) => p == null)) return null;
    return parts.join('');
  },

  async setItem(rawKey: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.setItem(rawKey, value);
    const key = safeKey(rawKey);
    const previous = await readCount(key);
    const parts = splitChunks(value);
    // Pedaços primeiro, contador por último. Se o app morrer no meio da
    // gravação, o pior caso é um JSON truncado/misturado: o supabase-js não
    // consegue ler a sessão e o cuidador cai no login — nunca um token errado.
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
    // Sobras de uma sessão maior que a atual e o formato antigo.
    await deleteChunks(key, parts.length, previous);
    await SecureStore.deleteItemAsync(key);
  },

  async removeItem(rawKey: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(rawKey);
    const key = safeKey(rawKey);
    const count = await readCount(key);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
    await deleteChunks(key, 0, count);
  },
};
