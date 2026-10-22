import { describe, it, expect, vi, beforeEach } from 'vitest';

// Onde a voz guardada fica, vista do renderer (19/10/2026), e como uma
// mensagem toca — sempre por algum caminho, nunca muda em silêncio.

const tocarWav = vi.fn(async (_w: ArrayBuffer) => {});
vi.mock('../local', () => ({ tocarWav: (w: ArrayBuffer) => tocarWav(w) }));
const falar = vi.fn(async (_t: string, _o?: unknown) => ({ origem: 'sistema' as string, motivo: undefined as string | undefined }));
const pararFala = vi.fn();
vi.mock('../index', () => ({ falar: (t: string, o?: unknown) => falar(t, o), pararFala: () => pararFala() }));

const { armazemDoComputador, armazemDaVozGuardada, criarArmazemNaMemoria, gravacoesDoPerfil, _zerarArmazemDaMemoria } = await import('./armazem');
const { tocarMensagemGuardada } = await import('./tocar');
const { codificarWav } = await import('./wav');

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const TERMO = 'Concordo em gravar a minha própria voz nesta tela, guardada só neste computador.';
const wav = () => codificarWav(new Float32Array(800), 16000);
const pedido = (id = ID1, extra: Record<string, unknown> = {}) => ({
  id, texto: 'Estou com dor.', wav: wav(), duracaoS: 1, qualidade: 'boa' as const, perfilId: 'p1', ...extra,
});

describe('armazém na memória (fora do app instalado)', () => {
  it('diz que é na memória, exige o termo e guarda, lê, troca e apaga', async () => {
    const a = criarArmazemNaMemoria();
    expect(a.onde).toBe('memoria');
    expect(a.usarComoReferencia).toBeNull();
    expect((await a.salvar(pedido())).ok).toBe(false);
    expect((await a.consentir({ texto: 'ok', aceitoEm: 'x', perfilId: null })).ok).toBe(false);
    expect((await a.consentir({ texto: TERMO, aceitoEm: 'agora', perfilId: 'p1' })).ok).toBe(true);
    expect((await a.salvar(pedido())).ok).toBe(true);
    expect((await a.salvar(pedido(ID2, { substitui: ID1 }))).ok).toBe(true);
    const l = await a.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id)).toEqual([ID2]);
    const lido = await a.ler(ID2);
    expect(lido.ok && lido.wav.byteLength).toBe(wav().byteLength);
    await a.apagar(ID2);
    expect((await a.ler(ID2)).ok).toBe(false);
  });

  it('é o mesmo em todas as telas (navegar não perde a gravação)', async () => {
    _zerarArmazemDaMemoria();
    const a = armazemDaVozGuardada();
    await a.consentir({ texto: TERMO, aceitoEm: 'agora', perfilId: 'p1' });
    await a.salvar(pedido());
    const l = await armazemDaVozGuardada().listar();
    expect(l.ok && l.gravacoes).toHaveLength(1);
  });

  // Revisão de segurança de 20/10/2026: o termo valia para o computador inteiro.
  it('o termo é de cada paciente: o de um perfil não deixa gravar a voz de outro, e o aceite de um não apaga o do outro', async () => {
    const a = criarArmazemNaMemoria();
    expect((await a.consentir({ texto: TERMO, aceitoEm: 'às 9h', perfilId: 'p1' })).ok).toBe(true);
    expect((await a.salvar(pedido(ID1, { perfilId: 'p2' }))).ok).toBe(false);
    expect((await a.salvar(pedido(ID1, { perfilId: null }))).ok).toBe(false);
    expect((await a.salvar(pedido(ID1))).ok).toBe(true);
    expect((await a.consentir({ texto: TERMO, aceitoEm: 'às 10h', perfilId: 'p2' })).ok).toBe(true);
    expect((await a.salvar(pedido(ID2, { perfilId: 'p2' }))).ok).toBe(true);
    const l = await a.listar();
    expect(l.ok && l.consentimentos.map((c) => [c.perfilId, c.aceitoEm])).toEqual([['p1', 'às 9h'], ['p2', 'às 10h']]);
  });

  it('cada paciente vê as dele (e as sem perfil), da mais nova para a mais antiga', () => {
    const g = (id: string, perfilId: string | null, criadaEm: string) => ({ id, texto: id, criadaEm, duracaoS: 1, qualidade: 'boa' as const, perfilId, bytes: 1 });
    const lista = [g('a', 'p1', '2026-10-01'), g('b', 'p2', '2026-10-02'), g('c', null, '2026-10-03'), g('d', 'p1', '2026-10-04')];
    expect(gravacoesDoPerfil(lista, 'p1').map((x) => x.id)).toEqual(['d', 'c', 'a']);
  });
});

