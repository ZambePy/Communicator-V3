/**
 * Problema de rastreamento PERSISTENTE (pedido do dono, 19/10/2026).
 *
 * Um aviso na tela resolve quando há alguém olhando para ela. Quando o
 * paciente está sozinho e o rosto some, a luz da janela muda ou a câmera cai,
 * o aviso fica lá — e ele pode ficar minutos sem conseguir se comunicar. Este
 * módulo diz quando um problema DUROU: o mesmo tipo por mais de
 * `PERSISTENTE_APOS_MS`, fora da calibração e do teste de precisão. É a
 * entrada para avisar o cuidador pela nuvem — o envio é de quem consome
 * (`ouvirProblemaPersistente`); aqui nada sai do computador.
 *
 * Quem informa é o `GazeProvider`, com o MESMO aviso que o banner mostra
 * (`escolherAvisoDoOlhar`): o tipo e o texto calmo dele. Um booleano de módulo,
 * no molde de `estadoDeEmergencia.ts`, e não um Context: o consumidor pode estar
 * fora da árvore do olhar (a nuvem fica ao lado dela).
 *
 * Regras:
 *  - um problema vira persistente quando o MESMO tipo dura mais de 45 s;
 *  - um sumiço curto (até `TOLERANCIA_DE_SUMICO_MS`) não zera a contagem —
 *    numa silhueta contra a janela o rosto some e volta o tempo todo, e sem a
 *    tolerância o cuidador nunca seria avisado justamente nesse caso;
 *  - trocar de tipo encerra o anterior (e o novo conta do zero);
 *  - calibração e teste de precisão SUSPENDEM: a contagem zera e um
 *    persistente em curso resolve — há alguém mexendo no computador, e o que
 *    acontece ali não descreve o uso;
 *  - o ouvinte recebe `{tipo, desdeMs, mensagem}` quando o problema fica
 *    persistente e `null` quando ele resolve. Mudar só o texto (a razão da luz,
 *    por exemplo) não chama o ouvinte de novo; `estadoDoProblemaPersistente()`
 *    devolve sempre o texto mais recente.
 */
import type { TipoDeProblemaDoRastreamento } from '../components/GazeStatusBanner';

export type { TipoDeProblemaDoRastreamento } from '../components/GazeStatusBanner';

export interface ProblemaPersistente {
  tipo: TipoDeProblemaDoRastreamento;
  /** Quando o problema começou, em ms desde a época (`Date.now()`). */
  desdeMs: number;
  /** O texto calmo do aviso, como a tela mostra. */
  mensagem: string;
}

/** Quanto o mesmo problema precisa durar para ser persistente. */
export const PERSISTENTE_APOS_MS = 45_000;
/** Sumiço do problema que ainda conta como o mesmo episódio. */
export const TOLERANCIA_DE_SUMICO_MS = 5_000;

type Ouvinte = (p: ProblemaPersistente | null) => void;

interface Candidato {
  tipo: TipoDeProblemaDoRastreamento;
  inicioMs: number;
  mensagem: string;
  /** Desde quando o problema não é informado; `null` = presente. */
  ausenteDesdeMs: number | null;
}

let candidato: Candidato | null = null;
let persistente: ProblemaPersistente | null = null;
/**
 * Último instante em que o olhar estava sendo rastreado sem problema nenhum
 * (19/10/2026). Quem avisa o cuidador usa para separar "o rosto sumiu no meio
 * do uso" de "o computador ficou ligado sem ninguém na frente".
 */
let ultimoRastreamentoOkMs: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<Ouvinte>();

function notificar(p: ProblemaPersistente | null): void {
  for (const cb of ouvintes) {
    // Um ouvinte que lança (a nuvem fora do ar) não pode impedir os outros.
    try {
      cb(p);
    } catch (e) {
      console.error('[problema] ouvinte de problema persistente lançou:', e);
    }
  }
}

function cancelarTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function resolver(): void {
  if (persistente !== null) {
    persistente = null;
    notificar(null);
  }
}

/** Reavalia agora e agenda a próxima reavaliação, se houver o que esperar. */
function avaliar(agoraMs: number): void {
  cancelarTimer();
  if (!candidato) return;
  if (candidato.ausenteDesdeMs !== null) {
    const fim = candidato.ausenteDesdeMs + TOLERANCIA_DE_SUMICO_MS;
    if (agoraMs >= fim) {
      candidato = null;
      resolver();
      return;
    }
    timer = setTimeout(() => avaliar(Date.now()), fim - agoraMs);
    return;
  }
  if (persistente !== null) return;
  const quando = candidato.inicioMs + PERSISTENTE_APOS_MS;
  if (agoraMs >= quando) {
    persistente = { tipo: candidato.tipo, desdeMs: candidato.inicioMs, mensagem: candidato.mensagem };
    notificar({ ...persistente });
    return;
  }
  timer = setTimeout(() => avaliar(Date.now()), quando - agoraMs);
}

/**
 * Informa o problema de rastreamento em vigor (`null` = nenhum). Chamado pelo
 * `GazeProvider` a cada mudança do aviso e periodicamente; repetir o mesmo
 * problema é barato e não reinicia a contagem.
 *
 * `emMedicao`: calibração ou teste de precisão em curso.
 */
export function informarProblemaDoRastreamento(
  problema: { tipo: TipoDeProblemaDoRastreamento; mensagem: string } | null,
  contexto: { emMedicao: boolean; rastreando?: boolean },
  agoraMs: number = Date.now(),
): void {
  if (problema === null && !contexto.emMedicao && contexto.rastreando) ultimoRastreamentoOkMs = agoraMs;
  if (contexto.emMedicao) {
    candidato = null;
    cancelarTimer();
    resolver();
    return;
  }
  if (problema === null) {
    if (candidato && candidato.ausenteDesdeMs === null) candidato.ausenteDesdeMs = agoraMs;
    avaliar(agoraMs);
    return;
  }
  if (candidato && candidato.tipo === problema.tipo) {
    candidato.ausenteDesdeMs = null;
    candidato.mensagem = problema.mensagem;
    if (persistente) persistente = { ...persistente, mensagem: problema.mensagem };
  } else {
    // Outro problema: o anterior acabou, e este conta do zero.
    resolver();
    candidato = { tipo: problema.tipo, inicioMs: agoraMs, mensagem: problema.mensagem, ausenteDesdeMs: null };
  }
  avaliar(agoraMs);
}

/**
 * Ouve os problemas persistentes. O ouvinte recebe o problema quando ele fica
 * persistente e `null` quando resolve. Um persistente já em curso é entregue
 * na hora. Devolve a função que para de ouvir.
 */
export function ouvirProblemaPersistente(cb: Ouvinte): () => void {
  ouvintes.add(cb);
  if (persistente) {
    try {
      cb({ ...persistente });
    } catch (e) {
      console.error('[problema] ouvinte de problema persistente lançou:', e);
    }
  }
  return () => {
    ouvintes.delete(cb);
  };
}

/**
 * O último instante em que o olhar estava sendo rastreado sem problema, ou
 * `null` se isso ainda não aconteceu desde que o app abriu.
 */
export function ultimoRastreamentoOk(): number | null {
  return ultimoRastreamentoOkMs;
}

/** O problema persistente em curso, ou `null`. */
export function estadoDoProblemaPersistente(): ProblemaPersistente | null {
  return persistente ? { ...persistente } : null;
}

/** Só para teste: devolve o módulo ao estado inicial. */
export function _reiniciarParaTeste(): void {
  cancelarTimer();
  candidato = null;
  persistente = null;
  ultimoRastreamentoOkMs = null;
  ouvintes.clear();
}
