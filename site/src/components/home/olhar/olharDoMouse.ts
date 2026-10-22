import type { IdDaTecla } from './maquinaDoTeclado'
import type { Ponto } from './roteiroDoOlhar'

/**
 * Quando a pessoa passa o mouse no teclado da abertura, ela assume: o ponto
 * segue o mouse com o atraso suave de um cursor de olhar, e parar numa tecla
 * pelo tempo de fixação a aciona — com a pausa depois de cada seleção, como no
 * app. Funções puras: o componente chama a cada quadro.
 */

/** Constante de tempo do filtro do cursor, em ms: o ponto alcança ~63 % do caminho nesse tempo. */
export const ATRASO_DO_CURSOR_MS = 90

/** O tempo de fixação, o mesmo da abertura (o atalho "rápido" do app). */
export const FIXACAO_DO_MOUSE_MS = 800

/** A pausa depois de cada seleção (o período refratário do app, 800 ms). */
export const PAUSA_DEPOIS_DA_SELECAO_MS = 800

/**
 * Um passo do filtro exponencial: quanto mais tempo passou, mais perto do
 * mouse. Independente da taxa de quadros (60 ou 120 Hz dão o mesmo caminho).
 */
export function seguirOMouse(atual: Ponto, mouse: Ponto, dtMs: number, atrasoMs = ATRASO_DO_CURSOR_MS): Ponto {
  if (!(dtMs > 0)) return atual
  const k = 1 - Math.exp(-dtMs / atrasoMs)
  return { x: atual.x + (mouse.x - atual.x) * k, y: atual.y + (mouse.y - atual.y) * k }
}

export type Retangulo = { tecla: IdDaTecla; x: number; y: number; largura: number; altura: number }

/** A tecla sob o ponto, se houver. */
export function teclaNoPonto(p: Ponto, retangulos: readonly Retangulo[]): IdDaTecla | null {
  for (const r of retangulos) {
    if (p.x >= r.x && p.x <= r.x + r.largura && p.y >= r.y && p.y <= r.y + r.altura) return r.tecla
  }
  return null
}

export type Permanencia = { tecla: IdDaTecla | null; desde: number; bloqueadaAte: number }

export const SEM_PERMANENCIA: Permanencia = { tecla: null, desde: 0, bloqueadaAte: 0 }

/**
 * Avança a fixação de um quadro. Trocar de tecla recomeça a contagem; sair de
 * todas zera; durante a pausa depois de uma seleção nada conta. Ao completar,
 * dispara uma vez e começa a pausa.
 */
export function avancarPermanencia(
  p: Permanencia,
  tecla: IdDaTecla | null,
  agora: number,
  fixacaoMs = FIXACAO_DO_MOUSE_MS,
  pausaMs = PAUSA_DEPOIS_DA_SELECAO_MS,
): { permanencia: Permanencia; progresso: number; disparou: IdDaTecla | null } {
  const desde = tecla !== p.tecla ? Math.max(agora, p.bloqueadaAte) : Math.max(p.desde, p.bloqueadaAte)
  const proxima: Permanencia = { tecla, desde, bloqueadaAte: p.bloqueadaAte }
  if (!tecla || agora < p.bloqueadaAte) return { permanencia: proxima, progresso: 0, disparou: null }
  const progresso = Math.min(1, Math.max(0, (agora - desde) / fixacaoMs))
  if (progresso < 1) return { permanencia: proxima, progresso, disparou: null }
  return {
    permanencia: { tecla, desde: agora + pausaMs, bloqueadaAte: agora + pausaMs },
    progresso: 1,
    disparou: tecla,
  }
}
