// Testes do push do cuidador.
//   deno test supabase/functions/desktop-sync/
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { exigeAcao, mensagensDePush } from './push.ts';

const B = '9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f';

Deno.test('socorro e ajuda: prioridade que passa pelo modo Foco do iOS e canal de emergência', () => {
  for (const kind of ['emergencia', 'ajuda']) {
    const [m] = mensagensDePush(['ExponentPushToken[a]'], kind, 'Dona Maria', 'preciso de ajuda', B);
    strictEqual(m.interruptionLevel, 'time-sensitive');
    strictEqual(m.channelId, 'emergencia');
    strictEqual(m.priority, 'high');
    strictEqual(m.sound, 'default');
  }
});

Deno.test('avisos de sistema não furam o modo Foco', () => {
  for (const kind of ['postura', 'fadiga', 'recalibracao', 'dispositivo', 'desconhecido']) {
    const [m] = mensagensDePush(['t'], kind, 'Zé', 'x', B);
    strictEqual(m.interruptionLevel, 'active');
    strictEqual(m.channelId, 'default');
  }
  strictEqual(exigeAcao('postura'), false);
});

Deno.test('uma mensagem por celular, com título, nome do paciente e dados do alerta', () => {
  const ms = mensagensDePush(['t1', 't2'], 'emergencia', 'Vó', 'socorro', B);
  strictEqual(ms.length, 2);
  deepStrictEqual(ms.map((m) => m.to), ['t1', 't2']);
  strictEqual(ms[0].title, '🚨 Pedido de socorro');
  strictEqual(ms[0].body, 'Vó: socorro');
  deepStrictEqual(ms[0].data, { kind: 'emergencia', beneficiary_id: B });
  strictEqual(mensagensDePush(['t'], 'x', 'Vó', 'y', B)[0].title, 'IrisFlow');
});

Deno.test('corpo limitado a 180 caracteres', () => {
  const [m] = mensagensDePush(['t'], 'ajuda', 'Vó', 'a'.repeat(500), B);
  strictEqual(m.body.length, 180);
});

Deno.test('sem celular cadastrado, nenhuma mensagem', () => {
  deepStrictEqual(mensagensDePush([], 'emergencia', 'Vó', 'x', B), []);
});