describe('armazém do app instalado', () => {
  it('um IPC que rejeita vira resposta com erro, não exceção na tela', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ponte = {
      listar: vi.fn(async () => { throw new Error('janela recarregando'); }),
      consentir: vi.fn(), salvar: vi.fn(), ler: vi.fn(), apagar: vi.fn(),
      usarComoReferencia: vi.fn(async () => ({ ok: true as const, duracaoS: 14, qualidade: 'boa' as const, avisos: [] })),
    };
    const a = armazemDoComputador(ponte as never);
    expect(a.onde).toBe('computador');
    const r = await a.listar();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/janela recarregando/);
    expect((await a.usarComoReferencia!(ID1, { texto: TERMO, aceitoEm: 'x', perfilId: null })).ok).toBe(true);
    aviso.mockRestore();
  });
});

describe('tocar uma mensagem guardada', () => {
  beforeEach(() => {
    tocarWav.mockReset();
    tocarWav.mockImplementation(async () => {});
    falar.mockClear();
    pararFala.mockClear();
  });

  it('toca a gravação, pelo canal da voz (para o que estava falando antes)', async () => {
    const a = criarArmazemNaMemoria();
    await a.consentir({ texto: TERMO, aceitoEm: 'agora', perfilId: 'p1' });
    await a.salvar(pedido());
    expect(await tocarMensagemGuardada({ id: ID1, texto: 'Estou com dor.' }, a)).toEqual({ como: 'gravacao' });
    expect(pararFala).toHaveBeenCalled();
    expect(tocarWav).toHaveBeenCalledTimes(1);
    expect(falar).not.toHaveBeenCalled();
  });

  it('gravação que sumiu: fala o texto com a voz do computador, e diz que foi assim', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = criarArmazemNaMemoria();
    const r = await tocarMensagemGuardada({ id: ID2, texto: 'Bom dia!' }, a);
    expect(r.como).toBe('voz_do_computador');
    expect(falar).toHaveBeenCalledWith('Bom dia!', expect.anything());
    aviso.mockRestore();
  });

  it('nem a voz do computador saiu: "nada", para a tela avisar', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    falar.mockImplementationOnce(async () => ({ origem: 'nenhuma', motivo: 'sem_voz' }));
    const r = await tocarMensagemGuardada({ id: ID2, texto: 'Bom dia!' }, criarArmazemNaMemoria());
    expect(r).toMatchObject({ como: 'nada' });
    aviso.mockRestore();
  });

  it('duas escolhas seguidas: só a última toca', async () => {
    const a = criarArmazemNaMemoria();
    await a.consentir({ texto: TERMO, aceitoEm: 'agora', perfilId: 'p1' });
    await a.salvar(pedido(ID1));
    await a.salvar(pedido(ID2, { texto: 'Sim.' }));
    const [r1, r2] = await Promise.all([
      tocarMensagemGuardada({ id: ID1, texto: 'Estou com dor.' }, a),
      tocarMensagemGuardada({ id: ID2, texto: 'Sim.' }, a),
    ]);
    expect(r1).toEqual({ como: 'nada', motivo: 'substituida' });
    expect(r2).toEqual({ como: 'gravacao' });
    expect(tocarWav).toHaveBeenCalledTimes(1);
  });
});
