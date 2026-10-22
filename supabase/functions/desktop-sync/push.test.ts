// Testes do push do cuidador.
//   deno test supabase/functions/desktop-sync/
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { avisaPorPush, celularesParaAvisar, exigeAcao, mensagensDePush, pushDoReenvio, resumoDosTickets, type DependenciasDosCelulares } from './push.ts';

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

Deno.test('o pedido leva o próprio id nos dados do push (o app abre ESTE pedido)', () => {
  const [m] = mensagensDePush(['t'], 'emergencia', 'Vó', 'x', B, 'hr-1');
  deepStrictEqual(m.data, { kind: 'emergencia', beneficiary_id: B, help_request_id: 'hr-1' });
});

Deno.test('dispositivo vai por push (canal comum); postura, fadiga e recalibração não', () => {
  strictEqual(avisaPorPush('emergencia'), true);
  strictEqual(avisaPorPush('ajuda'), true);
  strictEqual(avisaPorPush('dispositivo'), true);
  for (const k of ['postura', 'fadiga', 'recalibracao', 'x']) strictEqual(avisaPorPush(k), false);
});

Deno.test('resumo dos tickets: aceitos, recusados, motivos e tokens que não existem mais', () => {
  const r = resumoDosTickets(['a', 'b', 'c'], { data: [
    { status: 'ok', id: '1' },
    { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } },
    { status: 'error', message: 'cred', details: { error: 'InvalidCredentials' } },
  ] });
  deepStrictEqual(r, { avisados: 1, recusados: 2, motivos: ['DeviceNotRegistered', 'InvalidCredentials'], tokensInvalidos: ['b'] });
});

Deno.test('pedido inteiro recusado pela Expo, ou HTTP de erro: ninguém foi avisado', () => {
  deepStrictEqual(
    resumoDosTickets(['a', 'b'], { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: 'm' }] }),
    { avisados: 0, recusados: 2, motivos: ['PUSH_TOO_MANY_EXPERIENCE_IDS'], tokensInvalidos: [] },
  );
  deepStrictEqual(resumoDosTickets(['a'], null, false), { avisados: 0, recusados: 1, motivos: ['http'], tokensInvalidos: [] });
});

// Revisão de UX de 19/10/2026 (achado 13): o reenvio (`repetido`) voltava sem
// dado de push, e o computador entendia "o celular do cuidador foi avisado".
Deno.test('reenvio de um pedido já gravado, sem celular cadastrado: ninguém foi avisado', () => {
  deepStrictEqual(pushDoReenvio('emergencia', 0), { avisados: 0, recusados: 0, motivos: ['sem_celular'] });
  deepStrictEqual(pushDoReenvio('ajuda', 0), { avisados: 0, recusados: 0, motivos: ['sem_celular'] });
});

Deno.test('reenvio com celular cadastrado, ou sem conseguir conferir: o servidor não sabe do primeiro push (null)', () => {
  // O resultado do push do primeiro envio não fica gravado: dizer "avisado"
  // seria inventar. O computador trata `null` como "gravado, sem confirmação".
  strictEqual(pushDoReenvio('emergencia', 2), null);
  strictEqual(pushDoReenvio('emergencia', null), null);
  strictEqual(pushDoReenvio('dispositivo', 1), null);
});

Deno.test('reenvio de aviso que não vai por push: a resposta continua sem o campo', () => {
  strictEqual(pushDoReenvio('postura', 0), undefined);
  strictEqual(pushDoReenvio('recalibracao', null), undefined);
});


// Revisão final de 22/10/2026 (R3): `notifyCaregiver` lia o paciente e os
// celulares sem olhar o `error`. Um soluço do banco virava "sem celular" —
// sem rastro no log e sem segunda tentativa, e o push do socorro só saía no
// escalonamento, 45 s depois. Agora uma falha de leitura tem uma segunda
// tentativa e, se persistir, é "erro" (não "sem celular").
type Leitura = { data: unknown; error: { message: string; code?: string | null } | null };

