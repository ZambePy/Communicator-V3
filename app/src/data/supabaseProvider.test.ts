/**
 * Testes do provedor de produção com o cliente Supabase substituído por um
 * construtor de consultas falso. O que interessa aqui não é o PostgREST, e sim
 * o contrato do app com ele: quais chamadas saem, com que carga, e o que sobe
 * quando alguma delas falha.
 */
import { mapDevice, mapSession, SupabaseProvider } from './supabaseProvider';

// Definidos antes de qualquer `new SupabaseProvider()` (que chama `getSupabase()`
// no construtor). A fábrica do `jest.mock` só devolve fechamentos, então os
// nomes abaixo já existem quando são lidos. Prefixo `mock` exigido pelo Jest.
const mockFrom = jest.fn();
const mockResetPasswordForEmail = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args) },
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

// ---------- ensureSettings ----------
describe('ensureSettings', () => {
  const linha = { beneficiary_id: 'b1', dwell_ms: 800, filter_preset: 'estavel', keyboard_layout: 'qwerty', sensitivity: 7, voice: 'Francisca', emergency_timeout_s: 60, emergency_contacts: [], updated_at: '2026-09-01T00:00:00Z' };

  it('devolve a linha existente sem fazer upsert', async () => {
    const leitura = consulta({ data: linha, error: null });
    mockFrom.mockReturnValueOnce(leitura);

    const r = await new SupabaseProvider().ensureSettings('b1', { dwell_ms: 2500 });

    expect(r).toEqual(linha); // o que está no banco vence o que a tela mostra
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(leitura.select).toHaveBeenCalled();
    expect(leitura.upsert).not.toHaveBeenCalled();
  });

  it('faz upsert com padrões + valores da tela quando não há linha', async () => {
    const leitura = consulta({ data: null, error: null });
    const escrita = consulta({ data: { ...linha, dwell_ms: 2500 }, error: null });
    mockFrom.mockReturnValueOnce(leitura).mockReturnValueOnce(escrita);

    const r = await new SupabaseProvider().ensureSettings('b1', { dwell_ms: 2500 });

    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'patient_settings');
    expect(escrita.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        beneficiary_id: 'b1',
        dwell_ms: 2500, // veio da tela
        emergency_timeout_s: 45, // padrão
        filter_preset: 'balanceado',
        updated_at: expect.any(String),
      }),
    );
    expect(r.dwell_ms).toBe(2500);
  });

  it('propaga o erro da leitura sem tentar escrever', async () => {
    mockFrom.mockReturnValueOnce(consulta({ data: null, error: { message: 'JWT expired' } }));
    await expect(new SupabaseProvider().ensureSettings('b1')).rejects.toMatchObject({ message: 'JWT expired' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
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
  it('normaliza o e-mail e não passa redirectTo (a URL fica no painel do Supabase)', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    await new SupabaseProvider().requestPasswordReset('  Maria@Exemplo.com ');
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('maria@exemplo.com');
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
