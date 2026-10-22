/**
 * Dias e semanas no horário de Brasília.
 *
 * A evolução semanal e a folha da consulta agrupam o que o paciente fez por DIA
 * e por SEMANA, e quem lê é o médico, no horário dele. Uma fala às 23h30 de
 * domingo (02h30 UTC de segunda) tem de contar no domingo; e o computador pode
 * estar configurado em qualquer fuso — por isso o dia sai SEMPRE do fuso de
 * Brasília, nunca do relógio local (`getDate`) nem do UTC (`toISOString`).
 *
 * Depois que o instante vira um dia `AAAA-MM-DD`, o resto é conta de calendário
 * em UTC puro, que não tem horário de verão nem fuso para atrapalhar.
 */

export const FUSO_DE_BRASILIA = 'America/Sao_Paulo';

let formatador: Intl.DateTimeFormat | null = null;
const formatadorDeDia = (): Intl.DateTimeFormat =>
  (formatador ??= new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_DE_BRASILIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }));

const FORMATO_DO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `AAAA-MM-DD` é um dia que existe no calendário? */
export function ehDia(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const m = FORMATO_DO_DIA.exec(valor);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** O dia (`AAAA-MM-DD`) do instante no fuso de Brasília; `null` se não for uma data. */
export function diaDeBrasilia(instante: number | string | Date): string | null {
  const ms = instante instanceof Date ? instante.getTime() : typeof instante === 'number' ? instante : Date.parse(instante);
  if (!Number.isFinite(ms)) return null;
  try {
    const partes = formatadorDeDia().formatToParts(new Date(ms));
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
    const ano = parte('year');
    const mes = parte('month');
    const dia = parte('day');
    return ano && mes && dia ? `${ano}-${mes}-${dia}` : null;
  } catch {
    // Fora do intervalo que o `Date` representa.
    return null;
  }
}

function emUtc(dia: string): number {
  const m = FORMATO_DO_DIA.exec(dia)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** `dia` mais `n` dias (negativo volta). Conta de calendário. */
export function somarDias(dia: string, n: number): string {
  return new Date(emUtc(dia) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Dias de `a` até `b` (positivo quando `b` é depois). */
export function diasEntre(a: string, b: string): number {
  return Math.round((emUtc(b) - emUtc(a)) / 86_400_000);
}

/** A segunda-feira da semana do dia: a semana vai de segunda a domingo. */
export function segundaDaSemana(dia: string): string {
  const diaDaSemana = new Date(emUtc(dia)).getUTCDay(); // 0 = domingo
  return somarDias(dia, -((diaDaSemana + 6) % 7));
}

export const DIAS_DA_SEMANA_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** "seg", "ter"… do dia. */
export function diaDaSemanaCurto(dia: string): string {
  return DIAS_DA_SEMANA_CURTOS[new Date(emUtc(dia)).getUTCDay()];
}

/** `DD/MM`, ou `DD/MM/AAAA` com o ano. */
export function rotuloDoDia(dia: string, comAno = false): string {
  const [ano, mes, d] = dia.split('-');
  return comAno ? `${d}/${mes}/${ano}` : `${d}/${mes}`;
}
