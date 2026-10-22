import { describe, expect, it, vi } from 'vitest';
import {
  cancelarCodigo,
  consultarCodigo,
  ErroDoPareamento,
  FORMATO_DO_CODIGO,
  horaCurta,
  mensagemDaFalha,
  pedirCodigo,
  tempoRestante,
  urlDoPareamento,
  type OpcoesDoPareamento,
} from './pareamento';
// Os módulos puros das Edge Functions: o que o servidor produz tem de ser o
// que o computador aceita (o mesmo cuidado de desktopSync.test.ts).
import { estadoDoPareamento } from '../../../supabase/functions/desktop-sync/pareamento';
import { FORMATO_DO_CODIGO as FORMATO_DO_SERVIDOR, gerarCodigo } from '../../../supabase/functions/desktop-sync/codigoDoCelular';

const URL_FN = 'https://abc.supabase.co/functions/v1/desktop-sync';
const CODIGO = 'Qx7_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB';

function respostaHttp(status: number, corpo: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as unknown as Response;
}

function opcoes(fetchImpl: ReturnType<typeof vi.fn>): OpcoesDoPareamento {
  return { chave: 'chave-do-pc', url: URL_FN, anonKey: 'anon-123', fetchImpl: fetchImpl as unknown as typeof fetch };
}

async function falha(p: Promise<unknown>): Promise<ErroDoPareamento> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ErroDoPareamento);
    return e as ErroDoPareamento;
  }
  throw new Error('esperava falhar');
}

