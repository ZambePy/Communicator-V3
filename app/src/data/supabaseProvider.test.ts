/**
 * Testes do provedor de produção com o cliente Supabase substituído por um
 * construtor de consultas falso. O que interessa aqui não é o PostgREST, e sim
 * o contrato do app com ele: quais chamadas saem, com que carga, e o que sobe
 * quando alguma delas falha.
 */
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { SITE_URL } from '@/lib/config';
import { mapDevice, mapSession, SupabaseProvider } from './supabaseProvider';
import { ehConflitoDeAjustes } from './types';

// Definidos antes de qualquer `new SupabaseProvider()` (que chama `getSupabase()`
// no construtor). A fábrica do `jest.mock` só devolve fechamentos, então os
// nomes abaixo já existem quando são lidos. Prefixo `mock` exigido pelo Jest.
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockResetPasswordForEmail = jest.fn();
type UsuarioFalso = { id: string; email: string };
type SessaoFalsa = { data: { session: { user: UsuarioFalso; refresh_token?: string } | null }; error?: unknown };
const mockGetSession = jest.fn<Promise<SessaoFalsa>, []>(async () => ({ data: { session: null }, error: null }));
const mockSignOut = jest.fn<Promise<{ error: unknown }>, []>(async () => ({ error: null }));
const mockOnAuthStateChange = jest.fn();
const mockLerSessaoGuardada = jest.fn<Promise<{ refresh_token?: string; user?: { id?: string; email?: string } } | null>, []>(async () => null);
const mockApagarSessaoGuardada = jest.fn(async () => undefined);
// Cliente descartável das saídas pendentes (`criarClienteIsolado`).
const mockIsolado = {
  rpc: jest.fn(),
  from: jest.fn(),
  auth: { refreshSession: jest.fn(), signOut: jest.fn(async () => ({ error: null })) },
};
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
      getSession: () => mockGetSession(),
      signOut: () => mockSignOut(),
      onAuthStateChange: (cb: unknown) => mockOnAuthStateChange(cb),
    },
  }),
  lerSessaoGuardada: () => mockLerSessaoGuardada(),
  apagarSessaoGuardada: () => mockApagarSessaoGuardada(),
  criarClienteIsolado: () => mockIsolado,
}));
// Keychain/Keystore em memória: o token registrado e as saídas pendentes.
const mockArmazem = new Map<string, string>();
jest.mock('@/lib/secureStorage', () => ({
  secureStorage: {
    getItem: async (k: string) => mockArmazem.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mockArmazem.set(k, v);
    },
    removeItem: async (k: string) => {
      mockArmazem.delete(k);
    },
  },
}));

const TOKEN_REGISTRADO = 'irisflow.push.token-registrado';
const SAIDA_PENDENTE = 'irisflow.push.saida-pendente';
const logado = (id = 'user-1'): SessaoFalsa => ({ data: { session: { user: { id, email: 'a@b.c' }, refresh_token: 'rt-1' } }, error: null });

type Resultado = { data?: unknown; error?: { message: string } | null };

/**
 * Consulta encadeável: cada método devolve o próprio objeto e o `await` final
 * (via `then`) entrega `resultado`. `single`/`maybeSingle` também.
 * Assim `sb.from('t').update(x).eq('id', 1).is('c', null)` funciona sem
 * reproduzir a API real método a método.
 */
function consulta(resultado: Resultado) {
  const q: Record<string, jest.Mock> & { then?: PromiseLike<Resultado>['then'] } = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'is', 'order', 'limit']) {
    q[m] = jest.fn(() => q);
  }
  q.single = jest.fn(async () => resultado);
  q.maybeSingle = jest.fn(async () => resultado);
  q.then = (onOk, onErr) => Promise.resolve(resultado).then(onOk, onErr);
  return q;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockResetPasswordForEmail.mockReset();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  mockSignOut.mockReset();
  mockSignOut.mockResolvedValue({ error: null });
  mockOnAuthStateChange.mockReset();
  mockLerSessaoGuardada.mockReset();
  mockLerSessaoGuardada.mockResolvedValue(null);
  mockApagarSessaoGuardada.mockClear();
  mockIsolado.rpc.mockReset();
  mockIsolado.from.mockReset();
  mockIsolado.auth.refreshSession.mockReset();
  mockIsolado.auth.signOut.mockClear();
  mockArmazem.clear();
});

