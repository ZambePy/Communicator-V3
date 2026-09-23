// Testes do horário dos eventos da desktop-sync.
//   deno test supabase/functions/desktop-sync/
// (Não entram no deploy: `supabase functions deploy` empacota só o que o
// index.ts importa.)
import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import {
  ATRASO_RELEVANTE_MS,
  IDADE_MAXIMA_MS,
  TOLERANCIA_FUTURO_MS,
  chegouComAtraso,
  horaDeBrasilia,
  horarioDoEvento,
} from './horario.ts';

const AGORA = new Date('2026-09-23T15:00:00.000Z');
const menos = (ms: number) => new Date(AGORA.getTime() - ms).toISOString();
const mais = (ms: number) => new Date(AGORA.getTime() + ms).toISOString();

Deno.test('sem o campo (desktop antigo) vale a hora do servidor', () => {
  strictEqual(horarioDoEvento(undefined, undefined, AGORA), AGORA.toISOString());
  strictEqual(horarioDoEvento(null, null, AGORA), AGORA.toISOString());
  strictEqual(horarioDoEvento('', '', AGORA), AGORA.toISOString());
  strictEqual(horarioDoEvento(1790000000000, undefined, AGORA), AGORA.toISOString());
});

Deno.test('lixo não vira data: vale a hora do servidor', () => {
  strictEqual(horarioDoEvento('ontem à noite', undefined, AGORA), AGORA.toISOString());
  strictEqual(horarioDoEvento('2026-99-99T99:99:99Z', AGORA.toISOString(), AGORA), AGORA.toISOString());
});

// ---- com sent_at (o que o desktop atual manda): vale o atraso medido no PC ----

Deno.test('evento da fila offline: hora do servidor menos o atraso medido no computador', () => {
  // relógio do PC certo: enviado agora, aconteceu há 3 h
  strictEqual(horarioDoEvento(menos(3 * 3600_000), AGORA.toISOString(), AGORA), menos(3 * 3600_000));
});

Deno.test('relógio do computador errado se cancela: 20 min atrasado ou 2 h adiantado', () => {
  const atrasado = 20 * 60_000;
  // ao vivo: aconteceu e saiu no mesmo instante do relógio (errado) do PC
  strictEqual(horarioDoEvento(menos(atrasado), menos(atrasado), AGORA), AGORA.toISOString());
  // 3 h na fila, relógio 20 min atrasado
  strictEqual(horarioDoEvento(menos(atrasado + 3 * 3600_000), menos(atrasado), AGORA), menos(3 * 3600_000));
  // relógio 2 h adiantado (a janela absoluta recusaria), 10 min na fila
  const adiantado = 2 * 3600_000;
  strictEqual(horarioDoEvento(mais(adiantado - 10 * 60_000), mais(adiantado), AGORA), menos(10 * 60_000));
});

Deno.test('atraso fora do plausível vale a hora do servidor', () => {
  // mais de 24 h na fila
  strictEqual(horarioDoEvento(menos(IDADE_MAXIMA_MS + 1000), AGORA.toISOString(), AGORA), AGORA.toISOString());
  // "enviado" muito antes de acontecer (relógio voltou mais de 5 min no meio)
  strictEqual(horarioDoEvento(AGORA.toISOString(), menos(TOLERANCIA_FUTURO_MS + 1000), AGORA), AGORA.toISOString());
  // voltou menos de 5 min: conta como atraso zero
  strictEqual(horarioDoEvento(AGORA.toISOString(), menos(60_000), AGORA), AGORA.toISOString());
});

// ---- sem sent_at: janela absoluta ----

Deno.test('só occurred_at: dentro de 24 h mantém o horário real', () => {
  strictEqual(horarioDoEvento(menos(3 * 3600_000), undefined, AGORA), menos(3 * 3600_000));
  strictEqual(horarioDoEvento(menos(IDADE_MAXIMA_MS - 1000), 'não é data', AGORA), menos(IDADE_MAXIMA_MS - 1000));
});

Deno.test('só occurred_at: mais antigo que 24 h não é plausível', () => {
  strictEqual(horarioDoEvento(menos(IDADE_MAXIMA_MS + 1000), undefined, AGORA), AGORA.toISOString());
});

Deno.test('só occurred_at: relógio adiantado até 5 min é aceito; além disso, não', () => {
  strictEqual(horarioDoEvento(mais(TOLERANCIA_FUTURO_MS - 1000), undefined, AGORA), mais(TOLERANCIA_FUTURO_MS - 1000));
  strictEqual(horarioDoEvento(mais(TOLERANCIA_FUTURO_MS + 1000), undefined, AGORA), AGORA.toISOString());
});

Deno.test('normaliza para ISO em UTC', () => {
  strictEqual(horarioDoEvento('2026-09-23T11:30:00-03:00', undefined, AGORA), '2026-09-23T14:30:00.000Z');
});

Deno.test('atraso relevante a partir de 2 min', () => {
  deepStrictEqual(
    [chegouComAtraso(menos(ATRASO_RELEVANTE_MS - 1000), AGORA), chegouComAtraso(menos(ATRASO_RELEVANTE_MS), AGORA)],
    [false, true],
  );
  strictEqual(chegouComAtraso('não é data', AGORA), false);
});

Deno.test('hora curta no horário de Brasília', () => {
  strictEqual(horaDeBrasilia('2026-09-23T14:30:00.000Z'), '11:30');
});
