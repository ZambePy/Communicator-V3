// Testes do limite de avisos no servidor (decisão 2 da rodada 3, 21/10/2026).
//   deno test supabase/functions/desktop-sync/
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import {
  type ArgumentosDoAviso,
  type DependenciasDoLimite,
  type EntradaDoAviso,
  passaPeloLimite,
  pedidoComLimite,
  registroComIntervalo,
} from './limites.ts';
import type { ResumoDoPush } from './push.ts';

const COMPUTADOR = 'c1c1c1c1-0000-4000-8000-000000000001';
const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const SESSAO = '9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f';
const AGORA = new Date('2026-10-21T17:03:00Z'); // 14:03 em Brasília

type Cenario = {
  banco?: { data: unknown; error: { message: string; code?: string | null } | null };
  push?: ResumoDoPush;
  celulares?: number | null;
};

function montar(c: Cenario = {}) {
  const chamadas = {
    registrar: [] as ArgumentosDoAviso[],
    avisar: [] as Array<[string, string, string]>,
    celulares: 0,
    logs: [] as Array<[string, string]>,
  };
  const dep: DependenciasDoLimite = {
    registrar: async (args) => {
      chamadas.registrar.push(args);
      return c.banco ?? { data: { ok: true, id: ID }, error: null };
    },
    avisar: async (kind, corpo, id) => {
      chamadas.avisar.push([kind, corpo, id]);
      return c.push ?? { avisados: 2, recusados: 0, motivos: [], tokensInvalidos: [] };
    },
    celulares: async () => {
      chamadas.celulares++;
      return c.celulares === undefined ? 1 : c.celulares;
    },
    registrarLog: (chave, linha) => chamadas.logs.push([chave, linha]),
  };
  return { dep, chamadas };
}

function pedido(kind: string, extra: Partial<EntradaDoAviso> = {}): EntradaDoAviso {
  return {
    deviceId: COMPUTADOR,
    kind,
    message: 'Está chamando você',
    sessionId: SESSAO,
    quando: AGORA.toISOString(),
    id: ID,
    agora: AGORA,
    ...extra,
  };
}

Deno.test('o socorro nunca passa pelo limite: nem chega à função do banco', async () => {
  const { dep, chamadas } = montar();
  deepStrictEqual(await pedidoComLimite(pedido('emergencia'), dep), { tipo: 'direto' });
  strictEqual(chamadas.registrar.length, 0);
  strictEqual(chamadas.avisar.length, 0);
  strictEqual(chamadas.celulares, 0);
  strictEqual(passaPeloLimite('emergencia'), false);
});

Deno.test('só a ajuda e o aviso de dispositivo passam pelo limite; postura, fadiga e recalibração seguem direto', async () => {
  strictEqual(passaPeloLimite('ajuda'), true);
  strictEqual(passaPeloLimite('dispositivo'), true);
  for (const kind of ['postura', 'fadiga', 'recalibracao']) {
    const { dep, chamadas } = montar();
    strictEqual(passaPeloLimite(kind), false, kind);
    deepStrictEqual(await pedidoComLimite(pedido(kind), dep), { tipo: 'direto' }, kind);
    strictEqual(chamadas.registrar.length, 0, kind);
  }
});

Deno.test('ajuda: a função do banco recebe o computador, o tipo, o texto, a sessão, a hora do evento e o id do computador', async () => {
  const { dep, chamadas } = montar();
  const r = await pedidoComLimite(pedido('ajuda', { quando: '2026-10-21T17:02:30.000Z' }), dep);
  deepStrictEqual(chamadas.registrar, [{
    p_device_id: COMPUTADOR,
    p_kind: 'ajuda',
    p_message: 'Está chamando você',
    p_session_id: SESSAO,
    p_created_at: '2026-10-21T17:02:30.000Z',
    p_id: ID,
  }]);
  // Gravado: o push sai com o id do pedido, e a resposta diz quantos celulares foram avisados.
  deepStrictEqual(chamadas.avisar, [['ajuda', 'Está chamando você', ID]]);
  deepStrictEqual(r, { tipo: 'resposta', status: 200, corpo: { ok: true, id: ID, push: { avisados: 2, recusados: 0, motivos: [] } } });
});

Deno.test('aviso de dispositivo sem sessão e sem id do computador: a função recebe null, e o push sai com o id do servidor', async () => {
  const doServidor = 'aaaaaaaa-0000-4000-8000-000000000009';
  const { dep, chamadas } = montar({
    banco: { data: { ok: true, id: doServidor }, error: null },
    push: { avisados: 0, recusados: 1, motivos: ['InvalidCredentials'], tokensInvalidos: [] },
  });
  const r = await pedidoComLimite(pedido('dispositivo', { sessionId: null, id: null, message: 'A câmera parou' }), dep);
  strictEqual(chamadas.registrar[0].p_session_id, null);
  strictEqual(chamadas.registrar[0].p_id, null);
  deepStrictEqual(chamadas.avisar, [['dispositivo', 'A câmera parou', doServidor]]);
  deepStrictEqual(r, {
    tipo: 'resposta',
    status: 200,
    corpo: { ok: true, id: doServidor, push: { avisados: 0, recusados: 1, motivos: ['InvalidCredentials'] } },
  });
});

