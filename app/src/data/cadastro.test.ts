/**
 * Cadastro e perfil no app (31/10/2026), com o cliente Supabase falso — como
 * em `supabaseProvider.test.ts`. O que se prova é o contrato com o servidor: a
 * MESMA sequência do site (signUp com os metadados → confirmar_codigo →
 * verifyOtp com token_hash tipo 'email' → complete_beta_registration com todos
 * os argumentos), e o que sobe em cada falha que a tela trata.
 */
import { SITE_URL } from '@/lib/config';
import { celularValido, SupabaseProvider, traduzErroDoCadastro } from './supabaseProvider';
import { ehErro } from './types';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockSignUp = jest.fn();
const mockResend = jest.fn();
const mockVerifyOtp = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetSession = jest.fn(async () => ({ data: { session: { user: { id: 'user-1', email: 'ana@exemplo.com.br' } } }, error: null }));
const mockRealtime = { isConnected: jest.fn(() => true), connect: jest.fn() };
const mockCanal: { on: jest.Mock; subscribe: jest.Mock } = { on: jest.fn(), subscribe: jest.fn() };
const mockRemoveChannel = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
    channel: () => mockCanal,
    removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
    realtime: mockRealtime,
    auth: {
      signUp: (...a: unknown[]) => mockSignUp(...a),
      resend: (...a: unknown[]) => mockResend(...a),
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
      getSession: () => mockGetSession(),
      onAuthStateChange: jest.fn(),
    },
  }),
  lerSessaoGuardada: async () => null,
  apagarSessaoGuardada: async () => undefined,
  criarClienteIsolado: () => ({}),
}));
jest.mock('@/lib/secureStorage', () => ({ secureStorage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }));

type Resultado = { data?: unknown; error?: { message: string; code?: string } | null };
function consulta(resultado: Resultado) {
  const q: Record<string, jest.Mock> & { then?: PromiseLike<Resultado>['then'] } = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'is', 'order', 'limit']) q[m] = jest.fn(() => q);
  q.single = jest.fn(async () => resultado);
  q.maybeSingle = jest.fn(async () => resultado);
  q.then = (onOk, onErr) => Promise.resolve(resultado).then(onOk, onErr);
  return q;
}

beforeEach(() => {
  for (const m of [mockFrom, mockRpc, mockSignUp, mockResend, mockVerifyOtp, mockUpdateUser, mockRemoveChannel, mockRealtime.connect, mockRealtime.isConnected]) m.mockReset();
  mockRealtime.isConnected.mockReturnValue(true);
  mockCanal.on.mockReset().mockImplementation(() => mockCanal);
  mockCanal.subscribe.mockReset().mockImplementation(() => mockCanal);
});

describe('signUp (passo 1)', () => {
  it('manda e-mail normalizado, senha e os metadados que o gatilho copia para profiles', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'u', identities: [{ id: 'i' }] }, session: null }, error: null });
    const r = await new SupabaseProvider().signUp({ nome: '  Ana   Souza ', email: ' Ana.Souza@Gmail.com ', senha: 'segredo123' });
    expect(r).toBe('confirmar');
    const arg = mockSignUp.mock.calls[0][0];
    expect(arg.email).toBe('ana.souza@gmail.com');
    expect(arg.password).toBe('segredo123');
    expect(arg.options.data).toEqual({ buyer_name: 'Ana Souza', newsletter: false, terms_accepted_at: expect.any(String) });
    expect(Number.isNaN(Date.parse(arg.options.data.terms_accepted_at))).toBe(false);
    expect(arg.options.emailRedirectTo).toBe(`${SITE_URL}/confirmar-email`);
  });

  it('projeto sem confirmação de e-mail: a sessão já vem e o resultado é "sessao"', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'u', identities: [{}] }, session: { access_token: 'x' } }, error: null });
    expect(await new SupabaseProvider().signUp({ nome: 'Ana', email: 'a@b.co', senha: '12345678' })).toBe('sessao');
  });

  it('e-mail já confirmado (Supabase responde sem identidades): EmailJaCadastrado', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'u', identities: [] }, session: null }, error: null });
    await expect(new SupabaseProvider().signUp({ nome: 'Ana', email: 'a@b.co', senha: '12345678' })).rejects.toMatchObject({ name: 'EmailJaCadastrado' });
  });

  it('"User already registered" também é EmailJaCadastrado', async () => {
    mockSignUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'User already registered', code: 'user_already_exists' } });
    const e = await new SupabaseProvider().signUp({ nome: 'Ana', email: 'a@b.co', senha: '12345678' }).catch((x: unknown) => x);
    expect(ehErro(e, 'EmailJaCadastrado')).toBe(true);
  });

  it('limite de envio vira frase em português', async () => {
    mockSignUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'email rate limit exceeded' } });
    await expect(new SupabaseProvider().signUp({ nome: 'Ana', email: 'a@b.co', senha: '12345678' })).rejects.toThrow('Muitos e-mails em pouco tempo. Aguarde alguns minutos e tente de novo.');
  });
});

