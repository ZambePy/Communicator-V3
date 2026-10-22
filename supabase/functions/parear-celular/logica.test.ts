// Testes das decisões da parear-celular.
//   deno test supabase/functions/parear-celular/
import { deepStrictEqual, notStrictEqual, ok, strictEqual } from 'node:assert/strict';
import {
  baldeDoEndereco,
  CODIGO_INVALIDO,
  conferirLink,
  decidirUso,
  hashDoEndereco,
  hmacHex,
  ipDoPedido,
  mensagensDoCelularNovo,
  MUITAS_TENTATIVAS,
  problemaDoPush,
  SERVICO_INDISPONIVEL,
  textoDoCelularNovo,
} from './logica.ts';

const cab = (h: Record<string, string>) => new Headers(h);

Deno.test('endereço: o Cloudflare manda, depois o ÚLTIMO do x-forwarded-for, depois x-real-ip', () => {
  strictEqual(ipDoPedido(cab({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1, 203.0.113.9' })), '203.0.113.9');
  strictEqual(ipDoPedido(cab({ 'x-forwarded-for': '198.51.100.4' })), '198.51.100.4');
  strictEqual(ipDoPedido(cab({ 'x-real-ip': '192.0.2.1' })), '192.0.2.1');
  strictEqual(ipDoPedido(cab({ 'x-forwarded-for': '2001:db8::1' })), '2001:db8::1');
  strictEqual(ipDoPedido(cab({ 'x-forwarded-for': '::ffff:192.0.2.128' })), '::ffff:192.0.2.128');
});

Deno.test('endereço: o que o cliente escreve no começo do x-forwarded-for não troca o balde', () => {
  // O proxy acrescenta o endereço real no FIM; o começo é do cliente.
  const a = ipDoPedido(cab({ 'x-forwarded-for': '10.0.0.1, 198.51.100.4' }));
  const b = ipDoPedido(cab({ 'x-forwarded-for': '10.0.0.2, 198.51.100.4' }));
  strictEqual(a, '198.51.100.4');
  strictEqual(a, b);
});

Deno.test('endereço: lixo nos cabeçalhos cai no balde "desconhecido", nunca num endereço inventado', () => {
  strictEqual(ipDoPedido(cab({})), 'desconhecido');
  strictEqual(ipDoPedido(cab({ 'cf-connecting-ip': 'eu-sou-um-ip', 'x-forwarded-for': 'qualquer coisa' })), 'desconhecido');
  strictEqual(ipDoPedido(cab({ 'x-forwarded-for': ' , ' })), 'desconhecido');
});

Deno.test('HMAC-SHA-256: vetor 2 da RFC 4231', async () => {
  strictEqual(
    await hmacHex('Jefe', 'what do ya want for nothing?'),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  );
});

Deno.test('o endereço vai para o banco como HMAC: 64 hexadecimais, depende da chave, não é o SHA-256 do IP', async () => {
  const a = await hashDoEndereco('chave-1', '203.0.113.9');
  ok(/^[0-9a-f]{64}$/.test(a));
  notStrictEqual(a, await hashDoEndereco('chave-2', '203.0.113.9'));
  notStrictEqual(a, await hashDoEndereco('chave-1', '203.0.113.10'));
  strictEqual(a, await hashDoEndereco('chave-1', '203.0.113.9'));
  const shaPuro = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('203.0.113.9')))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  notStrictEqual(a, shaPuro);
});

// Revisão de segurança de 20/10/2026: um balde por endereço IPv6 não limitava
// ninguém — o provedor entrega a cada casa um /64 inteiro (2^64 endereços), e
// trocar de endereço a cada pedido furava o limite.
Deno.test('balde do limite: IPv4 inteiro; IPv6 pelo /64, escrito de qualquer jeito', () => {
  strictEqual(baldeDoEndereco('203.0.113.9'), '203.0.113.9');
  strictEqual(baldeDoEndereco('203.0.113.10'), '203.0.113.10');
  for (const ip of [
    '2001:db8:1:1::7',
    '2001:db8:1:1::8',
    '2001:0db8:0001:0001:ffff:ffff:ffff:ffff',
    '2001:DB8:1:1:A:B:C:D',
    '2001:db8:1:1:0:0:0:1',
    '2001:db8:1:1::',
  ]) strictEqual(baldeDoEndereco(ip), '2001:db8:1:1::/64', ip);
  // O /64 vizinho é outra casa.
  strictEqual(baldeDoEndereco('2001:db8:1:2::7'), '2001:db8:1:2::/64');
  strictEqual(baldeDoEndereco('::1'), '0:0:0:0::/64');
  strictEqual(baldeDoEndereco('fe80::1:2:3:4'), 'fe80:0:0:0::/64');
  strictEqual(baldeDoEndereco('64:ff9b::192.0.2.1'), '64:ff9b:0:0::/64');
});

Deno.test('balde do limite: IPv4 escrito como IPv6 (::ffff:a.b.c.d) é o IPv4, não o /64 de todos eles', () => {
  // Sem isto, todo cliente IPv4 que um proxy escreve assim cairia no MESMO
  // balde (::/64): dez chutes de um deles barrariam todos os outros.
  strictEqual(baldeDoEndereco('::ffff:192.0.2.128'), '192.0.2.128');
  strictEqual(baldeDoEndereco('::FFFF:192.0.2.128'), '192.0.2.128');
  strictEqual(baldeDoEndereco('::ffff:c000:280'), '192.0.2.128');
  strictEqual(baldeDoEndereco('0:0:0:0:0:ffff:192.0.2.128'), '192.0.2.128');
});

Deno.test('balde do limite: o que não é endereço vai para "desconhecido", nunca para um balde por texto', () => {
  // Um balde por texto qualquer deixaria trocar de balde a cada pedido.
  for (const lixo of [
    ':::', '1::2::3', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7::8', '12345::1', 'g::1', ':1::2', '1::2:',
    '999.1.1.1', '1.2.3', '1.2.3.4.5', '::ffff:999.0.0.1', 'desconhecido', '',
  ]) strictEqual(baldeDoEndereco(lixo), 'desconhecido', lixo);
});

Deno.test('o HMAC é do balde: o mesmo /64 dá o mesmo hash; o /64 vizinho e outro IPv4, não', async () => {
  const a = await hashDoEndereco('chave-1', '2001:db8:1:1::7');
  strictEqual(a, await hashDoEndereco('chave-1', '2001:db8:1:1::8'));
  strictEqual(a, await hashDoEndereco('chave-1', '2001:db8:1:1:ffff:ffff:ffff:ffff'));
  notStrictEqual(a, await hashDoEndereco('chave-1', '2001:db8:1:2::7'));
  notStrictEqual(await hashDoEndereco('chave-1', '203.0.113.9'), await hashDoEndereco('chave-1', '203.0.113.10'));
  strictEqual(await hashDoEndereco('chave-1', '::ffff:203.0.113.9'), await hashDoEndereco('chave-1', '203.0.113.9'));
});

const usoCerto = {
  ok: true,
  pareamento_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  user_id: '9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f',
  email: 'familia@exemplo.com',
  email_confirmado: true,
  paciente: ' Maria ',
};

Deno.test('código certo: gera o link da conta do código', () => {
  deepStrictEqual(decidirUso(usoCerto), {
    tipo: 'gerar_link',
    email: 'familia@exemplo.com',
    userId: '9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f',
    pareamentoId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    paciente: 'Maria',
  });
  const semNome = decidirUso({ ...usoCerto, paciente: null });
  strictEqual(semNome.tipo === 'gerar_link' ? semNome.paciente : 'x', null);
});

Deno.test('inexistente, vencido, usado (o banco diz "invalido") e conta sem e-mail confirmado: a MESMA resposta', () => {
  const invalido = decidirUso({ ok: false, motivo: 'invalido' });
  const semEmail = decidirUso({ ...usoCerto, email_confirmado: false });
  deepStrictEqual(invalido, { tipo: 'recusar', status: 400, corpo: CODIGO_INVALIDO });
  strictEqual(semEmail.tipo, 'recusar');
  if (semEmail.tipo === 'recusar') {
    strictEqual(semEmail.status, 400);
    deepStrictEqual(semEmail.corpo, CODIGO_INVALIDO);
    // vai para o log (sem e-mail), mas não muda a resposta
    ok(semEmail.registro && !semEmail.registro.includes('@'));
  }
});

Deno.test('limite de tentativas: 429; resposta estranha do banco: 503', () => {
  deepStrictEqual(decidirUso({ ok: false, motivo: 'limite' }), { tipo: 'recusar', status: 429, corpo: MUITAS_TENTATIVAS });
  for (const estranho of [null, 'texto', { ok: false }, { ok: true }, { ...usoCerto, email: '' }]) {
    const d = decidirUso(estranho);
    strictEqual(d.tipo, 'recusar');
    if (d.tipo === 'recusar') {
      strictEqual(d.status, 503);
      deepStrictEqual(d.corpo, SERVICO_INDISPONIVEL);
    }
  }
});

const linkCerto = {
  user: { id: usoCerto.user_id },
  properties: { hashed_token: 'pkce_ou_hash-do-link', verification_type: 'magiclink', action_link: 'https://…' },
};

Deno.test('link mágico da conta certa: entrega só o hashed_token', () => {
  deepStrictEqual(conferirLink(linkCerto, usoCerto.user_id), { ok: true, tokenHash: 'pkce_ou_hash-do-link' });
});

Deno.test('link de outra conta, de cadastro (o Auth cria conta quando o e-mail não existe) ou sem token: recusado', () => {
  strictEqual(conferirLink({ ...linkCerto, user: { id: 'outra' } }, usoCerto.user_id).ok, false);
  strictEqual(conferirLink({ ...linkCerto, properties: { ...linkCerto.properties, verification_type: 'signup' } }, usoCerto.user_id).ok, false);
  strictEqual(conferirLink({ ...linkCerto, properties: { verification_type: 'magiclink' } }, usoCerto.user_id).ok, false);
  strictEqual(conferirLink({ ...linkCerto, properties: { ...linkCerto.properties, hashed_token: '' } }, usoCerto.user_id).ok, false);
  strictEqual(conferirLink(null, usoCerto.user_id).ok, false);
});

// Decisão 1 da rodada 3 (21/10/2026): o QR abre a conta inteira, então cada
// celular novo que entra por ele vira aviso para todos — nota de sistema na
// conversa e push nos celulares que já estavam cadastrados.
Deno.test('aviso de celular novo: o texto, com a hora de Brasília', () => {
  strictEqual(textoDoCelularNovo(new Date('2026-10-21T17:03:00Z')), 'Um celular novo entrou na conta pelo QR às 14:03.');
  strictEqual(textoDoCelularNovo(new Date('2026-10-21T03:05:00Z')), 'Um celular novo entrou na conta pelo QR às 00:05.');
  strictEqual(textoDoCelularNovo(new Date('2026-10-21T02:59:59Z')), 'Um celular novo entrou na conta pelo QR às 23:59.');
});

Deno.test('aviso de celular novo: um push por celular, no canal comum (é aviso, não socorro: não fura o modo Foco)', () => {
  deepStrictEqual(mensagensDoCelularNovo(['ExponentPushToken[a]', 'ExponentPushToken[b]'], 'Um celular novo…', 'b-1'), [
    {
      to: 'ExponentPushToken[a]',
      title: 'Celular novo na conta',
      body: 'Um celular novo…',
      sound: 'default',
      priority: 'high',
      interruptionLevel: 'active',
      channelId: 'default',
      data: { kind: 'celular_novo', beneficiary_id: 'b-1' },
    },
    {
      to: 'ExponentPushToken[b]',
      title: 'Celular novo na conta',
      body: 'Um celular novo…',
      sound: 'default',
      priority: 'high',
      interruptionLevel: 'active',
      channelId: 'default',
      data: { kind: 'celular_novo', beneficiary_id: 'b-1' },
    },
  ]);
  // Sem saber o paciente (a nota não gravou), o push sai sem ele.
  deepStrictEqual(mensagensDoCelularNovo(['t'], 'x', null)[0].data, { kind: 'celular_novo' });
  deepStrictEqual(mensagensDoCelularNovo([], 'x', 'b-1'), []);
});

Deno.test('resposta da Expo ao aviso: o que deu errado, só em códigos — nunca o texto da Expo, que pode trazer o token', () => {
  strictEqual(problemaDoPush(true, { data: [{ status: 'ok', id: '1' }, { status: 'ok', id: '2' }] }, 2), null);
  strictEqual(problemaDoPush(false, null, 2), 'recusado (http)');
  strictEqual(problemaDoPush(false, { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: 'm' }] }, 2), 'recusado (PUSH_TOO_MANY_EXPERIENCE_IDS)');
  strictEqual(problemaDoPush(true, {}, 1), 'recusado (resposta_inesperada)');
  const comToken = 'ExponentPushToken[segredo] is not a registered push notification recipient';
  strictEqual(
    problemaDoPush(true, { data: [{ status: 'ok', id: '1' }, { status: 'error', message: comToken, details: { error: 'DeviceNotRegistered' } }] }, 2),
    'recusado para 1 de 2 celular(es) (DeviceNotRegistered)',
  );
  // Sem código, a recusa entra como "erro" — a mensagem da Expo não vai para o log.
  strictEqual(problemaDoPush(true, { data: [{ status: 'error', message: comToken }] }, 1), 'recusado para 1 de 1 celular(es) (erro)');
  // Ticket que faltou conta como recusa.
  strictEqual(problemaDoPush(true, { data: [{ status: 'ok', id: '1' }] }, 2), 'recusado para 1 de 2 celular(es) (sem_ticket)');
});
