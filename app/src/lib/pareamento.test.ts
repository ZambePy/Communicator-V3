/**
 * Entrar pelo código QR do computador (19/10/2026): o código vai para a Edge
 * Function parear-celular, o token devolvido abre a sessão, e o computador é
 * avisado. Cliente do Supabase falso, com a mesma forma do supabase-js.
 */
import { AuthApiError, AuthRetryableFetchError, FunctionsFetchError, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { codigoDoLink, entrarComCodigo, MENSAGENS } from './pareamento';

const CODIGO = 'Qx7_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB';

function clienteFalso(opcoes: {
  invoke?: () => Promise<{ data: unknown; error: unknown }>;
  verifyOtp?: () => Promise<{ data: unknown; error: unknown }>;
  rpc?: () => Promise<{ data: unknown; error: unknown }>;
} = {}) {
  const invoke = jest.fn(
    opcoes.invoke ??
      (async () => ({ data: { ok: true, token_hash: 'hash-do-link', tipo: 'magiclink', pareamento_id: 'par-1', paciente: ' Maria ' }, error: null })),
  );
  const verifyOtp = jest.fn(opcoes.verifyOtp ?? (async () => ({ data: { session: {} }, error: null })));
  const rpc = jest.fn(opcoes.rpc ?? (async () => ({ data: true, error: null })));
  const sb = { functions: { invoke }, auth: { verifyOtp }, rpc } as unknown as SupabaseClient;
  return { sb, invoke, verifyOtp, rpc };
}

const httpErro = (status: number, corpo: unknown) => new FunctionsHttpError({ status, json: async () => corpo });

describe('código do link', () => {
  it('aceita só o formato que o computador gera (43 caracteres base64url)', () => {
    expect(codigoDoLink(CODIGO)).toBe(CODIGO);
    expect(codigoDoLink([CODIGO, 'outro'])).toBe(CODIGO);
    expect(codigoDoLink('curto')).toBeNull();
    expect(codigoDoLink(`${CODIGO}x`)).toBeNull();
    expect(codigoDoLink(`${CODIGO.slice(0, 42)}+`)).toBeNull();
    expect(codigoDoLink(undefined)).toBeNull();
  });
});

describe('entrarComCodigo', () => {
  it('troca o código pelo token, abre a sessão com magiclink e avisa o computador', async () => {
    const { sb, invoke, verifyOtp, rpc } = clienteFalso();
    expect(await entrarComCodigo(sb, CODIGO)).toEqual({ ok: true, paciente: 'Maria' });
    expect(invoke).toHaveBeenCalledWith('parear-celular', { body: { codigo: CODIGO } });
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash-do-link' });
    expect(rpc).toHaveBeenCalledWith('confirmar_celular_conectado', { p_pareamento: 'par-1' });
    // A ordem importa: a confirmação só depois de a sessão abrir.
    expect(verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
  });

  it('código recusado (inexistente, vencido, usado): a mensagem de gerar outro, sem tentar abrir sessão', async () => {
    const { sb, verifyOtp } = clienteFalso({ invoke: async () => ({ data: null, error: httpErro(400, { error: 'codigo_invalido' }) }) });
    expect(await entrarComCodigo(sb, CODIGO)).toEqual({ ok: false, falha: 'codigo' });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(MENSAGENS.codigo).toMatch(/Gerar outro/);
  });

  it('limite de tentativas, servidor fora e sem rede: cada um com o seu texto', async () => {
    const limite = clienteFalso({ invoke: async () => ({ data: null, error: httpErro(429, { error: 'muitas_tentativas' }) }) });
    expect(await entrarComCodigo(limite.sb, CODIGO)).toEqual({ ok: false, falha: 'limite' });
    const fora = clienteFalso({ invoke: async () => ({ data: null, error: httpErro(503, { error: 'servico_indisponivel' }) }) });
    expect(await entrarComCodigo(fora.sb, CODIGO)).toEqual({ ok: false, falha: 'servico' });
    const semRede = clienteFalso({ invoke: async () => ({ data: null, error: new FunctionsFetchError(new TypeError('Network request failed')) }) });
    expect(await entrarComCodigo(semRede.sb, CODIGO)).toEqual({ ok: false, falha: 'rede' });
    const lancou = clienteFalso({ invoke: async () => { throw new TypeError('Network request failed'); } });
    expect(await entrarComCodigo(lancou.sb, CODIGO)).toEqual({ ok: false, falha: 'rede' });
  });

  it('resposta sem token não abre nada', async () => {
    const { sb, verifyOtp } = clienteFalso({ invoke: async () => ({ data: { ok: true }, error: null }) });
    expect(await entrarComCodigo(sb, CODIGO)).toEqual({ ok: false, falha: 'servico' });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('link vencido no Auth: o código também não vale mais', async () => {
    const { sb, rpc } = clienteFalso({
      verifyOtp: async () => ({ data: null, error: new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired') }),
    });
    expect(await entrarComCodigo(sb, CODIGO)).toEqual({ ok: false, falha: 'codigo' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('tropeço de rede ao abrir a sessão: tenta de novo uma vez com o mesmo token', async () => {
    jest.useFakeTimers();
    try {
      let n = 0;
      const { sb, verifyOtp } = clienteFalso({
        verifyOtp: async () => (++n === 1 ? { data: null, error: new AuthRetryableFetchError('Failed to fetch', 0) } : { data: {}, error: null }),
      });
      const p = entrarComCodigo(sb, CODIGO);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(await p).toEqual({ ok: true, paciente: 'Maria' });
      expect(verifyOtp).toHaveBeenCalledTimes(2);
      expect(verifyOtp.mock.calls[1]).toEqual([{ type: 'magiclink', token_hash: 'hash-do-link' }]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('o aviso ao computador falhou: o celular entrou do mesmo jeito (e o log não tem o código)', async () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sb } = clienteFalso({ rpc: async () => ({ data: null, error: { message: 'Failed to fetch' } }) });
    expect(await entrarComCodigo(sb, CODIGO)).toEqual({ ok: true, paciente: 'Maria' });
    expect(aviso).toHaveBeenCalledTimes(1);
    for (const chamada of aviso.mock.calls) expect(JSON.stringify(chamada)).not.toContain(CODIGO);
    aviso.mockRestore();
  });

  it('código fora do formato nem sai do celular', async () => {
    const { sb, invoke } = clienteFalso();
    expect(await entrarComCodigo(sb, 'curto')).toEqual({ ok: false, falha: 'codigo' });
    expect(invoke).not.toHaveBeenCalled();
  });
});
