/**
 * O que não pôde ser gravado neste computador.
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 15): com o
 * armazenamento cheio ou bloqueado, a calibração (1 a 2 minutos de esforço do
 * paciente), os ajustes (o tempo do olhar) e o histórico deixavam de ser
 * gravados com um aviso só no console — e tudo seguia como se estivesse salvo.
 * Na abertura seguinte não havia calibração e o dwell voltava ao padrão, sem
 * ninguém saber por quê.
 *
 * As gravações devolvem `boolean` e registram aqui o que falhou; o
 * `AvisoDeGravacao` mostra, de forma calma, "não foi possível salvar". Uma
 * gravação que volta a dar certo tira o aviso daquele item: os três gravam o
 * conteúdo INTEIRO a cada vez, então o sucesso seguinte repõe o que faltava.
 */

export type OQueNaoGravou = 'calibracao' | 'ajustes' | 'historico';

/** Evento na `window` a cada mudança da lista. */
export const EVENTO_DE_FALHA_DE_GRAVACAO = 'irisflow:falha-de-gravacao';

const pendentes = new Set<OQueNaoGravou>();
/** Já vistas (o cuidador tocou em "Entendi") enquanto continuam falhando. */
const dispensadas = new Set<OQueNaoGravou>();
/** Console: no máximo uma linha por item a cada minuto, não uma por gravação. */
const ultimoLog = new Map<OQueNaoGravou, number>();
const INTERVALO_DO_LOG_MS = 60_000;

function notificar(): void {
  if (typeof window === 'undefined') return;
  // Fora do fluxo de quem gravou: uma gravação pode acontecer no meio de uma
  // atualização de estado do React, e o aviso não pode re-renderizar nada ali.
  const disparar = () => window.dispatchEvent(new Event(EVENTO_DE_FALHA_DE_GRAVACAO));
  if (typeof queueMicrotask === 'function') queueMicrotask(disparar);
  else void Promise.resolve().then(disparar);
}

export function registrarFalhaDeGravacao(oque: OQueNaoGravou, erro?: unknown): void {
  const agora = Date.now();
  if (agora - (ultimoLog.get(oque) ?? -Infinity) >= INTERVALO_DO_LOG_MS) {
    ultimoLog.set(oque, agora);
    console.warn(`[gravacao] não foi possível salvar (${oque}) neste computador:`, erro ?? '');
  }
  if (pendentes.has(oque)) return;
  pendentes.add(oque);
  notificar();
}

export function registrarGravacaoOk(oque: OQueNaoGravou): void {
  // Voltou a gravar: uma falha futura merece aviso de novo.
  dispensadas.delete(oque);
  if (!pendentes.delete(oque)) return;
  notificar();
}

/** O que o aviso deve mostrar agora (falhando e ainda não visto). */
export function falhasDeGravacaoVisiveis(): OQueNaoGravou[] {
  return (['calibracao', 'ajustes', 'historico'] as const).filter((o) => pendentes.has(o) && !dispensadas.has(o));
}

/** "Entendi": o aviso some até um item NOVO falhar (ou um item voltar a falhar depois de gravar). */
export function dispensarFalhasDeGravacao(): void {
  for (const o of pendentes) dispensadas.add(o);
  notificar();
}

/** Só para testes. */
export function _redefinirFalhasDeGravacao(): void {
  pendentes.clear();
  dispensadas.clear();
  ultimoLog.clear();
}
