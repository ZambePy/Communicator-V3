// O pedido da parear-celular do começo ao fim, com banco, Auth e log falsos.
//   deno test supabase/functions/parear-celular/
import { deepStrictEqual, notStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { atender, type Dependencias } from './atender.ts';
import { hashDoCodigo } from './codigoDoCelular.ts';
import { hashDoEndereco } from './logica.ts';

const CODIGO = 'Qx7_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB'; // 43 caracteres
const IP = '203.0.113.77';
const EMAIL = 'familia@exemplo.com';
const USER = '9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f';
const PAREAMENTO = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const TOKEN = 'hash-do-link-magico-0123456789abcdef';
const SEGREDO = 'chave-de-servico-de-teste';
const BENEFICIARIO = 'b1b1b1b1-0000-4000-8000-000000000001';
const CELULARES = ['ExponentPushToken[celular-da-mae]', 'ExponentPushToken[celular-do-pai]'];
const AGORA = new Date('2026-10-21T17:03:00Z'); // 14:03 em Brasília
const TEXTO_DO_AVISO = 'Um celular novo entrou na conta pelo QR às 14:03.';

type Cenario = {
  banco?: { data: unknown; error: { code?: string | null } | null };
  link?: { data: unknown; error: { status?: number; code?: string } | null };
  /** `'lanca'`: a dependência lança em vez de devolver o erro. `'trava'`: nunca responde (banco preso). */
  nota?: { beneficiaryId: string | null; error: { code?: string | null } | null } | 'lanca' | 'trava';
  celulares?: { tokens: string[]; error: { code?: string | null } | null };
  /** `'rede'`: o fetch para a Expo lança (sem rede, prazo esgotado). */
  push?: { ok: boolean; corpo: unknown } | 'rede';
};

function montar(c: Cenario = {}) {
  const chamadas = {
    usar: [] as Array<[string, string]>,
    link: [] as string[],
    logs: [] as string[],
    notas: [] as Array<[string, string]>,
    celulares: [] as string[],
    push: [] as unknown[][],
  };
  const dep: Dependencias = {
    segredo: SEGREDO,
    usarCodigo: async (h, ip) => {
      chamadas.usar.push([h, ip]);
      return c.banco ?? {
        data: { ok: true, pareamento_id: PAREAMENTO, user_id: USER, email: EMAIL, email_confirmado: true, paciente: 'Maria' },
        error: null,
      };
    },
    gerarLink: async (email) => {
      chamadas.link.push(email);
      return c.link ?? { data: { user: { id: USER }, properties: { hashed_token: TOKEN, verification_type: 'magiclink' } }, error: null };
    },
    registrar: (_nivel, linha) => chamadas.logs.push(linha),
    gravarNota: async (pareamentoId, texto) => {
      chamadas.notas.push([pareamentoId, texto]);
      if (c.nota === 'lanca') throw new Error('falha inesperada ao gravar a nota');
      if (c.nota === 'trava') return new Promise<never>(() => {});
      return c.nota ?? { beneficiaryId: BENEFICIARIO, error: null };
    },
    celularesDaConta: async (userId) => {
      chamadas.celulares.push(userId);
      return c.celulares ?? { tokens: CELULARES, error: null };
    },
    enviarPush: async (mensagens) => {
      chamadas.push.push(mensagens);
      if (c.push === 'rede') throw new TypeError('error sending request: connection refused');
      return c.push ?? { ok: true, corpo: { data: mensagens.map((_, i) => ({ status: 'ok', id: `ticket-${i}` })) } };
    },
    agora: () => AGORA,
  };
  return { dep, chamadas };
}

function pedido(corpo: unknown, metodo = 'POST', cabecalhos: Record<string, string> = {}): Request {
  return new Request('https://exemplo.supabase.co/functions/v1/parear-celular', {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.9.9, ${IP}`, ...cabecalhos },
    body: metodo === 'POST' ? (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) : undefined,
  });
}

/** Nada do pedido nem da resposta pode aparecer no log — nem o token de push dos celulares. */
async function semSegredoNoLog(logs: string[]) {
  const proibidos = [CODIGO, await hashDoCodigo(CODIGO), EMAIL, IP, await hashDoEndereco(SEGREDO, IP), TOKEN, SEGREDO, ...CELULARES];
  for (const linha of logs) for (const p of proibidos) ok(!linha.includes(p), `log vazou dado: ${linha}`);
}

Deno.test('código certo: o banco recebe só hashes, o link é da conta do código e a resposta traz só o token', async () => {
  const { dep, chamadas } = montar();
  const r = await atender(pedido({ codigo: CODIGO }), dep);
  strictEqual(r.status, 200);
  strictEqual(r.headers.get('cache-control'), 'no-store');
  deepStrictEqual(await r.json(), { ok: true, token_hash: TOKEN, tipo: 'magiclink', pareamento_id: PAREAMENTO, paciente: 'Maria' });
  // O banco vê o SHA-256 do código e o HMAC do endereço — nunca o código nem o IP.
  deepStrictEqual(chamadas.usar, [[await hashDoCodigo(CODIGO), await hashDoEndereco(SEGREDO, IP)]]);
  deepStrictEqual(chamadas.link, [EMAIL]);
  await semSegredoNoLog(chamadas.logs);
});

Deno.test('formato errado, corpo que não é JSON ou sem código: recusa sem consultar o banco', async () => {
  for (const corpo of ['{isto não é json', {}, { codigo: 'curto' }, { codigo: CODIGO + 'a' }, { codigo: 42 }, [CODIGO]]) {
    const { dep, chamadas } = montar();
    const r = await atender(pedido(corpo), dep);
    strictEqual(r.status, 400);
    deepStrictEqual(await r.json(), { error: 'codigo_invalido' });
    strictEqual(chamadas.usar.length, 0);
  }
  const { dep } = montar();
  strictEqual((await atender(pedido(null, 'GET'), dep)).status, 405);
});

Deno.test('inexistente/vencido/usado e conta sem e-mail confirmado: a MESMA resposta, e sem link', async () => {
  const invalido = montar({ banco: { data: { ok: false, motivo: 'invalido' }, error: null } });
  const semEmail = montar({
    banco: { data: { ok: true, pareamento_id: PAREAMENTO, user_id: USER, email: EMAIL, email_confirmado: false, paciente: 'Maria' }, error: null },
  });
  const a = await atender(pedido({ codigo: CODIGO }), invalido.dep);
  const b = await atender(pedido({ codigo: CODIGO }), semEmail.dep);
  strictEqual(a.status, 400);
  strictEqual(b.status, 400);
  deepStrictEqual(await a.json(), await b.json());
  strictEqual(semEmail.chamadas.link.length, 0, 'conta sem e-mail confirmado não pode receber link mágico');
  ok(semEmail.chamadas.logs.length === 1);
  await semSegredoNoLog(semEmail.chamadas.logs);
});

Deno.test('limite de tentativas: 429, sem link', async () => {
  const { dep, chamadas } = montar({ banco: { data: { ok: false, motivo: 'limite' }, error: null } });
  const r = await atender(pedido({ codigo: CODIGO }), dep);
  strictEqual(r.status, 429);
  deepStrictEqual(await r.json(), { error: 'muitas_tentativas' });
  strictEqual(chamadas.link.length, 0);
});

Deno.test('banco fora: 503 (o celular tenta de novo), com log sem dado do pedido', async () => {
  const { dep, chamadas } = montar({ banco: { data: null, error: { code: '57014' } } });
  const r = await atender(pedido({ codigo: CODIGO }), dep);
  strictEqual(r.status, 503);
  deepStrictEqual(await r.json(), { error: 'servico_indisponivel' });
  strictEqual(chamadas.logs.length, 1);
  ok(chamadas.logs[0].includes('57014'));
  await semSegredoNoLog(chamadas.logs);
});

Deno.test('Auth fora depois de gastar o código: 503, sem token', async () => {
  const { dep, chamadas } = montar({ link: { data: null, error: { status: 500, code: 'unexpected_failure' } } });
  const r = await atender(pedido({ codigo: CODIGO }), dep);
  strictEqual(r.status, 503);
  ok(!JSON.stringify(await r.json()).includes(TOKEN));
  await semSegredoNoLog(chamadas.logs);
});

Deno.test('link de OUTRA conta (o Auth cria conta quando o e-mail não existe): recusado, sem entregar o token', async () => {
  const { dep, chamadas } = montar({
    link: { data: { user: { id: 'conta-criada-agora' }, properties: { hashed_token: TOKEN, verification_type: 'signup' } }, error: null },
  });
  const r = await atender(pedido({ codigo: CODIGO }), dep);
  strictEqual(r.status, 400);
  const corpo = JSON.stringify(await r.json());
  ok(!corpo.includes(TOKEN));
  strictEqual(corpo, JSON.stringify({ error: 'codigo_invalido' }));
  strictEqual(chamadas.logs.length, 1);
  await semSegredoNoLog(chamadas.logs);
});

// Revisão de segurança de 20/10/2026: uma página qualquer, aberta no navegador
// de qualquer pessoa, manda um POST "simples" (text/plain, formulário) sem
// preflight de CORS. Não lê a resposta, mas a tentativa chegava ao banco e
// contava no limite. Só JSON passa: para outra origem, o navegador só manda
// application/json depois do preflight — e esta função não o atende.
Deno.test('corpo que não é application/json: 415, sem consultar o banco', async () => {
  for (const tipo of [
    'text/plain;charset=UTF-8', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x',
    'text/json', 'application/jsonp', 'application/json-seq',
  ]) {
    const { dep, chamadas } = montar();
    const r = await atender(pedido({ codigo: CODIGO }, 'POST', { 'content-type': tipo }), dep);
    strictEqual(r.status, 415, tipo);
    deepStrictEqual(await r.json(), { error: 'tipo_nao_suportado' });
    strictEqual(chamadas.usar.length, 0, tipo);
  }
  // Sem content-type nenhum (um corpo em bytes não ganha um sozinho).
  const { dep, chamadas } = montar();
  const semTipo = new Request('https://exemplo.supabase.co/functions/v1/parear-celular', {
    method: 'POST',
    body: new TextEncoder().encode(JSON.stringify({ codigo: CODIGO })),
  });
  strictEqual(semTipo.headers.get('content-type'), null);
  strictEqual((await atender(semTipo, dep)).status, 415);
  strictEqual(chamadas.usar.length, 0);
});

Deno.test('o POST de outro site sem preflight (o caso do revisor): 415, sem CORS na resposta, nada no banco', async () => {
  const { dep, chamadas } = montar();
  const comoNavegador = new Request('https://exemplo.supabase.co/functions/v1/parear-celular', {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://site-qualquer.example', 'cf-connecting-ip': '2001:db8:1:1::7' },
    body: JSON.stringify({ codigo: CODIGO }),
  });
  const r = await atender(comoNavegador, dep);
  strictEqual(r.status, 415);
  strictEqual(r.headers.get('access-control-allow-origin'), null);
  strictEqual(chamadas.usar.length, 0);
  // E o preflight que um fetch com application/json pediria não é atendido.
  const preflight = await atender(
    new Request('https://exemplo.supabase.co/functions/v1/parear-celular', {
      method: 'OPTIONS',
      headers: { origin: 'https://site-qualquer.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    }),
    dep,
  );
  strictEqual(preflight.status, 405);
  strictEqual(preflight.headers.get('access-control-allow-origin'), null);
  strictEqual(chamadas.usar.length, 0);
});

Deno.test('application/json com charset ou em maiúsculas passa (o app manda pelo supabase-js, como JSON)', async () => {
  for (const tipo of ['application/json', 'application/json; charset=utf-8', 'Application/JSON', 'application/json ;charset=UTF-8']) {
    const { dep, chamadas } = montar();
    strictEqual((await atender(pedido({ codigo: CODIGO }, 'POST', { 'content-type': tipo }), dep)).status, 200, tipo);
    strictEqual(chamadas.usar.length, 1, tipo);
  }
});

Deno.test('dois endereços do mesmo /64 chegam ao banco como um balde só; o /64 vizinho é outro', async () => {
  const { dep, chamadas } = montar({ banco: { data: { ok: false, motivo: 'invalido' }, error: null } });
  for (const ip of ['2001:db8:1:1::7', '2001:db8:1:1::8', '2001:db8:1:2::7']) {
    strictEqual((await atender(pedido({ codigo: CODIGO }, 'POST', { 'cf-connecting-ip': ip }), dep)).status, 400);
  }
  strictEqual(chamadas.usar.length, 3);
  strictEqual(chamadas.usar[0][1], chamadas.usar[1][1]);
  notStrictEqual(chamadas.usar[0][1], chamadas.usar[2][1]);
  ok(/^[0-9a-f]{64}$/.test(chamadas.usar[0][1]));
});

// ---------------------------------------------------------------------------
// Aviso de celular novo (decisão 1 da rodada 3, 21/10/2026): o QR abre a
// conta inteira, então cada celular que entra por ele vira aviso para todos —
// nota de sistema na conversa e push nos celulares já cadastrados. O aviso
// nunca derruba a troca: o que falhar vai para o log, numa linha só.
// ---------------------------------------------------------------------------

const mensagemDoAviso = (to: string) => ({
  to,
  title: 'Celular novo na conta',
  body: TEXTO_DO_AVISO,
  sound: 'default',
  priority: 'high',
  interruptionLevel: 'active',
  channelId: 'default',
  data: { kind: 'celular_novo', beneficiary_id: BENEFICIARIO },
});

Deno.test('troca bem-sucedida: grava a nota "Um celular novo entrou…" e avisa os celulares já cadastrados', async () => {
  const { dep, chamadas } = montar();
  const r = await atender(pedido({ codigo: CODIGO }), dep);
  strictEqual(r.status, 200);
  deepStrictEqual(await r.json(), { ok: true, token_hash: TOKEN, tipo: 'magiclink', pareamento_id: PAREAMENTO, paciente: 'Maria' });
  deepStrictEqual(chamadas.notas, [[PAREAMENTO, TEXTO_DO_AVISO]]);
  deepStrictEqual(chamadas.celulares, [USER]);
  deepStrictEqual(chamadas.push, [CELULARES.map(mensagemDoAviso)]);
  deepStrictEqual(chamadas.logs, []);
});

Deno.test('falha no push (sem rede) não derruba a troca: 200 com o token, a nota gravada e UMA linha no log', async () => {
  const { dep, chamadas } = montar({ push: 'rede' });
  const r = await atender(pedido({ codigo: CODIGO }), dep);
  strictEqual(r.status, 200);
  deepStrictEqual(await r.json(), { ok: true, token_hash: TOKEN, tipo: 'magiclink', pareamento_id: PAREAMENTO, paciente: 'Maria' });
  deepStrictEqual(chamadas.notas, [[PAREAMENTO, TEXTO_DO_AVISO]]);
  strictEqual(chamadas.logs.length, 1);
  ok(chamadas.logs[0].includes('push'), chamadas.logs[0]);
  await semSegredoNoLog(chamadas.logs);
});

Deno.test('a Expo recusa o aviso: a troca segue; o log traz o código do erro, nunca o token do celular', async () => {
  const { dep, chamadas } = montar({
    push: {
      ok: true,
      corpo: {
        data: [
          { status: 'ok', id: 'ticket-0' },
          { status: 'error', message: `"${CELULARES[1]}" is not a registered push notification recipient`, details: { error: 'DeviceNotRegistered' } },
        ],
      },
    },
  });
  strictEqual((await atender(pedido({ codigo: CODIGO }), dep)).status, 200);
  strictEqual(chamadas.logs.length, 1);
  ok(chamadas.logs[0].includes('DeviceNotRegistered'), chamadas.logs[0]);
  await semSegredoNoLog(chamadas.logs);
});

Deno.test('a nota não grava (banco fora) ou lança: a troca segue, o push sai mesmo assim, uma linha no log', async () => {
  for (const nota of [{ beneficiaryId: null, error: { code: '57014' } }, 'lanca'] as const) {
    const { dep, chamadas } = montar({ nota });
    const r = await atender(pedido({ codigo: CODIGO }), dep);
    strictEqual(r.status, 200, JSON.stringify(nota));
    strictEqual((await r.json()).token_hash, TOKEN);
    // sem saber o paciente, o push vai sem ele — mas vai
    strictEqual(chamadas.push.length, 1);
    deepStrictEqual((chamadas.push[0][0] as { data: unknown }).data, { kind: 'celular_novo' });
    strictEqual(chamadas.logs.length, 1);
    ok(chamadas.logs[0].includes('nota'), chamadas.logs[0]);
    await semSegredoNoLog(chamadas.logs);
  }
});

Deno.test('banco preso no aviso: a troca responde no prazo do aviso, com uma linha no log', async () => {
  const { dep, chamadas } = montar({ nota: 'trava' });
  dep.prazoDoAvisoMs = 40;
  const inicio = performance.now();
  const r = await atender(pedido({ codigo: CODIGO }), dep);
  ok(performance.now() - inicio < 2_000, 'a troca esperou o aviso preso');
  strictEqual(r.status, 200);
  strictEqual((await r.json()).token_hash, TOKEN);
  strictEqual(chamadas.logs.length, 1);
  ok(chamadas.logs[0].includes('prazo'), chamadas.logs[0]);
  await semSegredoNoLog(chamadas.logs);
});

Deno.test('sem celular cadastrado: a nota é gravada, nenhum push sai e o log fica vazio', async () => {
  const { dep, chamadas } = montar({ celulares: { tokens: [], error: null } });
  strictEqual((await atender(pedido({ codigo: CODIGO }), dep)).status, 200);
  strictEqual(chamadas.notas.length, 1);
  strictEqual(chamadas.push.length, 0);
  deepStrictEqual(chamadas.logs, []);
});

Deno.test('os celulares da conta não puderam ser lidos: a troca segue, sem push, uma linha no log', async () => {
  const { dep, chamadas } = montar({ celulares: { tokens: [], error: { code: '08006' } } });
  strictEqual((await atender(pedido({ codigo: CODIGO }), dep)).status, 200);
  strictEqual(chamadas.push.length, 0);
  strictEqual(chamadas.logs.length, 1);
  ok(chamadas.logs[0].includes('08006'), chamadas.logs[0]);
});

Deno.test('sem troca, sem aviso: código inválido, limite, banco ou Auth fora, link de outra conta, corpo que não é JSON', async () => {
  const casos: Array<[string, Cenario, Request]> = [
    ['inválido', { banco: { data: { ok: false, motivo: 'invalido' }, error: null } }, pedido({ codigo: CODIGO })],
    ['sem e-mail confirmado', {
      banco: { data: { ok: true, pareamento_id: PAREAMENTO, user_id: USER, email: EMAIL, email_confirmado: false, paciente: 'Maria' }, error: null },
    }, pedido({ codigo: CODIGO })],
    ['limite', { banco: { data: { ok: false, motivo: 'limite' }, error: null } }, pedido({ codigo: CODIGO })],
    ['banco fora', { banco: { data: null, error: { code: '57014' } } }, pedido({ codigo: CODIGO })],
    ['Auth fora', { link: { data: null, error: { status: 500, code: 'unexpected_failure' } } }, pedido({ codigo: CODIGO })],
    ['outra conta', { link: { data: { user: { id: 'outra' }, properties: { hashed_token: TOKEN } }, error: null } }, pedido({ codigo: CODIGO })],
    ['formato', {}, pedido({ codigo: 'curto' })],
    ['texto', {}, pedido({ codigo: CODIGO }, 'POST', { 'content-type': 'text/plain' })],
  ];
  for (const [nome, cenario, req] of casos) {
    const { dep, chamadas } = montar(cenario);
    notStrictEqual((await atender(req, dep)).status, 200, nome);
    strictEqual(chamadas.notas.length, 0, nome);
    strictEqual(chamadas.celulares.length, 0, nome);
    strictEqual(chamadas.push.length, 0, nome);
  }
});
