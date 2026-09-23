/**
 * Testes do provedor de produção com o cliente Supabase substituído por um
 * construtor de consultas falso. O que interessa aqui não é o PostgREST, e sim
 * o contrato do app com ele: quais chamadas saem, com que carga, e o que sobe
 * quando alguma delas falha.
 */
import { SITE_URL } from '@/lib/config';
import { mapDevice, mapSession, SupabaseProvider } from './supabaseProvider';

// Definidos antes de qualquer `new SupabaseProvider()` (que chama `getSupabase()`
// no construtor). A fábrica do `jest.mock` só devolve fechamentos, então os
// nomes abaixo já existem quando são lidos. Prefixo `mock` exigido pelo Jest.
const mockFrom = jest.fn();
const mockResetPasswordForEmail = jest.fn();
type SessaoFalsa = { data: { session: { user: { id: string; email: string } } | null } };
const mockGetSession = jest.fn<Promise<SessaoFalsa>, []>(async () => ({ data: { session: null } }));
const mockSignOut = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
      getSession: () => mockGetSession(),
      signOut: () => mockSignOut(),
    },
  }),
}));

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
  mockResetPasswordForEmail.mockReset();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSignOut.mockClear();
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
  it('propaga o erro do segundo UPDATE (reconhecimento) — antes ele era engolido', async () => {
    const primeiro = consulta({ error: null });
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
    mockFrom.mockReturnValueOnce(consulta({ error: null })).mockReturnValueOnce(consulta({ error: null }));
    await expect(new SupabaseProvider().resolveHelpRequest('hr-1')).resolves.toBeUndefined();
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

  it('updateSettings faz upsert PARCIAL: só o campo alterado + chave, sem ler antes', async () => {
    const escrita = consulta({ data: { ...linha, emergency_timeout_s: 90 }, error: null });
    mockFrom.mockReturnValueOnce(escrita);

    const r = await new SupabaseProvider().updateSettings('b1', { emergency_timeout_s: 90 });

    // Uma única chamada (a escrita): o SELECT prévio que montava a linha inteira sumiu.
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith('patient_settings');
    const [payload, opts] = escrita.upsert.mock.calls[0];
    expect(payload).toEqual({ beneficiary_id: 'b1', emergency_timeout_s: 90, updated_at: expect.any(String) });
    // Nada de dwell_ms/filter_preset no payload: o desktop não pode receber 1500/balanceado sem o cuidador ter pedido.
    expect(payload).not.toHaveProperty('dwell_ms');
    expect(payload).not.toHaveProperty('filter_preset');
    expect(opts).toEqual({ onConflict: 'beneficiary_id' });
    expect(r.emergency_timeout_s).toBe(90);
  });

  it('updateSettings ignora beneficiary_id/updated_at vindos no patch e propaga erro', async () => {
    const escrita = consulta({ data: null, error: { message: 'permission denied' } });
    mockFrom.mockReturnValueOnce(escrita);
    await expect(new SupabaseProvider().updateSettings('b1', { dwell_ms: 800, beneficiary_id: 'outro', updated_at: 'x' })).rejects.toMatchObject({ message: 'permission denied' });
    expect(escrita.upsert.mock.calls[0][0]).toMatchObject({ beneficiary_id: 'b1', dwell_ms: 800 });
    expect(escrita.upsert.mock.calls[0][0].updated_at).not.toBe('x');
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
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'user-1', email: 'a@b.c' } } } });
    const escrita = consulta({ error: null });
    mockFrom.mockReturnValueOnce(escrita);

    await new SupabaseProvider().acknowledgeHelpRequest('hr-1');

    expect(escrita.update).toHaveBeenCalledWith({ acknowledged_at: expect.any(String), acknowledged_by: 'user-1' });
    expect(escrita.eq).toHaveBeenCalledWith('id', 'hr-1');
    expect(escrita.is).toHaveBeenCalledWith('acknowledged_at', null);
  });
});

// ---------- push ----------
describe('registerPushToken / signOut', () => {
  it('rejeita quando o banco recusa o token (antes o erro era engolido)', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'user-1', email: 'a@b.c' } } } });
    mockFrom.mockReturnValueOnce(consulta({ error: { message: 'new row violates row-level security policy' } }));
    await expect(new SupabaseProvider().registerPushToken('ExponentPushToken[x]')).rejects.toThrow(/recusou o registro/);
  });

  it('rejeita sem sessão, sem tentar escrever', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(new SupabaseProvider().registerPushToken('t')).rejects.toThrow(/Sem sessão/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('signOut apaga o token registrado nesta execução ANTES de derrubar a sessão', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'user-1', email: 'a@b.c' } } } });
    const registro = consulta({ error: null });
    const remocao = consulta({ error: null });
    mockFrom.mockReturnValueOnce(registro).mockReturnValueOnce(remocao);

    const p = new SupabaseProvider();
    await p.registerPushToken('ExponentPushToken[x]');
    expect(registro.upsert).toHaveBeenCalledWith({ profile_id: 'user-1', token: 'ExponentPushToken[x]', platform: 'expo' }, { onConflict: 'token' });

    await p.signOut();
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'push_tokens');
    expect(remocao.delete).toHaveBeenCalled();
    expect(remocao.eq).toHaveBeenCalledWith('token', 'ExponentPushToken[x]');
    // ordem: o DELETE (que depende de auth.uid()) vem antes do signOut do Auth
    expect(remocao.delete.mock.invocationCallOrder[0]).toBeLessThan(mockSignOut.mock.invocationCallOrder[0]);
  });

  it('signOut sem token registrado só derruba a sessão', async () => {
    await new SupabaseProvider().signOut();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
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
