// Sim / Não por piscada LONGA (pedido de 18/10/2026: "modo sim/não por olhar
// lateral ou piscadas longas", parte do Plano B quando o olhar piora).
//
// O código é o que equipes de ELA já usam à beira do leito: UMA piscada longa
// = SIM, DUAS piscadas longas = NÃO. Longa, e não comum, porque a piscada
// espontânea (100–400 ms) acontece 15 a 20 vezes por minuto sem decidir nada.
//
// Guardas (mesma filosofia do `blinkClick.ts`):
//   1. Duração MÍNIMA (`piscadaMinMs`, padrão 700 ms; ajustável): abaixo, é
//      piscada espontânea e não conta.
//   2. Duração MÁXIMA (`PISCADA_MAX_MS`): acima, é olho fechado — descanso,
//      cochilo — e não resposta. Sem teto, reabrir os olhos depois de dormir
//      responderia "sim".
//   3. Janela para a segunda (`JANELA_DA_SEGUNDA_MS`): depois da primeira
//      piscada longa, espera a segunda por um tempo; sem ela, decide SIM.
//   4. Período refratário depois de cada resposta: uma rajada não vira duas
//      respostas.
//   5. Sem informação (rosto perdido, contraluz): o episódio em curso é
//      descartado. Olho fechado costuma derrubar a detecção do rosto, e uma
//      "piscada" que termina sem rosto não pode virar resposta.
//
// Puro: recebe uma amostra por quadro e devolve o novo estado e a resposta.

export const PISCADA_MIN_PADRAO_MS = 700;
export const PISCADA_MIN_MS = 400;
export const PISCADA_MAX_MS = 2500;
export const JANELA_DA_SEGUNDA_MS = 2500;
export const REFRATARIO_MS = 1500;

export interface EstadoSimNao {
  fechadoDesde: number | null;
  /** Piscadas longas já contadas nesta resposta. */
  longas: number;
  /** Fim da última piscada longa contada (a janela da segunda conta daqui). */
  ultimaLongaFim: number | null;
  refratarioAte: number;
}

export type RespostaSimNao = 'sim' | 'nao';

export interface AmostraSimNao {
  /** `true` olho fechado, `false` aberto, `null` sem informação. */
  fechado: boolean | null;
  nowMs: number;
}

export function criarEstadoSimNao(): EstadoSimNao {
  return { fechadoDesde: null, longas: 0, ultimaLongaFim: null, refratarioAte: 0 };
}

export function limitarPiscadaMin(ms: number | null | undefined): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return PISCADA_MIN_PADRAO_MS;
  return Math.min(PISCADA_MAX_MS - 500, Math.max(PISCADA_MIN_MS, Math.round(ms)));
}

export function passoSimNao(
  e: EstadoSimNao,
  a: AmostraSimNao,
  piscadaMinMs = PISCADA_MIN_PADRAO_MS,
): { estado: EstadoSimNao; resposta: RespostaSimNao | null } {
  const min = limitarPiscadaMin(piscadaMinMs);

  // Sem informação: descarta o episódio em curso (ver a guarda 5). As longas
  // já contadas continuam valendo — a decisão sai pela janela.
  if (a.fechado === null) {
    const s = { ...e, fechadoDesde: null };
    return decidirPelaJanela(s, a.nowMs);
  }

  if (a.fechado) {
    if (e.fechadoDesde === null) return { estado: { ...e, fechadoDesde: a.nowMs }, resposta: null };
    // Fechado há mais que o teto: esta já não pode ser a segunda piscada, e a
    // primeira não precisa esperar o olho reabrir para valer.
    return decidirPelaJanela(e, a.nowMs);
  }

  // Olho aberto.
  if (e.fechadoDesde !== null) {
    const duracao = a.nowMs - e.fechadoDesde;
    const aberto = { ...e, fechadoDesde: null };
    if (a.nowMs < e.refratarioAte) return { estado: aberto, resposta: null };
    if (duracao >= min && duracao <= PISCADA_MAX_MS) {
      const longas = e.longas + 1;
      if (longas >= 2) {
        return { estado: { ...criarEstadoSimNao(), refratarioAte: a.nowMs + REFRATARIO_MS }, resposta: 'nao' };
      }
      return { estado: { ...aberto, longas, ultimaLongaFim: a.nowMs }, resposta: null };
    }
    // Curta (espontânea) ou longa demais (olho fechado): não conta.
    return decidirPelaJanela(aberto, a.nowMs);
  }
  return decidirPelaJanela(e, a.nowMs);
}

function decidirPelaJanela(e: EstadoSimNao, nowMs: number): { estado: EstadoSimNao; resposta: RespostaSimNao | null } {
  // Uma longa contada e a janela da segunda venceu, sem outra piscada que
  // ainda possa valer em curso: SIM.
  const outraEmCurso = e.fechadoDesde !== null && nowMs - e.fechadoDesde <= PISCADA_MAX_MS;
  if (e.longas === 1 && e.ultimaLongaFim !== null && !outraEmCurso && nowMs - e.ultimaLongaFim >= JANELA_DA_SEGUNDA_MS) {
    // Olho ainda fechado (descanso): o episódio continua contando do começo
    // real, para que reabrir depois não pareça uma piscada nova.
    return { estado: { ...criarEstadoSimNao(), refratarioAte: nowMs + REFRATARIO_MS, fechadoDesde: e.fechadoDesde }, resposta: 'sim' };
  }
  return { estado: e, resposta: null };
}
