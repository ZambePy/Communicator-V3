// Horário dos eventos que o desktop manda para a `desktop-sync`.
//
// O desktop carimba cada fala, pedido de ajuda, resultado de calibração, fim
// de sessão e confirmação de mensagem falada com o instante em que aconteceu
// (`occurred_at`). Quando a rede cai, o evento espera na fila offline e pode
// chegar horas depois: sem o carimbo, um socorro de 3 h atrás apareceria no
// celular do cuidador como se fosse agora.
//
// O relógio do computador não é confiável por princípio (bateria do BIOS,
// sincronização desligada). Por isso o desktop manda também `sent_at`, o
// relógio dele no instante do envio: o que vale é o ATRASO medido no próprio
// computador (sent_at − occurred_at), descontado da hora do servidor. Um
// relógio adiantado ou atrasado entra nas duas pontas e se cancela — sem
// isso, um PC 10 min atrasado faria todo socorro ao vivo parecer "atrasado".
//
// Atraso plausível: até 24 h (e até 5 min negativo, um ajuste de hora no
// meio do caminho). Sem `sent_at`, vale o horário informado se estiver na
// janela de 5 min no futuro a 24 h no passado. Fora disso — ou sem
// `occurred_at`, como nos desktops antigos — vale a hora do servidor.
//
// Módulo puro, sem APIs do Deno: é importado pela função e pelos testes.

/** Relógio do computador adiantado até este tanto ainda é aceito. */
export const TOLERANCIA_FUTURO_MS = 5 * 60_000;

/** Evento mais antigo que isto não tem o horário aceito (vira a hora do servidor). */
export const IDADE_MAXIMA_MS = 24 * 60 * 60_000;

/** A partir deste atraso, vale dizer ao cuidador quando o pedido aconteceu. */
export const ATRASO_RELEVANTE_MS = 2 * 60_000;

/** Milissegundos de uma data ISO válida, ou null. */
function instante(valor: unknown): number | null {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const t = Date.parse(valor);
  return Number.isFinite(t) ? t : null;
}

/**
 * Horário a gravar como o do evento (ISO 8601, UTC).
 *
 * - `informado` (occurred_at) e `enviadoEm` (sent_at), os dois no relógio do
 *   computador: `agora` menos o atraso entre eles, se o atraso for plausível.
 * - Só `informado`: ele mesmo, se estiver na janela plausível.
 * - Nada disso, ou fora dos limites: `agora`.
 */
export function horarioDoEvento(informado: unknown, enviadoEm: unknown, agora: Date = new Date()): string {
  const t = instante(informado);
  if (t === null) return agora.toISOString();
  const agoraMs = agora.getTime();
  const envio = instante(enviadoEm);
  if (envio !== null) {
    const atraso = envio - t;
    if (atraso < -TOLERANCIA_FUTURO_MS || atraso > IDADE_MAXIMA_MS) return agora.toISOString();
    return new Date(agoraMs - Math.max(0, atraso)).toISOString();
  }
  if (t > agoraMs + TOLERANCIA_FUTURO_MS || t < agoraMs - IDADE_MAXIMA_MS) return agora.toISOString();
  return new Date(t).toISOString();
}

/** O evento aconteceu tempo o bastante antes de chegar para valer a pena dizer? */
export function chegouComAtraso(horarioIso: string, agora: Date = new Date()): boolean {
  const t = Date.parse(horarioIso);
  return Number.isFinite(t) && agora.getTime() - t >= ATRASO_RELEVANTE_MS;
}

/** "14:03" no horário de Brasília — o que o cuidador lê na notificação. */
export function horaDeBrasilia(horarioIso: string): string {
  return new Date(horarioIso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}
