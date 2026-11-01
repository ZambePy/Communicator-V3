// Testes do push da mensagem do paciente (31/10/2026).
//   deno test supabase/functions/desktop-sync/
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import {
  avisarMensagem,
  CANAL_DE_MENSAGENS,
  emSegundoPlano,
  grupoDaConversa,
  LIMITE_DO_CORPO,
  mensagemAvisaPorPush,
  pushesDaMensagem,
  truncar,
  type DependenciasDoPushDeMensagem,
  type PushDeMensagem,
} from './mensagemPush.ts';

const B = '9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f';
const M = '1c2d3e4f-0000-4000-8000-000000000001';

/** Dependências falsas: conta com dois celulares, Expo aceitando tudo. */
function dep(extra: Partial<DependenciasDoPushDeMensagem> = {}) {
  const enviados: PushDeMensagem[][] = [];
  const logs: string[] = [];
  const removidos: string[][] = [];
  const d: DependenciasDoPushDeMensagem = {
    beneficiario: async () => ({ data: { profile_id: 'p1', user_name: 'Carlos' }, error: null }),
    tokens: async () => ({ data: [{ token: 'ExponentPushToken[a]' }, { token: 'ExponentPushToken[b]' }], error: null }),
    enviar: async (corpo) => {
      enviados.push(corpo);
      return { ok: true, json: { data: corpo.map(() => ({ status: 'ok' })) } };
    },
    removerTokens: async (t) => {
      removidos.push(t);
    },
    registrar: (l) => logs.push(l),
    esperar: async () => undefined,
    ...extra,
  };
  return { d, enviados, logs, removidos };
}

Deno.test('título é o nome da pessoa, corpo é o que ela escreveu, dados levam o tipo e os ids', () => {
  const [p] = pushesDaMensagem(['t1'], 'Carlos', 'Estou com sede.', B, M);
  strictEqual(p.title, 'Carlos');
  strictEqual(p.body, 'Estou com sede.');
  deepStrictEqual(p.data, { type: 'mensagem', beneficiaryId: B, messageId: M, beneficiary_id: B });
});

Deno.test('canal "mensagens" no Android, nível ativo no iOS (não fura o Foco) e agrupado por pessoa', () => {
  const ps = pushesDaMensagem(['t1', 't2'], 'Carlos', 'Oi', B, M);
  strictEqual(ps.length, 2);
  for (const p of ps) {
    strictEqual(p.channelId, CANAL_DE_MENSAGENS);
    strictEqual(p.channelId, 'mensagens');
    strictEqual(p.interruptionLevel, 'active');
    strictEqual(p.priority, 'high');
    strictEqual(p.sound, 'default');
    strictEqual(p.threadId, grupoDaConversa(B));
  }
  ok(grupoDaConversa(B) !== grupoDaConversa('outro'));
});

Deno.test('texto longo é cortado em ~140 caracteres, com reticências e sem partir palavra', () => {
  const longo = 'Quero que você ligue para a minha irmã e diga que estou bem, que a fisioterapia de hoje foi boa e que amanhã quero ver o jogo do meu time na sala com todo mundo junto';
  const t = truncar(longo);
  ok(t.length <= LIMITE_DO_CORPO, `tamanho ${t.length}`);
  ok(t.endsWith('…'));
  ok(longo.startsWith(t.slice(0, -1)));
  strictEqual(truncar('  curto   demais '), 'curto demais');
  strictEqual(pushesDaMensagem(['t'], 'C', longo, B, M)[0].body, t);
});

Deno.test('mensagem de sistema não vira push; as outras sim', () => {
  strictEqual(mensagemAvisaPorPush('sistema'), false);
  for (const k of ['texto', 'frase', 'pictograma', 'simnao']) strictEqual(mensagemAvisaPorPush(k), true);
});