function leituras(beneficiario: Leitura[], tokens: Leitura[]) {
  const chamadas = { beneficiario: 0, tokens: 0, esperas: [] as number[], perfis: [] as string[] };
  const dep: DependenciasDosCelulares = {
    beneficiario: () => {
      const r = beneficiario[Math.min(chamadas.beneficiario++, beneficiario.length - 1)];
      return Promise.resolve(r as never);
    },
    tokens: (perfil) => {
      chamadas.perfis.push(perfil);
      const r = tokens[Math.min(chamadas.tokens++, tokens.length - 1)];
      return Promise.resolve(r as never);
    },
    esperar: (ms) => {
      chamadas.esperas.push(ms);
      return Promise.resolve();
    },
  };
  return { dep, chamadas };
}

const BEN: Leitura = { data: { profile_id: 'p1', user_name: 'Dona Maria' }, error: null };
const FALHA: Leitura = { data: null, error: { message: 'timeout', code: '57014' } };

Deno.test('celulares: paciente e celulares lidos de primeira, sem espera nenhuma', async () => {
  const { dep, chamadas } = leituras([BEN], [{ data: [{ token: 'a' }, { token: 'b' }], error: null }]);
  deepStrictEqual(await celularesParaAvisar(dep), { tipo: 'ok', nome: 'Dona Maria', tokens: ['a', 'b'] });
  deepStrictEqual(chamadas.perfis, ['p1']);
  deepStrictEqual(chamadas.esperas, []);
});

Deno.test('celulares: sem paciente ou sem celular é resposta do banco, não falha — sem segunda tentativa', async () => {
  const a = leituras([{ data: null, error: null }], [BEN]);
  deepStrictEqual(await celularesParaAvisar(a.dep), { tipo: 'nenhum', motivo: 'sem_beneficiario' });
  strictEqual(a.chamadas.beneficiario, 1);
  strictEqual(a.chamadas.tokens, 0);
  const b = leituras([BEN], [{ data: [], error: null }]);
  deepStrictEqual(await celularesParaAvisar(b.dep), { tipo: 'nenhum', motivo: 'sem_celular' });
  strictEqual(b.chamadas.tokens, 1);
  const c = leituras([BEN], [{ data: null, error: null }]);
  deepStrictEqual(await celularesParaAvisar(c.dep), { tipo: 'nenhum', motivo: 'sem_celular' });
});

Deno.test('celulares: o soluço do banco na leitura dos celulares tem uma segunda tentativa', async () => {
  const { dep, chamadas } = leituras([BEN], [FALHA, { data: [{ token: 'a' }], error: null }]);
  deepStrictEqual(await celularesParaAvisar(dep), { tipo: 'ok', nome: 'Dona Maria', tokens: ['a'] });
  strictEqual(chamadas.tokens, 2);
  strictEqual(chamadas.esperas.length, 1);
});

Deno.test('celulares: o soluço na leitura do paciente também', async () => {
  const { dep, chamadas } = leituras([FALHA, BEN], [{ data: [{ token: 'a' }], error: null }]);
  deepStrictEqual(await celularesParaAvisar(dep), { tipo: 'ok', nome: 'Dona Maria', tokens: ['a'] });
  strictEqual(chamadas.beneficiario, 2);
});

Deno.test('celulares: falha nas duas tentativas é "erro" com a mensagem — nunca "sem celular"', async () => {
  const a = leituras([BEN], [FALHA]);
  deepStrictEqual(await celularesParaAvisar(a.dep), { tipo: 'erro', mensagem: 'timeout' });
  strictEqual(a.chamadas.tokens, 2);
  const b = leituras([FALHA], [BEN]);
  deepStrictEqual(await celularesParaAvisar(b.dep), { tipo: 'erro', mensagem: 'timeout' });
  strictEqual(b.chamadas.beneficiario, 2);
  strictEqual(b.chamadas.tokens, 0);
});

Deno.test('celulares: leitura que lança vira falha tratada, não exceção para fora', async () => {
  let n = 0;
  const dep: DependenciasDosCelulares = {
    beneficiario: () => {
      n++;
      return Promise.reject(new Error('conexão caiu'));
    },
    tokens: () => Promise.resolve({ data: [], error: null } as never),
    esperar: () => Promise.resolve(),
  };
  const r = await celularesParaAvisar(dep);
  deepStrictEqual(r, { tipo: 'erro', mensagem: 'conexão caiu' });
  strictEqual(n, 2);
});
