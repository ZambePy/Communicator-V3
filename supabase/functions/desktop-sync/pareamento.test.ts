// Testes das respostas do pareamento do celular (pairing.create / pairing.status).
//   deno test supabase/functions/desktop-sync/
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { estadoDoPareamento, respostaDaCriacao, segundosRestantes, type LinhaDoPareamento } from './pareamento.ts';

const AGORA = Date.parse('2026-10-19T17:00:00.000Z');
const linha = (p: Partial<LinhaDoPareamento> = {}): LinhaDoPareamento => ({
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  expira_em: '2026-10-19T17:02:30.000Z',
  usado_em: null,
  conectado_em: null,
  cancelado_em: null,
  ...p,
});

Deno.test('segundos restantes pelo relógio do servidor, nunca negativos', () => {
  strictEqual(segundosRestantes('2026-10-19T17:02:30.000Z', AGORA), 150);
  strictEqual(segundosRestantes('2026-10-19T17:00:00.400Z', AGORA), 0);
  strictEqual(segundosRestantes('2026-10-19T16:59:00.000Z', AGORA), 0);
  strictEqual(segundosRestantes('não é data', AGORA), 0);
});

Deno.test('código na tela, dentro da validade: aguardando, com o tempo que falta', () => {
  deepStrictEqual(estadoDoPareamento(linha(), AGORA), { estado: 'aguardando', restante_s: 150 });
});

Deno.test('passou da validade sem uso: vencido', () => {
  deepStrictEqual(estadoDoPareamento(linha({ expira_em: '2026-10-19T16:59:59.000Z' }), AGORA), { estado: 'vencido', restante_s: 0 });
});

Deno.test('usado (o celular ainda não confirmou) não vira "conectado"', () => {
  deepStrictEqual(estadoDoPareamento(linha({ usado_em: '2026-10-19T16:59:50.000Z' }), AGORA), {
    estado: 'usado',
    usado_em: '2026-10-19T16:59:50.000Z',
  });
});

Deno.test('usado no último segundo continua usado depois do vencimento', () => {
  const r = estadoDoPareamento(linha({ expira_em: '2026-10-19T16:59:59.000Z', usado_em: '2026-10-19T16:59:58.000Z' }), AGORA);
  strictEqual(r.estado, 'usado');
});

Deno.test('o celular confirmou: conectado, com as duas horas', () => {
  deepStrictEqual(
    estadoDoPareamento(linha({ usado_em: '2026-10-19T16:59:50.000Z', conectado_em: '2026-10-19T16:59:52.000Z' }), AGORA),
    { estado: 'conectado', conectado_em: '2026-10-19T16:59:52.000Z', usado_em: '2026-10-19T16:59:50.000Z' },
  );
});

Deno.test('cancelado (outro código ou tela fechada) e linha de outro computador', () => {
  deepStrictEqual(estadoDoPareamento(linha({ cancelado_em: '2026-10-19T16:59:00.000Z' }), AGORA), { estado: 'cancelado' });
  deepStrictEqual(estadoDoPareamento(null, AGORA), { estado: 'desconhecido' });
  deepStrictEqual(estadoDoPareamento(undefined, AGORA), { estado: 'desconhecido' });
});

Deno.test('criação: devolve id, validade e o tempo que falta pelo servidor', () => {
  const r = respostaDaCriacao({ ok: true, id: 'abc', expira_em: '2026-10-19T17:03:00.000Z', validade_s: 180 }, AGORA);
  deepStrictEqual(r, { status: 200, corpo: { ok: true, id: 'abc', expira_em: '2026-10-19T17:03:00.000Z', restante_s: 180, validade_s: 180 } });
});

Deno.test('criação recusada: cada motivo com o seu status, para o computador dizer o que fazer', () => {
  deepStrictEqual(respostaDaCriacao({ ok: false, motivo: 'limite', tente_em: '2026-10-19T17:08:00.000Z' }, AGORA), {
    status: 429,
    corpo: { error: 'limite', tente_em: '2026-10-19T17:08:00.000Z' },
  });
  deepStrictEqual(respostaDaCriacao({ ok: false, motivo: 'email_nao_confirmado' }, AGORA), { status: 409, corpo: { error: 'email_nao_confirmado' } });
  deepStrictEqual(respostaDaCriacao({ ok: false, motivo: 'computador_desvinculado' }, AGORA), { status: 403, corpo: { error: 'device_revoked' } });
});

Deno.test('resposta estranha do banco é falha passageira (503), nunca um código sem id', () => {
  strictEqual(respostaDaCriacao(null, AGORA).status, 503);
  strictEqual(respostaDaCriacao({ ok: true }, AGORA).status, 503);
  strictEqual(respostaDaCriacao({ ok: false, motivo: 'outro' }, AGORA).status, 503);
  strictEqual(respostaDaCriacao('texto', AGORA).status, 503);
});