Deno.test('avisarMensagem envia um push por celular da conta', async () => {
  const { d, enviados } = dep();
  const r = await avisarMensagem(d, { beneficiaryId: B, messageId: M, kind: 'texto', text: 'Estou com sede.' });
  strictEqual(r.tipo, 'enviado');
  strictEqual(enviados.length, 1);
  deepStrictEqual(enviados[0].map((p) => p.to), ['ExponentPushToken[a]', 'ExponentPushToken[b]']);
  strictEqual(enviados[0][0].title, 'Carlos');
});

Deno.test('avisarMensagem: kind sistema não consulta nada nem envia', async () => {
  let leu = false;
  const { d, enviados } = dep({ beneficiario: async () => ((leu = true), { data: null, error: null }) });
  const r = await avisarMensagem(d, { beneficiaryId: B, messageId: M, kind: 'sistema', text: 'Estou bem' });
  deepStrictEqual(r, { tipo: 'ignorada', motivo: 'sistema' });
  strictEqual(leu, false);
  strictEqual(enviados.length, 0);
});

Deno.test('avisarMensagem: conta sem celular cadastrado não chama a Expo', async () => {
  const { d, enviados } = dep({ tokens: async () => ({ data: [], error: null }) });
  const r = await avisarMensagem(d, { beneficiaryId: B, messageId: M, kind: 'frase', text: 'Oi' });
  deepStrictEqual(r, { tipo: 'sem_destino', motivo: 'sem_celular' });
  strictEqual(enviados.length, 0);
});

Deno.test('avisarMensagem nunca rejeita: falha de rede vira resultado e log', async () => {
  const { d, logs } = dep({
    enviar: async () => {
      throw new Error('TimeoutError: signal timed out');
    },
  });
  const r = await avisarMensagem(d, { beneficiaryId: B, messageId: M, kind: 'texto', text: 'Oi' });
  deepStrictEqual(r, { tipo: 'falhou', motivo: 'rede' });
  ok(logs.some((l) => l.includes('push da mensagem falhou')));
});

Deno.test('avisarMensagem: banco fora do ar (duas vezes) não lança e não envia', async () => {
  const { d, enviados } = dep({ beneficiario: async () => ({ data: null, error: { message: 'timeout' } }) });
  const r = await avisarMensagem(d, { beneficiaryId: B, messageId: M, kind: 'texto', text: 'Oi' });
  deepStrictEqual(r, { tipo: 'falhou', motivo: 'erro_banco' });
  strictEqual(enviados.length, 0);
});

Deno.test('avisarMensagem: token que a Expo diz que não existe mais sai da tabela', async () => {
  const { d, removidos } = dep({
    enviar: async () => ({ ok: true, json: { data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] } }),
  });
  const r = await avisarMensagem(d, { beneficiaryId: B, messageId: M, kind: 'texto', text: 'Oi' });
  strictEqual(r.tipo, 'enviado');
  deepStrictEqual(removidos, [['ExponentPushToken[b]']]);
});

Deno.test('avisarMensagem usa o prazo curto pedido (a resposta ao computador não espera)', async () => {
  let prazo = 0;
  const { d } = dep({
    prazoMs: 1234,
    enviar: async (corpo, ms) => {
      prazo = ms;
      return { ok: true, json: { data: corpo.map(() => ({ status: 'ok' })) } };
    },
  });
  await avisarMensagem(d, { beneficiaryId: B, messageId: M, kind: 'texto', text: 'Oi' });
  strictEqual(prazo, 1234);
});

Deno.test('emSegundoPlano entrega a promessa ao EdgeRuntime.waitUntil, sem rejeição solta', async () => {
  const entregues: Promise<unknown>[] = [];
  emSegundoPlano(Promise.reject(new Error('x')), { waitUntil: (p: Promise<unknown>) => entregues.push(p) });
  strictEqual(entregues.length, 1);
  strictEqual(await entregues[0], undefined);
  // Sem EdgeRuntime (testes, deno run): só corre solta, sem lançar.
  emSegundoPlano(Promise.resolve(1), undefined);
});