describe('cliente do pareamento do celular (desktop-sync)', () => {
  it('pede o código com a chave do computador e o JWT anônimo, e devolve o que o QR precisa', async () => {
    const fetchImpl = vi.fn(async () => respostaHttp(200, { ok: true, id: 'id-1', codigo: CODIGO, expira_em: 'x', restante_s: 179, validade_s: 180 }));
    const c = await pedirCodigo(opcoes(fetchImpl));
    expect(c).toEqual({ id: 'id-1', codigo: CODIGO, restanteS: 179, validadeS: 180 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_FN);
    const h = init.headers as Record<string, string>;
    expect(h['x-device-key']).toBe('chave-do-pc');
    expect(h.authorization).toBe('Bearer anon-123');
    expect(JSON.parse(String(init.body))).toEqual({ action: 'pairing.create' });
  });

  it('resposta sem código válido não vira QR: falha visível', async () => {
    for (const corpo of [{ ok: true, id: 'id-1' }, { ok: true, id: 'id-1', codigo: 'curto' }, { ok: true, codigo: CODIGO }]) {
      const e = await falha(pedirCodigo(opcoes(vi.fn(async () => respostaHttp(200, corpo)))));
      expect(e.falha).toBe('servico');
    }
  });

  it('cada recusa do servidor vira o motivo certo', async () => {
    const com = (status: number, corpo: unknown) => falha(pedirCodigo(opcoes(vi.fn(async () => respostaHttp(status, corpo))))) ;
    const limite = await com(429, { error: 'limite', tente_em: '2026-10-19T17:10:00Z' });
    expect([limite.falha, limite.tenteEm]).toEqual(['limite', '2026-10-19T17:10:00Z']);
    expect((await com(409, { error: 'email_nao_confirmado' })).falha).toBe('email_nao_confirmado');
    expect((await com(403, { error: 'device_revoked' })).falha).toBe('computador_desvinculado');
    expect((await com(401, { error: 'unauthorized' })).falha).toBe('computador_desvinculado');
    // 401 do gateway (função publicada com verify_jwt): implantação, não vínculo.
    expect((await com(401, { msg: 'Missing authorization header' })).falha).toBe('servico');
    expect((await com(503, { error: 'servico_indisponivel' })).falha).toBe('servico');
    const semRede = await falha(pedirCodigo(opcoes(vi.fn(async () => { throw new TypeError('Failed to fetch'); }))));
    expect(semRede.falha).toBe('sem_conexao');
  });

  it('sem endereço da função (nuvem não configurada) não chama nada', async () => {
    const fetchImpl = vi.fn();
    const e = await falha(pedirCodigo({ chave: 'k', url: '', fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(e.falha).toBe('servico');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('consulta: traduz o estado e as horas; estado desconhecido não passa por "aguardando"', async () => {
    const fetchImpl = vi.fn(async () => respostaHttp(200, { ok: true, estado: 'conectado', usado_em: 'u', conectado_em: 'c' }));
    expect(await consultarCodigo(opcoes(fetchImpl), 'id-1')).toEqual({ estado: 'conectado', usadoEm: 'u', conectadoEm: 'c' });
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ action: 'pairing.status', id: 'id-1' });
    const estranho = vi.fn(async () => respostaHttp(200, { ok: true, estado: 'qualquer' }));
    expect((await consultarCodigo(opcoes(estranho), 'id-1')).estado).toBe('desconhecido');
  });

  it('todo estado que a desktop-sync produz é entendido aqui', async () => {
    const agora = Date.parse('2026-10-19T17:00:00Z');
    const base = { id: 'x', expira_em: '2026-10-19T17:02:00Z', usado_em: null, conectado_em: null, cancelado_em: null };
    const linhas = [
      base,
      { ...base, expira_em: '2026-10-19T16:00:00Z' },
      { ...base, usado_em: '2026-10-19T16:59:00Z' },
      { ...base, usado_em: '2026-10-19T16:59:00Z', conectado_em: '2026-10-19T16:59:05Z' },
      { ...base, cancelado_em: '2026-10-19T16:59:00Z' },
      null,
    ];
    const vistos = new Set<string>();
    for (const l of linhas) {
      const doServidor = estadoDoPareamento(l, agora);
      const fetchImpl = vi.fn(async () => respostaHttp(200, { ok: true, ...doServidor }));
      const aqui = await consultarCodigo(opcoes(fetchImpl), 'x');
      expect(aqui.estado).toBe(doServidor.estado);
      vistos.add(aqui.estado);
    }
    expect([...vistos].sort()).toEqual(['aguardando', 'cancelado', 'conectado', 'desconhecido', 'usado', 'vencido']);
  });

  it('o prazo vale também para o CORPO da resposta: cabeçalho que chega e corpo que nunca termina vira "sem conexão", e não uma consulta parada para sempre (relato de 22/10/2026)', async () => {
    // O `fetch` de verdade rejeita a leitura do corpo quando o sinal aborta; o
    // fake faz o mesmo. Antes, o prazo era desarmado assim que os cabeçalhos
    // chegavam e a consulta do QR (e o "venceu" no fim dos 3 minutos) esperava
    // para sempre.
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, rejeitar) => {
          init?.signal?.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError')));
        }),
    }) as unknown as Response);
    const consulta = falha(consultarCodigo({ ...opcoes(fetchImpl as unknown as ReturnType<typeof vi.fn>), timeoutMs: 30 }, 'id-1'));
    const vencida = new Promise<'parada'>((r) => setTimeout(() => r('parada'), 1_000));
    const r = await Promise.race([consulta, vencida]);
    expect(r).not.toBe('parada');
    expect((r as ErroDoPareamento).falha).toBe('sem_conexao');
  });

  it('cancelar nunca lança, nem sem rede', async () => {
    const ok = vi.fn(async () => respostaHttp(200, { ok: true }));
    expect(await cancelarCodigo(opcoes(ok), 'id-1')).toBe(true);
    expect(JSON.parse(String((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ action: 'pairing.cancel', id: 'id-1' });
    expect(await cancelarCodigo(opcoes(vi.fn(async () => { throw new TypeError('offline'); })), 'id-1')).toBe(false);
  });
});

describe('endereço do QR', () => {
  it('leva o código no FRAGMENTO (#t=), que não sai do celular nem entra em log do servidor', () => {
    expect(urlDoPareamento('https://irisflow.ia.br', CODIGO)).toBe(`https://irisflow.ia.br/parear#t=${CODIGO}`);
    expect(urlDoPareamento('https://irisflow.ia.br//', CODIGO)).toBe(`https://irisflow.ia.br/parear#t=${CODIGO}`);
    expect(urlDoPareamento('https://irisflow.ia.br', CODIGO)).not.toContain('?');
  });

  it('nada fora do formato entra no QR', () => {
    expect(() => urlDoPareamento('https://irisflow.ia.br', 'curto')).toThrow();
    expect(() => urlDoPareamento('https://irisflow.ia.br', `${CODIGO.slice(0, 40)}&x=`)).toThrow();
  });

  it('o código que o servidor sorteia passa no formato daqui (e o formato é o mesmo)', () => {
    expect(FORMATO_DO_CODIGO.source).toBe(FORMATO_DO_SERVIDOR.source);
    for (let i = 0; i < 20; i++) {
      const c = gerarCodigo();
      expect(FORMATO_DO_CODIGO.test(c)).toBe(true);
      expect(urlDoPareamento('https://irisflow.ia.br', c)).toBe(`https://irisflow.ia.br/parear#t=${c}`);
    }
  });
});

describe('textos', () => {
  it('hora curta e tempo restante', () => {
    const iso = new Date(2026, 9, 19, 14, 32).toISOString();
    expect(horaCurta(iso)).toBe('14:32');
    expect(horaCurta(undefined)).toBe('');
    expect(horaCurta('não é data')).toBe('');
    expect(tempoRestante(180)).toBe('3:00');
    expect(tempoRestante(161)).toBe('2:41');
    expect(tempoRestante(9)).toBe('0:09');
    expect(tempoRestante(-5)).toBe('0:00');
  });

  it('cada falha diz o que fazer, sem jargão', () => {
    const iso = new Date(2026, 9, 19, 17, 10).toISOString();
    expect(mensagemDaFalha('limite', iso)).toContain('a partir das 17:10');
    expect(mensagemDaFalha('limite')).toContain('daqui a alguns minutos');
    expect(mensagemDaFalha('email_nao_confirmado')).toMatch(/confirmado/);
    expect(mensagemDaFalha('computador_desvinculado')).toMatch(/Entre de novo/);
    expect(mensagemDaFalha('sem_conexao')).toMatch(/internet/);
    for (const f of ['limite', 'email_nao_confirmado', 'computador_desvinculado', 'sem_conexao', 'servico'] as const) {
      expect(mensagemDaFalha(f)).not.toMatch(/HTTP|429|409|403|token|erro de/i);
    }
  });
});