// ---------- mapeadores ----------
describe('mapDevice', () => {
  const agora = new Date('2026-09-10T12:00:00Z').getTime();
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(agora));
  afterEach(() => jest.restoreAllMocks());

  it('marca online quem deu heartbeat há menos de 90 s', () => {
    const d = mapDevice({ id: 'd1', beneficiary_id: 'b1', name: 'Notebook', os: 'windows', last_seen_at: new Date(agora - 60_000).toISOString() });
    expect(d.online).toBe(true);
    expect(d.revoked_at).toBeNull();
  });

  it('marca offline depois de 90 s sem heartbeat', () => {
    const d = mapDevice({ id: 'd1', beneficiary_id: 'b1', last_seen_at: new Date(agora - 91_000).toISOString() });
    expect(d.online).toBe(false);
  });

  it('nunca considera online um computador revogado, mesmo com heartbeat recente', () => {
    const d = mapDevice({ id: 'd1', beneficiary_id: 'b1', last_seen_at: new Date(agora - 1_000).toISOString(), revoked_at: '2026-09-09T00:00:00Z' });
    expect(d.online).toBe(false);
    expect(d.revoked_at).toBe('2026-09-09T00:00:00Z');
  });

  it('aplica padrões seguros para colunas ausentes', () => {
    const d = mapDevice({ id: 7, beneficiary_id: 'b1' });
    expect(d).toMatchObject({ id: '7', name: 'Computador', os: 'windows', app_version: '', camera_ok: false, tracker_ok: false, calibrated: false, paired_at: null, hostname: null });
    // Sem `last_seen_at` o computador cai na época zero: offline, não "visto agora".
    expect(d.online).toBe(false);
  });
});

describe('mapSession', () => {
  it('converte números e mantém null onde o banco devolveu null', () => {
    const s = mapSession({
      id: 's1',
      beneficiary_id: 'b1',
      device_id: 'd1',
      status: 'active',
      started_at: '2026-09-10T11:00:00Z',
      ended_at: null,
      calibration_error_px: '61.5', // PostgREST pode devolver numeric como string
      calibration_error_deg: null,
      hit_rate_150px: 0.96,
      dwell_ms: '1500',
      utterances: '23',
      modules_used: ['Comunicação'],
      accuracy_report: { score: 'Bom', pointsMeasured: 13, pointsTotal: 13 },
    });
    expect(s.calibration_error_px).toBe(61.5);
    expect(s.calibration_error_deg).toBeNull();
    expect(s.dwell_ms).toBe(1500);
    expect(s.utterances).toBe(23);
    expect(s.modules_used).toEqual(['Comunicação']);
    expect(s.accuracy_report?.score).toBe('Bom');
    expect(s.ended_at).toBeNull();
  });

  it('usa padrões quando a linha está incompleta (sessão antiga, antes das colunas novas)', () => {
    const s = mapSession({ id: 's1', beneficiary_id: 'b1', started_at: '2026-09-10T11:00:00Z' });
    expect(s).toMatchObject({
      device_id: '',
      status: 'ended',
      posture_drift_px: 0,
      drift_kind: 'nenhum',
      fatigue: 'ok',
      dwell_ms: 1500,
      filter_preset: 'balanceado',
      modules_used: [],
      precision_px: null,
      accuracy_report: null,
      app_version: null,
    });
  });

  it('não trata "0" como ausente', () => {
    const s = mapSession({ id: 's1', beneficiary_id: 'b1', started_at: 'x', hit_rate_150px: 0, help_requests: 0 });
    expect(s.hit_rate_150px).toBe(0);
    expect(s.help_requests).toBe(0);
  });
});