Deno.test('acima do limite: nada é avisado, e o computador lê "nenhum celular avisado" (sem_push), não "enviado"', async () => {
  for (const kind of ['ajuda', 'dispositivo']) {
    const { dep, chamadas } = montar({ banco: { data: { ok: false, motivo: 'limite' }, error: null } });
    const r = await pedidoComLimite(pedido(kind), dep);
    // `push.avisados: 0` → `sem_push` em frontend/src/cloud/eventos.ts: a tela
    // diz que nenhum celular foi avisado e o alarme toca no computador. Sem o
    // campo, o computador entenderia "o celular do cuidador foi avisado".
    deepStrictEqual(r, {
      tipo: 'resposta',
      status: 200,
      corpo: { ok: true, limitado: true, push: { avisados: 0, recusados: 0, motivos: ['limite'] } },
    }, kind);
    strictEqual(chamadas.avisar.length, 0, kind);
    deepStrictEqual(chamadas.logs.map(([chave]) => chave), [`limite:${kind}`], kind);
  }
});

Deno.test('reenvio de um pedido já gravado: sem segundo push; a resposta diz só o que se sabe do push', async () => {
  const semCelular = montar({ banco: { data: { ok: true, id: ID, repetido: true, kind: 'ajuda' }, error: null }, celulares: 0 });
  deepStrictEqual(await pedidoComLimite(pedido('ajuda'), semCelular.dep), {
    tipo: 'resposta',
    status: 200,
    corpo: { ok: true, id: ID, repetido: true, push: { avisados: 0, recusados: 0, motivos: ['sem_celular'] } },
  });
  strictEqual(semCelular.chamadas.avisar.length, 0);

  // Com celular cadastrado, o servidor não sabe se o push do primeiro envio foi aceito.
  const comCelular = montar({ banco: { data: { ok: true, id: ID, repetido: true, kind: 'ajuda' }, error: null }, celulares: 2 });
  deepStrictEqual(await pedidoComLimite(pedido('ajuda'), comCelular.dep), {
    tipo: 'resposta',
    status: 200,
    corpo: { ok: true, id: ID, repetido: true, push: null },
  });
  strictEqual(comCelular.chamadas.avisar.length, 0);
});

Deno.test('reenvio: vale o tipo GRAVADO — um id de pedido de postura não ganha campo de push', async () => {
  const { dep, chamadas } = montar({ banco: { data: { ok: true, id: ID, repetido: true, kind: 'postura' }, error: null } });
  deepStrictEqual(await pedidoComLimite(pedido('ajuda'), dep), { tipo: 'resposta', status: 200, corpo: { ok: true, id: ID, repetido: true } });
  strictEqual(chamadas.celulares, 0);
  strictEqual(chamadas.avisar.length, 0);
});

Deno.test('pedido que chegou com atraso (fila offline): o push diz a hora em que foi feito', async () => {
  const { dep, chamadas } = montar();
  await pedidoComLimite(pedido('ajuda', { quando: '2026-10-21T16:53:00.000Z' }), dep);
  deepStrictEqual(chamadas.avisar, [['ajuda', 'Está chamando você — pedido às 13:53, chegou com atraso', ID]]);
});

Deno.test('a função ainda não existe no banco (migração não aplicada): segue o caminho de antes, com um aviso no log', async () => {
  for (const code of ['PGRST202', '42883']) {
    const { dep, chamadas } = montar({ banco: { data: null, error: { message: 'Could not find the function', code } } });
    deepStrictEqual(await pedidoComLimite(pedido('ajuda'), dep), { tipo: 'funcao_ausente' }, code);
    strictEqual(chamadas.avisar.length, 0, code);
    deepStrictEqual(chamadas.logs.map(([chave]) => chave), ['funcao_ausente'], code);
  }
});

Deno.test('erro do banco: 503 quando passageiro (o computador reenvia), 400 quando o conteúdo é inválido; nada avisado', async () => {
  for (const [code, status] of [['57014', 503], ['08006', 503], ['', 503], ['22P02', 400], ['23503', 400]] as const) {
    const { dep, chamadas } = montar({ banco: { data: null, error: { message: `erro ${code}`, code } } });
    deepStrictEqual(await pedidoComLimite(pedido('ajuda'), dep), { tipo: 'resposta', status, corpo: { error: `erro ${code}` } }, code);
    strictEqual(chamadas.avisar.length, 0, code);
  }
});

Deno.test('computador desvinculado entre a conferência da chave e a gravação: 403 device_revoked, sem push', async () => {
  const { dep, chamadas } = montar({ banco: { data: { ok: false, motivo: 'computador_desvinculado' }, error: null } });
  deepStrictEqual(await pedidoComLimite(pedido('ajuda'), dep), { tipo: 'resposta', status: 403, corpo: { error: 'device_revoked' } });
  strictEqual(chamadas.avisar.length, 0);
});

Deno.test('resposta estranha do banco: 503 (o computador tenta de novo), sem push e com uma linha no log', async () => {
  for (const estranho of [null, 'texto', {}, { ok: true }, { ok: true, id: 42 }, { ok: false }, { ok: false, motivo: 'outro' }]) {
    const { dep, chamadas } = montar({ banco: { data: estranho, error: null } });
    deepStrictEqual(
      await pedidoComLimite(pedido('ajuda'), dep),
      { tipo: 'resposta', status: 503, corpo: { error: 'servico_indisponivel' } },
      JSON.stringify(estranho),
    );
    strictEqual(chamadas.avisar.length, 0);
    strictEqual(chamadas.logs.length, 1);
  }
});

Deno.test('log com intervalo: no máximo uma linha por motivo a cada minuto (uma chave roubada não enche o console)', () => {
  const linhas: string[] = [];
  const registrar = registroComIntervalo(60_000, (l) => linhas.push(l));
  registrar('limite:ajuda', 'a', 0);
  registrar('limite:ajuda', 'b', 59_999);
  registrar('limite:dispositivo', 'c', 30_000);
  registrar('limite:ajuda', 'd', 60_000);
  deepStrictEqual(linhas, ['a', 'c', 'd']);
});
