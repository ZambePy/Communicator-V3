/**
 * Adaptador de armazenamento da sessão do Supabase sobre o SecureStore.
 * O SecureStore vira um Map em memória que RECUSA valores acima de 2048 bytes
 * UTF-8 — o comportamento que o adaptador existe para contornar.
 */
const mockStore = new Map<string, string>();
const mockBytes = (s: string) => Buffer.byteLength(s, 'utf8');

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`chave inválida: ${k}`);
    if (mockBytes(v) > 2048) throw new Error(`valor com ${mockBytes(v)} bytes`);
    mockStore.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

import { secureStorage, splitChunks } from './secureStorage';

const KEY = 'sb-xouznaqxhqzjdgeshlmh-auth-token';

/** Uma sessão realista: dois JWTs longos e um nome com acento e emoji. */
function sessao(tamanhoJwt: number): string {
  const jwt = 'eyJ' + 'a'.repeat(tamanhoJwt);
  return JSON.stringify({
    access_token: jwt,
    refresh_token: 'r'.repeat(40),
    user: { id: 'u1', email: 'joão@exemplo.com', user_metadata: { buyer_name: 'João Conceição 👩‍⚕️'.repeat(30) } },
  });
}

beforeEach(() => mockStore.clear());

describe('splitChunks', () => {
  it('nunca parte um par substituto (emoji) ao meio', () => {
    const s = 'a'.repeat(599) + '😀' + 'b'; // o emoji começa na unidade 599
    const parts = splitChunks(s, 600);
    expect(parts.join('')).toBe(s);
    expect(parts[0]).toHaveLength(599);
    for (const p of parts) expect(() => encodeURIComponent(p)).not.toThrow();
  });

  it('cada pedaço cabe em 2048 bytes mesmo só com caracteres de 3 bytes', () => {
    const parts = splitChunks('€'.repeat(5000));
    for (const p of parts) expect(mockBytes(p)).toBeLessThanOrEqual(2048);
  });
});

describe('secureStorage', () => {
  it('grava e lê de volta uma sessão bem maior que 2 KB', async () => {
    const v = sessao(6000);
    expect(mockBytes(v)).toBeGreaterThan(2048);
    await secureStorage.setItem(KEY, v);
    await expect(secureStorage.getItem(KEY)).resolves.toBe(v);
  });

  it('ao encolher a sessão apaga os pedaços que sobraram', async () => {
    await secureStorage.setItem(KEY, sessao(6000));
    const antes = mockStore.size;
    const menor = sessao(100);
    await secureStorage.setItem(KEY, menor);
    expect(mockStore.size).toBeLessThan(antes);
    await expect(secureStorage.getItem(KEY)).resolves.toBe(menor);
  });

  it('removeItem não deixa nada para trás', async () => {
    await secureStorage.setItem(KEY, sessao(6000));
    await secureStorage.removeItem(KEY);
    expect(mockStore.size).toBe(0);
    await expect(secureStorage.getItem(KEY)).resolves.toBeNull();
  });

  it('lê o formato antigo (valor numa chave só) e migra na próxima gravação', async () => {
    mockStore.set(KEY, '{"antigo":true}');
    await expect(secureStorage.getItem(KEY)).resolves.toBe('{"antigo":true}');
    await secureStorage.setItem(KEY, '{"novo":true}');
    expect(mockStore.has(KEY)).toBe(false);
    await expect(secureStorage.getItem(KEY)).resolves.toBe('{"novo":true}');
  });

  it('pedaço faltando devolve null (vai para o login) em vez de meio JSON', async () => {
    await secureStorage.setItem(KEY, sessao(6000));
    mockStore.delete(`${KEY}.1`);
    await expect(secureStorage.getItem(KEY)).resolves.toBeNull();
  });

  it('sem nada guardado devolve null', async () => {
    await expect(secureStorage.getItem(KEY)).resolves.toBeNull();
  });
});