describe('reenviarCodigo', () => {
  it('reenvia o e-mail do cadastro (resend tipo signup)', async () => {
    mockResend.mockResolvedValue({ error: null });
    await new SupabaseProvider().reenviarCodigo(' Ana@B.co ');
    expect(mockResend).toHaveBeenCalledWith({ type: 'signup', email: 'ana@b.co', options: { emailRedirectTo: `${SITE_URL}/confirmar-email` } });
  });

  it('intervalo mínimo entre envios: diz quantos segundos esperar', async () => {
    mockResend.mockResolvedValue({ error: { message: 'For security purposes, you can only request this after 42 seconds.' } });
    await expect(new SupabaseProvider().reenviarCodigo('a@b.co')).rejects.toThrow('Aguarde 42 segundos para pedir outro e-mail.');
  });
});

describe('confirmarCodigo (passo 2)', () => {
  it('confirmar_codigo → verifyOtp com token_hash tipo email → grava a senha do passo 1', async () => {
    mockRpc.mockResolvedValue({ data: 'hash-do-cadastro', error: null });
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: 'user-9', email: 'ana@b.co' }, session: {} }, error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
    const u = await new SupabaseProvider().confirmarCodigo('Ana@B.co', '4821', 'segredo123');
    expect(mockRpc).toHaveBeenCalledWith('confirmar_codigo', { p_email: 'ana@b.co', p_codigo: '4821' });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-do-cadastro', type: 'email' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'segredo123' });
    expect(u).toEqual({ id: 'user-9', email: 'ana@b.co' });
  });

  it('código errado (a função devolve null): CodigoIncorreto, sem abrir sessão', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(new SupabaseProvider().confirmarCodigo('a@b.co', '0000')).rejects.toMatchObject({ name: 'CodigoIncorreto' });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('10 erros em 24 h (P0429): CodigoBloqueado', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'confirmar_codigo: muitas tentativas', code: 'P0429' } });
    await expect(new SupabaseProvider().confirmarCodigo('a@b.co', '1111')).rejects.toMatchObject({ name: 'CodigoBloqueado' });
  });

  it('a senha que não regrava ("mesma senha" ou outra falha) não desfaz a conta confirmada', async () => {
    mockRpc.mockResolvedValue({ data: 'h', error: null });
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: 'u', email: 'a@b.co' } }, error: null });
    mockUpdateUser.mockResolvedValue({ error: { message: 'New password should be different', code: 'same_password' } });
    await expect(new SupabaseProvider().confirmarCodigo('a@b.co', '1234', 'segredo123')).resolves.toEqual({ id: 'u', email: 'a@b.co' });
  });
});

describe('completarCadastro (passo 3)', () => {
  it('chama complete_beta_registration com TODOS os argumentos, mantendo a newsletter escolhida', async () => {
    mockFrom.mockReturnValue(consulta({ data: { newsletter: true }, error: null }));
    mockRpc.mockResolvedValue({ data: {}, error: null });
    await new SupabaseProvider().completarCadastro({ userName: '  Carlos  ', relation: 'conjuge', condition: 'ela' });
    expect(mockRpc).toHaveBeenCalledWith('complete_beta_registration', {
      p_phone: null,
      p_user_name: 'Carlos',
      p_relation: 'conjuge',
      p_condition: 'ela',
      p_os: 'nao-sei',
      p_document: null,
      p_wants_caregiver_app: true,
      p_feedback_consent: false,
      p_how_found: null,
      p_newsletter: true,
      p_prescriber_name: null,
      p_prescriber_role: null,
    });
  });

  it('sem condição escolhida vai "prefiro-nao"', async () => {
    mockFrom.mockReturnValue(consulta({ data: null, error: null }));
    mockRpc.mockResolvedValue({ data: {}, error: null });
    await new SupabaseProvider().completarCadastro({ userName: 'Zé', relation: 'pai-mae', condition: null });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_condition: 'prefiro-nao', p_newsletter: false });
  });

  it('beta fechada ou vagas esgotadas (P0001): CadastroFechado com a frase do banco', async () => {
    mockFrom.mockReturnValue(consulta({ data: null, error: null }));
    mockRpc.mockResolvedValue({ data: null, error: { message: 'As vagas da beta acabaram. Deixe seu contato pelo site e avisamos quando abrir de novo.', code: 'P0001' } });
    const e = await new SupabaseProvider().completarCadastro({ userName: 'Zé', relation: 'outro' }).catch((x: unknown) => x);
    expect(ehErro(e, 'CadastroFechado')).toBe(true);
    expect((e as Error).message).toMatch(/As vagas da beta acabaram/);
  });
});