// ---------- resolveHelpRequest ----------
describe('resolveHelpRequest', () => {
  const gravou = () => consulta({ data: [{ id: 'hr-1' }], error: null });

  it('propaga o erro do segundo UPDATE (reconhecimento) — antes ele era engolido', async () => {
    const primeiro = gravou();
    const segundo = consulta({ error: { message: 'permission denied for table help_requests' } });
    mockFrom.mockReturnValueOnce(primeiro).mockReturnValueOnce(segundo);

    const p = new SupabaseProvider();
    await expect(p.resolveHelpRequest('hr-1')).rejects.toMatchObject({ message: 'permission denied for table help_requests' });

    // As duas escritas foram tentadas, na tabela certa e com as colunas certas.
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'help_requests');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'help_requests');
    expect(primeiro.update).toHaveBeenCalledWith(expect.objectContaining({ resolved_at: expect.any(String) }));
    expect(primeiro.eq).toHaveBeenCalledWith('id', 'hr-1');
    expect(segundo.update).toHaveBeenCalledWith(expect.objectContaining({ acknowledged_at: expect.any(String) }));
    expect(segundo.is).toHaveBeenCalledWith('acknowledged_at', null);
  });

  it('para no primeiro UPDATE quando ele falha, sem tentar o reconhecimento', async () => {
    mockFrom.mockReturnValueOnce(consulta({ error: { message: 'network' } }));
    const p = new SupabaseProvider();
    await expect(p.resolveHelpRequest('hr-1')).rejects.toMatchObject({ message: 'network' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('resolve quando as duas escritas passam', async () => {
    mockFrom.mockReturnValueOnce(gravou()).mockReturnValueOnce(gravou());
    await expect(new SupabaseProvider().resolveHelpRequest('hr-1')).resolves.toBeUndefined();
  });

  it('UPDATE sem linha e sem erro (a RLS negou em silêncio) rejeita — a tela não diz "resolvido"', async () => {
    mockFrom.mockReturnValueOnce(consulta({ data: [], error: null }));
    await expect(new SupabaseProvider().resolveHelpRequest('hr-1')).rejects.toThrow(/não está acessível/);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});

// ---------- ajustes remotos ----------
describe('getSettings / updateSettings', () => {
  const linha = { beneficiary_id: 'b1', dwell_ms: 800, filter_preset: 'estavel', keyboard_layout: 'qwerty', sensitivity: 7, voice: 'Francisca', emergency_timeout_s: 60, emergency_contacts: [], updated_at: '2026-09-01T00:00:00Z' };

  it('getSettings devolve null quando não há linha — sem inventar padrões', async () => {
    const leitura = consulta({ data: null, error: null });
    mockFrom.mockReturnValueOnce(leitura);
    await expect(new SupabaseProvider().getSettings('b1')).resolves.toBeNull();
    expect(leitura.upsert).not.toHaveBeenCalled();
    expect(leitura.insert).not.toHaveBeenCalled();
  });

  it('getSettings devolve a linha quando ela existe', async () => {
    mockFrom.mockReturnValueOnce(consulta({ data: linha, error: null }));
    await expect(new SupabaseProvider().getSettings('b1')).resolves.toEqual(linha);
  });

  it('sem linha lida: INSERT só com o campo alterado + chave (o desktop não recebe padrões)', async () => {
    const escrita = consulta({ data: { ...linha, emergency_timeout_s: 90 }, error: null });
    mockFrom.mockReturnValueOnce(escrita);

    const r = await new SupabaseProvider().updateSettings('b1', { emergency_timeout_s: 90 }, null);

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('patient_settings');
    const [payload] = escrita.insert.mock.calls[0];
    expect(payload).toEqual({ beneficiary_id: 'b1', emergency_timeout_s: 90 });
    // Nada de dwell_ms/filter_preset: o desktop não pode receber 1500/balanceado sem o cuidador ter pedido.
    expect(payload).not.toHaveProperty('dwell_ms');
    expect(payload).not.toHaveProperty('filter_preset');
    expect(escrita.upsert).not.toHaveBeenCalled();
    expect(r.emergency_timeout_s).toBe(90);
  });

  it('sem linha lida, mas outro celular criou a linha antes (23505): conflito, nada gravado', async () => {
    mockFrom.mockReturnValueOnce(consulta({ data: null, error: { message: 'duplicate key', code: '23505' } as { message: string } }));
    const erro = await new SupabaseProvider().updateSettings('b1', { emergency_timeout_s: 90 }, null).catch((e: unknown) => e);
    expect(ehConflitoDeAjustes(erro)).toBe(true);
  });

  it('com linha lida: UPDATE só se `updated_at` ainda é o lido (concorrência otimista)', async () => {
    const escrita = consulta({ data: { ...linha, emergency_timeout_s: 90, updated_at: '2026-09-02T00:00:00Z' }, error: null });
    mockFrom.mockReturnValueOnce(escrita);

    const r = await new SupabaseProvider().updateSettings('b1', { emergency_timeout_s: 90 }, linha.updated_at);

    expect(escrita.update).toHaveBeenCalledWith({ emergency_timeout_s: 90 });
    expect(escrita.eq).toHaveBeenCalledWith('beneficiary_id', 'b1');
    expect(escrita.eq).toHaveBeenCalledWith('updated_at', linha.updated_at);
    expect(r.updated_at).toBe('2026-09-02T00:00:00Z');
  });

  it('com linha lida e ninguém afetado (outro celular gravou depois da leitura): conflito', async () => {
    mockFrom.mockReturnValueOnce(consulta({ data: null, error: null }));
    const erro = await new SupabaseProvider().updateSettings('b1', { emergency_contacts: [] }, linha.updated_at).catch((e: unknown) => e);
    expect(ehConflitoDeAjustes(erro)).toBe(true);
  });

  it('ignora beneficiary_id/updated_at vindos no patch e propaga erro', async () => {
    const escrita = consulta({ data: null, error: { message: 'permission denied' } });
    mockFrom.mockReturnValueOnce(escrita);
    await expect(new SupabaseProvider().updateSettings('b1', { dwell_ms: 800, beneficiary_id: 'outro', updated_at: 'x' }, linha.updated_at)).rejects.toMatchObject({ message: 'permission denied' });
    expect(escrita.update).toHaveBeenCalledWith({ dwell_ms: 800 });
    expect(escrita.eq).toHaveBeenCalledWith('beneficiary_id', 'b1');
  });
});

// ---------- conversa ----------
describe('listMessages', () => {
  it('pede as 200 mais RECENTES (desc + limit) e devolve em ordem cronológica', async () => {
    const doBanco = [
      { id: 'm3', created_at: '2026-09-10T12:02:00Z' },
      { id: 'm2', created_at: '2026-09-10T12:01:00Z' },
      { id: 'm1', created_at: '2026-09-10T12:00:00Z' },
    ];
    const leitura = consulta({ data: doBanco, error: null });
    mockFrom.mockReturnValueOnce(leitura);

    const r = await new SupabaseProvider().listMessages('b1');

    expect(leitura.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(leitura.limit).toHaveBeenCalledWith(200);
    expect(r.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});

// ---------- reconhecimento ----------
describe('acknowledgeHelpRequest', () => {
  it('grava acknowledged_by com o usuário logado', async () => {
    mockGetSession.mockResolvedValueOnce(logado());
    const escrita = consulta({ data: [{ id: 'hr-1' }], error: null });
    mockFrom.mockReturnValueOnce(escrita);

    await new SupabaseProvider().acknowledgeHelpRequest('hr-1');

    expect(escrita.update).toHaveBeenCalledWith({ acknowledged_at: expect.any(String), acknowledged_by: 'user-1' });
    expect(escrita.eq).toHaveBeenCalledWith('id', 'hr-1');
    expect(escrita.is).toHaveBeenCalledWith('acknowledged_at', null);
  });

  it('nenhuma linha porque outro celular já confirmou: tudo certo', async () => {
    mockFrom.mockReturnValueOnce(consulta({ data: [], error: null })).mockReturnValueOnce(consulta({ data: { acknowledged_at: '2026-09-10T12:00:00Z' }, error: null }));
    await expect(new SupabaseProvider().acknowledgeHelpRequest('hr-1')).resolves.toBeUndefined();
  });

  it('nenhuma linha e o pedido continua sem confirmação (a RLS negou): rejeita', async () => {
    mockFrom.mockReturnValueOnce(consulta({ data: [], error: null })).mockReturnValueOnce(consulta({ data: null, error: null }));
    await expect(new SupabaseProvider().acknowledgeHelpRequest('hr-1')).rejects.toThrow(/não está acessível/);
  });
});

describe('markMessagesRead', () => {
  it('devolve só as linhas que o banco marcou', async () => {
    const escrita = consulta({ data: [{ id: 'm1', read_at: '2026-09-10T12:00:00Z' }], error: null });
    mockFrom.mockReturnValueOnce(escrita);
    await expect(new SupabaseProvider().markMessagesRead('b1')).resolves.toEqual([{ id: 'm1', read_at: '2026-09-10T12:00:00Z' }]);
    expect(escrita.eq).toHaveBeenCalledWith('sender', 'paciente');
    expect(escrita.is).toHaveBeenCalledWith('read_at', null);
  });

  it('propaga a falha (antes era ignorada e o selo sumia sem nada gravado)', async () => {
    mockFrom.mockReturnValueOnce(consulta({ data: null, error: { message: 'network' } }));
    await expect(new SupabaseProvider().markMessagesRead('b1')).rejects.toMatchObject({ message: 'network' });
  });
});

// ---------- sessão ----------
describe('getUser / garantirSessao / onAuthChange (sem rede não é sair da conta)', () => {
  const semRede = () => new AuthRetryableFetchError('Failed to fetch', 0);

  it('com sessão: o usuário dela', async () => {
    mockGetSession.mockResolvedValueOnce(logado());
    await expect(new SupabaseProvider().getUser()).resolves.toEqual({ id: 'user-1', email: 'a@b.c' });
  });

  it('token vencido e sem rede para renovar: continua logado com a sessão guardada', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: semRede() });
    mockLerSessaoGuardada.mockResolvedValueOnce({ refresh_token: 'rt', user: { id: 'user-1', email: 'a@b.c' } });
    await expect(new SupabaseProvider().getUser()).resolves.toEqual({ id: 'user-1', email: 'a@b.c' });
  });

  it('sem sessão nenhuma: null', async () => {
    await expect(new SupabaseProvider().getUser()).resolves.toBeNull();
  });

  it('garantirSessao: sem rede falha como conexão; sem sessão, como sessão expirada', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: semRede() });
    await expect(new SupabaseProvider().garantirSessao()).rejects.toThrow(/Sem conexão/);
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(new SupabaseProvider().garantirSessao()).rejects.toThrow(/sessão expirou/);
    mockGetSession.mockResolvedValueOnce(logado());
    await expect(new SupabaseProvider().garantirSessao()).resolves.toBeUndefined();
  });

  it('onAuthChange: só SIGNED_OUT tira da conta; a sessão inicial sem sessão (falta de rede) não', () => {
    const unsubscribe = jest.fn();
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
    const cb = jest.fn();
    const off = new SupabaseProvider().onAuthChange(cb);
    const ouvinte = mockOnAuthStateChange.mock.calls[0][0] as (e: string, s: unknown) => void;

    ouvinte('INITIAL_SESSION', null);
    expect(cb).not.toHaveBeenCalled();
    ouvinte('TOKEN_REFRESHED', { user: { id: 'user-1', email: 'a@b.c' } });
    expect(cb).toHaveBeenLastCalledWith({ id: 'user-1', email: 'a@b.c' });
    ouvinte('SIGNED_OUT', null);
    expect(cb).toHaveBeenLastCalledWith(null);
    off();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('getLicense', () => {
  it('pede ao servidor a licença (desktop_license) — a mesma regra do desktop', async () => {
    const licenca = { allowed: false, reason: 'beta_encerrada', plan_id: 'beta', features: { relatorios: true, multiplos_dispositivos: true, assistente: true, voz: true, lazer: true } };
    mockRpc.mockResolvedValueOnce({ data: licenca, error: null });
    await expect(new SupabaseProvider().getLicense()).resolves.toEqual(licenca);
    expect(mockRpc).toHaveBeenCalledWith('desktop_license');
  });

  it('propaga a falha', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
    await expect(new SupabaseProvider().getLicense()).rejects.toMatchObject({ message: 'network' });
  });
});

// ---------- push ----------
describe('registerPushToken', () => {
  it('registra pela RPC `registrar_push_token` (o aparelho passa a ser da conta logada) e guarda o token', async () => {
    mockGetSession.mockResolvedValueOnce(logado());
    mockRpc.mockResolvedValueOnce({ data: null, error: null, status: 204 });

    await new SupabaseProvider().registerPushToken('ExponentPushToken[x]');

    expect(mockRpc).toHaveBeenCalledWith('registrar_push_token', { p_token: 'ExponentPushToken[x]', p_platform: 'expo' });
    // O upsert direto (recusado pela RLS quando o token era de outra conta) não é usado.
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockArmazem.get(TOKEN_REGISTRADO)).toBe('ExponentPushToken[x]');
  });

  it('banco sem a função (migração ainda não aplicada): cai no upsert de antes', async () => {
    mockGetSession.mockResolvedValueOnce(logado());
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 });
    const upsert = consulta({ error: null });
    mockFrom.mockReturnValueOnce(upsert);

    await new SupabaseProvider().registerPushToken('ExponentPushToken[x]');

    expect(upsert.upsert).toHaveBeenCalledWith({ profile_id: 'user-1', token: 'ExponentPushToken[x]', platform: 'expo' }, { onConflict: 'token' });
  });

  it('rejeita quando o banco recusa o token (antes o erro era engolido)', async () => {
    mockGetSession.mockResolvedValueOnce(logado());
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 });
    await expect(new SupabaseProvider().registerPushToken('ExponentPushToken[x]')).rejects.toThrow(/recusou o registro/);
    expect(mockArmazem.has(TOKEN_REGISTRADO)).toBe(false);
  });

  it('rejeita sem sessão, sem tentar escrever', async () => {
    await expect(new SupabaseProvider().registerPushToken('t')).rejects.toThrow(/Sem sessão/);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('signOut: o celular deixa de receber os alertas da conta', () => {
  it('tira o token obtido agora E o registrado numa abertura anterior, ANTES de derrubar a sessão', async () => {
    mockArmazem.set(TOKEN_REGISTRADO, 'ExponentPushToken[antigo]');
    mockRpc.mockResolvedValue({ data: null, error: null });

    await new SupabaseProvider().signOut('ExponentPushToken[agora]');

    expect(mockRpc).toHaveBeenCalledWith('remover_push_token', { p_token: 'ExponentPushToken[agora]' });
    expect(mockRpc).toHaveBeenCalledWith('remover_push_token', { p_token: 'ExponentPushToken[antigo]' });
    // ordem: a remoção (que depende de auth.uid()) vem antes do signOut do Auth
    expect(mockRpc.mock.invocationCallOrder[1]).toBeLessThan(mockSignOut.mock.invocationCallOrder[0]);
    expect(mockArmazem.has(TOKEN_REGISTRADO)).toBe(false);
    expect(mockArmazem.has(SAIDA_PENDENTE)).toBe(false);
  });

  it('sem rede: a remoção fica pendente com a credencial da sessão, e a sessão guardada é apagada', async () => {
    mockArmazem.set(TOKEN_REGISTRADO, 'ExponentPushToken[x]');
    mockLerSessaoGuardada.mockResolvedValue({ refresh_token: 'rt-9', user: { id: 'user-1' } });
    mockRpc.mockRejectedValue(new TypeError('Network request failed'));
    // O supabase-js devolve erro SEM apagar a sessão quando não alcança o servidor.
    mockSignOut.mockResolvedValueOnce({ error: new AuthRetryableFetchError('Failed to fetch', 0) });

    await new SupabaseProvider().signOut(null);

    expect(JSON.parse(mockArmazem.get(SAIDA_PENDENTE) ?? '[]')).toEqual([{ tokens: ['ExponentPushToken[x]'], refresh_token: 'rt-9' }]);
    expect(mockArmazem.has(TOKEN_REGISTRADO)).toBe(false);
    expect(mockApagarSessaoGuardada).toHaveBeenCalled();
  });

  it('sem token nenhum: só derruba a sessão', async () => {
    await new SupabaseProvider().signOut(null);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockApagarSessaoGuardada).not.toHaveBeenCalled();
  });

  it('servidor que não responde não prende a saída: segue depois do prazo, com a remoção pendente', async () => {
    jest.useFakeTimers();
    try {
      mockArmazem.set(TOKEN_REGISTRADO, 'ExponentPushToken[x]');
      mockLerSessaoGuardada.mockResolvedValue({ refresh_token: 'rt-9' });
      mockRpc.mockReturnValue(new Promise(() => undefined));
      mockSignOut.mockReturnValue(new Promise(() => undefined));

      const saida = new SupabaseProvider().signOut(null);
      await jest.advanceTimersByTimeAsync(5_000);
      await jest.advanceTimersByTimeAsync(5_000);
      await saida;

      expect(JSON.parse(mockArmazem.get(SAIDA_PENDENTE) ?? '[]')).toEqual([{ tokens: ['ExponentPushToken[x]'], refresh_token: 'rt-9' }]);
      expect(mockApagarSessaoGuardada).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('concluirSaidaPendente', () => {
  const pendente = (tokens: string[], refresh_token = 'rt-9') => mockArmazem.set(SAIDA_PENDENTE, JSON.stringify([{ tokens, refresh_token }]));

  it('nada pendente: true, sem rede', async () => {
    await expect(new SupabaseProvider().concluirSaidaPendente()).resolves.toBe(true);
    expect(mockIsolado.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('com rede: renova a credencial da conta que saiu, remove os tokens e encerra aquela sessão', async () => {
    pendente(['ExponentPushToken[x]']);
    mockIsolado.auth.refreshSession.mockResolvedValueOnce({ data: { session: { refresh_token: 'rt-10' } }, error: null });
    mockIsolado.rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(new SupabaseProvider().concluirSaidaPendente()).resolves.toBe(true);

    expect(mockIsolado.auth.refreshSession).toHaveBeenCalledWith({ refresh_token: 'rt-9' });
    expect(mockIsolado.rpc).toHaveBeenCalledWith('remover_push_token', { p_token: 'ExponentPushToken[x]' });
    expect(mockIsolado.auth.signOut).toHaveBeenCalled();
    expect(mockArmazem.has(SAIDA_PENDENTE)).toBe(false);
    // Nada disso passa pela sessão do app (quem está logado agora).
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('ainda sem rede: continua pendente', async () => {
    pendente(['ExponentPushToken[x]']);
    mockIsolado.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });

    await expect(new SupabaseProvider().concluirSaidaPendente()).resolves.toBe(false);
    expect(JSON.parse(mockArmazem.get(SAIDA_PENDENTE) ?? '[]')).toEqual([{ tokens: ['ExponentPushToken[x]'], refresh_token: 'rt-9' }]);
  });

  it('credencial recusada (sessão revogada): desiste, sem ficar tentando para sempre', async () => {
    pendente(['ExponentPushToken[x]']);
    mockIsolado.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Invalid Refresh Token', status: 400 } });

    await expect(new SupabaseProvider().concluirSaidaPendente()).resolves.toBe(true);
    expect(mockArmazem.has(SAIDA_PENDENTE)).toBe(false);
  });

  it('token registrado de novo neste celular (outra conta entrou): não é removido — agora é dela', async () => {
    pendente(['ExponentPushToken[x]']);
    mockArmazem.set(TOKEN_REGISTRADO, 'ExponentPushToken[x]');

    await expect(new SupabaseProvider().concluirSaidaPendente()).resolves.toBe(true);
    expect(mockIsolado.auth.refreshSession).not.toHaveBeenCalled();
    expect(mockIsolado.rpc).not.toHaveBeenCalled();
  });
});

// ---------- requestPasswordReset ----------
describe('getSubscription e getBetaRegistration (beta)', () => {
  it('lê a assinatura beta com o plano embutido, inclusive `purchasable`', async () => {
    const linha = {
      id: 'sub1',
      plan_id: 'beta',
      status: 'ativa',
      price_brl: 0,
      trial_ends_at: '2026-09-15T00:00:00Z',
      next_charge_at: '2027-03-15T00:00:00Z',
      plans: { id: 'beta', name: 'Beta', price_brl: 0, trial_days: 0, purchasable: false },
    };
    const leitura = consulta({ data: linha, error: null });
    mockFrom.mockReturnValueOnce(leitura);

    const r = await new SupabaseProvider().getSubscription();

    expect(mockFrom).toHaveBeenCalledWith('subscriptions');
    expect(leitura.select).toHaveBeenCalledWith(expect.stringContaining('purchasable'));
    expect(r?.subscription).toMatchObject({ plan_id: 'beta', status: 'ativa', price_brl: 0, next_charge_at: '2027-03-15T00:00:00Z' });
    expect(r?.plan).toEqual({ id: 'beta', name: 'Beta', price_brl: 0, trial_days: 0, purchasable: false });
  });

  it('devolve null quando a conta não está na beta (conta antiga com plano pago)', async () => {
    mockFrom.mockReturnValueOnce(consulta({ data: null, error: null }));
    await expect(new SupabaseProvider().getBetaRegistration()).resolves.toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('beta_registrations');
  });

  it('devolve a inscrição própria e propaga erro de leitura', async () => {
    const inscricao = { wants_caregiver_app: true, feedback_consent: false, downloaded_at: null, registered_at: '2026-09-15T10:00:00Z' };
    mockFrom.mockReturnValueOnce(consulta({ data: inscricao, error: null }));
    await expect(new SupabaseProvider().getBetaRegistration()).resolves.toEqual(inscricao);

    mockFrom.mockReturnValueOnce(consulta({ data: null, error: { message: 'JWT expired' } }));
    await expect(new SupabaseProvider().getBetaRegistration()).rejects.toMatchObject({ message: 'JWT expired' });
  });
});

describe('requestPasswordReset', () => {
  it('normaliza o e-mail e manda o link para o /nova-senha do site configurado', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    await new SupabaseProvider().requestPasswordReset('  Maria@Exemplo.com ');
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('maria@exemplo.com', { redirectTo: `${SITE_URL}/nova-senha` });
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
  });

  it('resolve em silêncio se o servidor disser que o usuário não existe (não revelar contas)', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { message: 'User not found' } });
    await expect(new SupabaseProvider().requestPasswordReset('x@y.com')).resolves.toBeUndefined();
  });

  it('traduz o limite de envio, que é uma falha real que o cuidador precisa ver', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { message: 'Email rate limit exceeded' } });
    await expect(new SupabaseProvider().requestPasswordReset('x@y.com')).rejects.toThrow(/Aguarde alguns minutos/);
  });
});
