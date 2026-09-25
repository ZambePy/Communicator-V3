import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DesktopSync, impressaoDaChave } from './desktopSync';
// Módulo puro da Edge Function: o que o desktop carimba tem de ser o que ela aceita.
import { horarioDoEvento } from '../../../supabase/functions/desktop-sync/horario';

// Fora do Electron o cofre cai no localStorage — é o que os testes exercitam.
const URL_FN = 'https://abc.supabase.co/functions/v1/desktop-sync';

function respostaHttp(status: number, corpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response;
}

describe('DesktopSync — envio, fila offline e credencial', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('envia com a chave do computador no header, o horário do evento, e devolve o corpo', async () => {
    const fetchImpl = vi.fn(async () => respostaHttp(200, { ok: true, id: 'm1' }));
    const agora = () => Date.parse('2026-09-23T12:00:00Z');
    const s = new DesktopSync({ url: URL_FN, chave: () => 'chave-123', fetchImpl, agora });
    const r = await s.enviar({ action: 'message.send', text: 'oi', kind: 'texto' });
    expect(r).toEqual({ ok: true, id: 'm1' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_FN);
    expect((init.headers as Record<string, string>)['x-device-key']).toBe('chave-123');
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'message.send', text: 'oi', kind: 'texto',
      occurred_at: '2026-09-23T12:00:00.000Z', sent_at: '2026-09-23T12:00:00.000Z',
    });
  });

  it('sem rede, mensagem e socorro vão para a fila; heartbeat não', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl });
    await s.enviar({ action: 'message.send', text: 'água', kind: 'frase' });
    await s.enviar({ action: 'help.create', kind: 'emergencia', message: 'dor' });
    await s.enviar({ action: 'heartbeat', app_version: '1', camera_ok: true, tracker_ok: true, calibrated: true });
    expect(s.tamanhoDaFila).toBe(2);
    expect(localStorage.getItem('irisflow.fila')).not.toBeNull();
  });

  it('quando a rede volta, drena na ordem e limpa a fila', async () => {
    let online = false;
    const enviados: string[] = [];
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      if (!online) throw new TypeError('Failed to fetch');
      enviados.push(JSON.parse(String(init?.body)).action);
      return respostaHttp(200, { ok: true });
    });
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    await s.enviar({ action: 'message.send', text: '1', kind: 'texto' });
    await s.enviar({ action: 'help.create', kind: 'ajuda', message: '2' });
    online = true;
    const n = await s.drenar();
    expect(n).toBe(2);
    expect(enviados).toEqual(['message.send', 'help.create']);
    expect(s.tamanhoDaFila).toBe(0);
    expect(localStorage.getItem('irisflow.fila')).toBeNull();
  });

  it('a fila sobrevive a uma nova instância (reabrir o app)', async () => {
    const off = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const s1 = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: off });
    await s1.enviar({ action: 'message.send', text: 'antes de fechar', kind: 'texto' });

    const on = vi.fn(async () => respostaHttp(200, { ok: true }));
    const s2 = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: on });
    expect(await s2.drenar()).toBe(1);
    expect(on).toHaveBeenCalledTimes(1);
  });

  it('401/403 (computador desvinculado) avisa, NÃO enfileira e esvazia o que estava na fila', async () => {
    let online = false;
    const fetchImpl = vi.fn(async () => {
      if (!online) throw new TypeError('Failed to fetch');
      return respostaHttp(403, { error: 'device_revoked' });
    });
    const perdeu = vi.fn();
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl, aoPerderCredencial: perdeu });
    await s.enviar({ action: 'help.create', kind: 'emergencia', message: 'de antes' });
    expect(s.tamanhoDaFila).toBe(1);
    online = true;
    const r = await s.enviar({ action: 'message.send', text: 'x', kind: 'texto' });
    expect(r.error).toBe('device_revoked');
    expect(perdeu).toHaveBeenCalledTimes(1);
    expect(s.tamanhoDaFila).toBe(0);
    expect(localStorage.getItem('irisflow.fila')).toBeNull();
  });

  it('403 no meio da drenagem esvazia a fila e não a regrava no disco', async () => {
    let online = false;
    const fetchImpl = vi.fn(async () => {
      if (!online) throw new TypeError('Failed to fetch');
      return respostaHttp(403, { error: 'device_revoked' });
    });
    const perdeu = vi.fn();
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl, aoPerderCredencial: perdeu });
    await s.enviar({ action: 'message.send', text: '1', kind: 'texto' });
    await s.enviar({ action: 'help.create', kind: 'ajuda', message: '2' });
    online = true;
    expect(await s.drenar()).toBe(0);
    expect(perdeu).toHaveBeenCalledTimes(1);
    expect(s.tamanhoDaFila).toBe(0);
    expect(localStorage.getItem('irisflow.fila')).toBeNull();
  });

  it('400 (payload inválido) não enfileira — reenviar não resolve', async () => {
    const fetchImpl = vi.fn(async () => respostaHttp(400, { error: 'texto vazio' }));
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl });
    const r = await s.enviar({ action: 'message.send', text: '', kind: 'texto' });
    expect(r.ok).toBe(false);
    expect(s.tamanhoDaFila).toBe(0);
  });

  it('manda o JWT anônimo junto (o gateway do Supabase exige) e a chave do computador', async () => {
    const fetchImpl = vi.fn(async () => respostaHttp(200, { ok: true }));
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', anonKey: 'ANON', fetchImpl });
    await s.enviar({ action: 'settings.get' });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const h = init.headers as Record<string, string>;
    expect(h.apikey).toBe('ANON');
    expect(h.authorization).toBe('Bearer ANON');
    expect(h['x-device-key']).toBe('k');
  });

  it('um 401 do GATEWAY (função publicada com verify_jwt) não é perda de credencial: vai para a fila', async () => {
    const fetchImpl = vi.fn(async () => respostaHttp(401, { code: 401, message: 'Missing authorization header' }));
    const perdeu = vi.fn();
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl, aoPerderCredencial: perdeu });
    await s.enviar({ action: 'help.create', kind: 'emergencia', message: 'socorro' });
    expect(perdeu).not.toHaveBeenCalled();
    expect(s.tamanhoDaFila).toBe(1);
  });

  it('session.upsert não entra na fila (a resposta é o que importa)', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl });
    await s.enviar({ action: 'session.upsert', session: { status: 'active' } });
    expect(s.tamanhoDaFila).toBe(0);
  });

  it('limparFila descarta o pendente e o que estava no cofre', async () => {
    const off = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: off });
    await s.enviar({ action: 'message.send', text: 'x', kind: 'texto' });
    await s.limparFila();
    expect(s.tamanhoDaFila).toBe(0);
    expect(localStorage.getItem('irisflow.fila')).toBeNull();
  });

  it('sem vínculo, nada é guardado: o próximo a vincular não recebe falas de ninguém', async () => {
    const fetchImpl = vi.fn(async () => respostaHttp(200, { ok: true }));
    let chave: string | null = null;
    const s = new DesktopSync({ url: URL_FN, chave: () => chave, fetchImpl });
    const r1 = await s.enviar({ action: 'help.create', kind: 'emergencia', message: 'socorro' });
    const r2 = await s.enviar({ action: 'message.send', text: 'estou com sede', kind: 'frase' });
    expect(r1).toEqual({ ok: false, error: 'sem_vinculo' });
    expect(r2).toEqual({ ok: false, error: 'sem_vinculo' });
    expect(s.tamanhoDaFila).toBe(0);
    expect(localStorage.getItem('irisflow.fila')).toBeNull();
    chave = 'vinculou-depois';
    expect(await s.drenar()).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sem nuvem configurada (sem URL da função), nada é guardado', async () => {
    const fetchImpl = vi.fn();
    const s = new DesktopSync({ url: '', chave: () => 'k', fetchImpl });
    const r = await s.enviar({ action: 'help.create', kind: 'emergencia', message: 'socorro' });
    expect(r).toEqual({ ok: false, error: 'sem_vinculo' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(s.tamanhoDaFila).toBe(0);
    expect(localStorage.getItem('irisflow.fila')).toBeNull();
  });

  it('socorro que esperou na fila sai com o horário em que aconteceu, não com o do reenvio', async () => {
    let relogio = Date.parse('2026-09-23T12:00:00Z');
    let online = false;
    const corpos: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      corpos.push(JSON.parse(String(init?.body)));
      if (!online) throw new TypeError('Failed to fetch');
      return respostaHttp(200, { ok: true });
    });
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: fetchImpl as unknown as typeof fetch, agora: () => relogio });
    await s.enviar({ action: 'help.create', kind: 'emergencia', message: 'dor' });
    expect(s._fila()[0].criadoEm).toBe('2026-09-23T12:00:00.000Z');
    // A fila guarda o horário do evento; o sent_at é de cada tentativa.
    expect(s._fila()[0].acao).toMatchObject({ occurred_at: '2026-09-23T12:00:00.000Z' });
    expect(s._fila()[0].acao).not.toHaveProperty('sent_at');
    relogio = Date.parse('2026-09-23T15:00:00Z'); // 3 h depois a rede volta
    online = true;
    expect(await s.drenar()).toBe(1);
    expect(corpos).toHaveLength(2);
    expect(corpos[0]).toMatchObject({ occurred_at: '2026-09-23T12:00:00.000Z', sent_at: '2026-09-23T12:00:00.000Z' });
    expect(corpos[1]).toEqual({
      action: 'help.create', id: corpos[0].id, kind: 'emergencia', message: 'dor',
      occurred_at: '2026-09-23T12:00:00.000Z', sent_at: '2026-09-23T15:00:00.000Z',
    });
    // O id do pedido nasce na primeira tentativa e é o MESMO no reenvio:
    // é o que impede a função de gravar um segundo socorro.
    expect(corpos[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // E a Edge Function grava esse horário (3 h de atraso) em vez de "agora".
    expect(horarioDoEvento(corpos[1].occurred_at, corpos[1].sent_at, new Date(relogio))).toBe('2026-09-23T12:00:00.000Z');
    expect(s.tamanhoDaFila).toBe(0);
  });

  it('relógio do computador 20 min atrasado: a hora gravada pela função continua certa', async () => {
    const ATRASO_DO_RELOGIO = 20 * 60_000;
    let servidor = Date.parse('2026-09-23T12:00:00Z');
    let online = false;
    const corpos: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      if (!online) throw new TypeError('Failed to fetch');
      corpos.push(JSON.parse(String(init?.body)));
      return respostaHttp(200, { ok: true });
    });
    const s = new DesktopSync({
      url: URL_FN, chave: () => 'k', fetchImpl: fetchImpl as unknown as typeof fetch,
      agora: () => servidor - ATRASO_DO_RELOGIO,
    });
    await s.enviar({ action: 'help.create', kind: 'emergencia', message: 'dor' }); // 12:00 de verdade
    servidor = Date.parse('2026-09-23T15:00:00Z');
    online = true;
    expect(await s.drenar()).toBe(1);
    expect(corpos[0].occurred_at).toBe('2026-09-23T11:40:00.000Z'); // relógio errado do PC
    expect(horarioDoEvento(corpos[0].occurred_at, corpos[0].sent_at, new Date(servidor))).toBe('2026-09-23T12:00:00.000Z');
  });

  it('a fila reaberta por uma nova instância mantém o horário original', async () => {
    const off = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const s1 = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: off, agora: () => Date.parse('2026-09-23T08:00:00Z') });
    await s1.enviar({ action: 'message.send', text: 'bom dia', kind: 'frase' });
    const on = vi.fn(async () => respostaHttp(200, { ok: true }));
    const s2 = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: on, agora: () => Date.parse('2026-09-23T10:00:00Z') });
    expect(await s2.drenar()).toBe(1);
    const [, init] = on.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ occurred_at: '2026-09-23T08:00:00.000Z', sent_at: '2026-09-23T10:00:00.000Z' });
  });

  it('heartbeat, abertura de sessão e consultas não levam occurred_at nem sent_at (não são eventos)', async () => {
    const fetchImpl = vi.fn(async () => respostaHttp(200, { ok: true }));
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl });
    await s.enviar({ action: 'heartbeat', app_version: '1', camera_ok: true, tracker_ok: true, calibrated: true });
    await s.enviar({ action: 'session.upsert', session: { status: 'active' } });
    await s.enviar({ action: 'settings.get' });
    await s.enviar({ action: 'messages.pending' });
    for (const c of fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(JSON.parse(String(c[1].body))).not.toHaveProperty('occurred_at');
      expect(JSON.parse(String(c[1].body))).not.toHaveProperty('sent_at');
    }
  });

  it('pedido de ajuda com id escolhido por quem chama (a tela de emergência) mantém esse id', async () => {
    const fetchImpl = vi.fn(async () => respostaHttp(200, { ok: true, id: 'x' }));
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl });
    await s.enviar({ action: 'help.create', id: '9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f', kind: 'emergencia', message: 'dor' });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).id).toBe('9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f');
  });

  it('fila cheia só de socorros e mensagens: sai a mensagem mais antiga, NUNCA o socorro', async () => {
    const off = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: off });
    await s.enviar({ action: 'help.create', kind: 'emergencia', message: 'socorro antigo' });
    for (let i = 0; i < 200; i++) await s.enviar({ action: 'message.send', text: `m${i}`, kind: 'texto' });
    expect(s.tamanhoDaFila).toBe(200);
    const acoes = s._fila().map((it) => it.acao);
    expect(acoes[0]).toMatchObject({ action: 'help.create', message: 'socorro antigo' });
    // A mensagem mais antiga (m0) é que saiu.
    expect(acoes.some((a) => a.action === 'message.send' && a.text === 'm0')).toBe(false);
    expect(acoes.some((a) => a.action === 'message.send' && a.text === 'm199')).toBe(true);
  });

  it('um envio que dá certo drena também a fila gravada por uma execução anterior (ainda não lida)', async () => {
    const off = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const s1 = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: off });
    await s1.enviar({ action: 'help.create', kind: 'emergencia', message: 'da execução anterior' });
    // App reaberto: a primeira coisa que sai é um heartbeat, e ele dá certo.
    const enviados: string[] = [];
    const on = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      enviados.push(JSON.parse(String(init?.body)).action);
      return respostaHttp(200, { ok: true });
    });
    const s2 = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl: on as unknown as typeof fetch });
    await s2.enviar({ action: 'heartbeat', app_version: '1', camera_ok: true, tracker_ok: true, calibrated: true });
    await vi.waitFor(() => expect(enviados).toContain('help.create'));
    await vi.waitFor(() => expect(s2.tamanhoDaFila).toBe(0));
  });

  it('cada item da fila leva a marca do vínculo, não a chave', async () => {
    const off = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const s = new DesktopSync({ url: URL_FN, chave: () => 'CHAVE-SECRETA-DO-PC', fetchImpl: off });
    await s.enviar({ action: 'message.send', text: 'x', kind: 'texto' });
    expect(s._fila()[0].vinculo).toBe(impressaoDaChave('CHAVE-SECRETA-DO-PC'));
    expect(localStorage.getItem('irisflow.fila')).not.toContain('CHAVE-SECRETA-DO-PC');
    expect(impressaoDaChave('CHAVE-SECRETA-DO-PC')).not.toBe(impressaoDaChave('outra-chave'));
  });

  it('fila de outro vínculo (outra conta entrou neste PC) é descartada sem envio', async () => {
    const off = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const s1 = new DesktopSync({ url: URL_FN, chave: () => 'chave-da-familia-A', fetchImpl: off });
    await s1.enviar({ action: 'help.create', kind: 'emergencia', message: 'da família A' });
    expect(localStorage.getItem('irisflow.fila')).not.toBeNull();

    const on = vi.fn(async () => respostaHttp(200, { ok: true }));
    const s2 = new DesktopSync({ url: URL_FN, chave: () => 'chave-da-familia-B', fetchImpl: on });
    expect(await s2.drenar()).toBe(0);
    expect(on).not.toHaveBeenCalled();
    expect(localStorage.getItem('irisflow.fila')).toBeNull();
  });

  it('troca de chave na mesma execução (saiu e entrou outra conta): o pendente anterior não segue', async () => {
    let chave = 'chave-A';
    let online = false;
    const enviados: Array<{ texto: unknown; chave: string }> = [];
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      if (!online) throw new TypeError('Failed to fetch');
      enviados.push({ texto: JSON.parse(String(init?.body)).text, chave: (init?.headers as Record<string, string>)['x-device-key'] });
      return respostaHttp(200, { ok: true });
    });
    const s = new DesktopSync({ url: URL_FN, chave: () => chave, fetchImpl: fetchImpl as unknown as typeof fetch });
    await s.enviar({ action: 'message.send', text: 'para A', kind: 'texto' });
    chave = 'chave-B';
    await s.enviar({ action: 'message.send', text: 'para B', kind: 'texto' });
    expect(s.tamanhoDaFila).toBe(1);
    online = true;
    expect(await s.drenar()).toBe(1);
    expect(enviados).toEqual([{ texto: 'para B', chave: 'chave-B' }]);
  });

  it('fila gravada por versão anterior (sem a marca do vínculo) é descartada, não enviada', async () => {
    localStorage.setItem('irisflow.fila', JSON.stringify([
      { acao: { action: 'help.create', kind: 'emergencia', message: 'sem destinatário' }, criadoEm: '2026-09-20T10:00:00.000Z', tentativas: 0 },
    ]));
    const fetchImpl = vi.fn(async () => respostaHttp(200, { ok: true }));
    const s = new DesktopSync({ url: URL_FN, chave: () => 'k', fetchImpl });
    expect(await s.drenar()).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(localStorage.getItem('irisflow.fila')).toBeNull();
  });
});