describe('atualizarPerfil e atualizarPaciente', () => {
  it('perfil: grava só nome e celular (dígitos), na linha da própria conta', async () => {
    const q = consulta({ data: { id: 'user-1', buyer_name: 'Ana Souza', email: 'ana@exemplo.com.br', phone: '11987654321' }, error: null });
    mockFrom.mockReturnValue(q);
    const p = await new SupabaseProvider().atualizarPerfil({ buyer_name: ' Ana  Souza ', phone: '(11) 9 8765-4321' });
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(q.update).toHaveBeenCalledWith({ buyer_name: 'Ana Souza', phone: '11987654321' });
    expect(q.eq).toHaveBeenCalledWith('id', 'user-1');
    expect(p.phone).toBe('11987654321');
  });

  it('celular com tamanho errado não chega ao banco', async () => {
    await expect(new SupabaseProvider().atualizarPerfil({ phone: '1234' })).rejects.toThrow('Use DDD e número: 10 ou 11 dígitos.');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(celularValido('1134567890')).toBe(true);
    expect(celularValido('113456789012')).toBe(false);
  });

  it('celular vazio apaga (null)', async () => {
    const q = consulta({ data: { id: 'user-1', buyer_name: 'Ana', email: 'a', phone: null }, error: null });
    mockFrom.mockReturnValue(q);
    await new SupabaseProvider().atualizarPerfil({ phone: '' });
    expect(q.update).toHaveBeenCalledWith({ phone: null });
  });

  it('pessoa: nome, relação e condição em beneficiaries; RLS negando (nenhuma linha) vira erro', async () => {
    const q = consulta({ data: { id: 'b1', user_name: 'Carlos', relation: 'conjuge', condition: 'avc' }, error: null });
    mockFrom.mockReturnValue(q);
    const b = await new SupabaseProvider().atualizarPaciente('b1', { user_name: ' Carlos ', condition: 'avc' });
    expect(mockFrom).toHaveBeenCalledWith('beneficiaries');
    expect(q.update).toHaveBeenCalledWith({ user_name: 'Carlos', condition: 'avc' });
    expect(q.eq).toHaveBeenCalledWith('id', 'b1');
    expect(b.condition).toBe('avc');

    mockFrom.mockReturnValue(consulta({ data: null, error: null }));
    await expect(new SupabaseProvider().atualizarPaciente('b2', { relation: 'outro' })).rejects.toThrow(/não está acessível/);
  });

  it('nome da pessoa com menos de 2 letras não chega ao banco', async () => {
    await expect(new SupabaseProvider().atualizarPaciente('b1', { user_name: 'A' })).rejects.toThrow('O nome precisa ter pelo menos 2 letras.');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('tempo real', () => {
  it('cada estado do canal sobe por onStatus; SUBSCRIBED também chama onSubscribed', () => {
    const onStatus = jest.fn();
    const onSubscribed = jest.fn();
    new SupabaseProvider().subscribe('b1', { onStatus, onSubscribed });
    const cb = mockCanal.subscribe.mock.calls[0][0] as (s: string) => void;
    cb('CHANNEL_ERROR');
    cb('SUBSCRIBED');
    expect(onStatus.mock.calls.map((c) => c[0])).toEqual(['CHANNEL_ERROR', 'SUBSCRIBED']);
    expect(onSubscribed).toHaveBeenCalledTimes(1);
  });

  it('reconectarTempoReal só reabre o WebSocket quando ele caiu', () => {
    const p = new SupabaseProvider();
    p.reconectarTempoReal();
    expect(mockRealtime.connect).not.toHaveBeenCalled();
    mockRealtime.isConnected.mockReturnValue(false);
    p.reconectarTempoReal();
    expect(mockRealtime.connect).toHaveBeenCalledTimes(1);
  });
});

describe('traduzErroDoCadastro', () => {
  it('senha curta, e-mail inválido e rede em português', () => {
    expect(traduzErroDoCadastro('Password should be at least 8 characters')).toBe('A senha precisa ter pelo menos 8 caracteres.');
    expect(traduzErroDoCadastro('Unable to validate email address: invalid format')).toBe('Confira o e-mail digitado.');
    expect(traduzErroDoCadastro('TypeError: Network request failed')).toBe('Sem internet no momento. Confira a conexão e tente de novo.');
  });
});
