// Limite de avisos no servidor (decisão 2 da rodada 3, 21/10/2026).
//
// O computador manda pedidos de ajuda (Sim · Não, mapa da dor) e avisos de
// dispositivo (o olhar parou e o problema durou) pela desktop-sync, e cada um
// vira push nos celulares da família. Até aqui o limite do aviso de
// dispositivo era uma consulta seguida de um INSERT, feitos por esta função:
// duas chamadas ao mesmo tempo contavam antes uma da outra e passavam as
// duas; e a ajuda não tinha limite nenhum — uma chave tirada do computador
// mandaria push sem fim. Agora quem conta e grava é o banco, sob uma trava
// por computador (registrar_aviso_com_limite, migração
// 20261021120000_endurecimento_rodada3):
//   - `dispositivo`: o mesmo texto no máximo a cada 15 min e 4 por hora;
//   - `ajuda`: 6 a cada 10 min.
// O socorro (`emergencia`) NUNCA passa por aqui: segue direto, como sempre.
//
// Módulo sem APIs do Deno: é importado pela função e pelos testes
// (`deno test supabase/functions/desktop-sync/`).

import { corpoDoPedido } from './horario.ts';
import { avisaPorPush, pushDoReenvio, type ResumoDoPush } from './push.ts';
import { statusDoErroDoBanco } from './respostas.ts';

/** Os tipos de aviso com limite no servidor. O socorro, NUNCA. */
export function passaPeloLimite(kind: string): boolean {
  return kind === 'ajuda' || kind === 'dispositivo';
}

/** O pedido como a desktop-sync o recebeu e conferiu. */
export interface EntradaDoAviso {
  /** O computador da chave (`devices.id`). */
  deviceId: string;
  kind: string;
  /** Já cortado em 500 caracteres. */
  message: string;
  /** Sessão já conferida como deste paciente, ou null. */
  sessionId: string | null;
  /** Quando aconteceu no computador (`horarioDoEvento`, ISO). */
  quando: string;
  /** O UUID escolhido no computador (`idDoCliente`), ou null. */
  id: string | null;
  agora: Date;
}

/** Os parâmetros de `registrar_aviso_com_limite`, com os nomes do SQL. */
export interface ArgumentosDoAviso {
  p_device_id: string;
  p_kind: string;
  p_message: string;
  p_session_id: string | null;
  p_created_at: string;
  p_id: string | null;
}

interface ErroDoBanco {
  message: string;
  code?: string | null;
}

export interface DependenciasDoLimite {
  /** `rpc('registrar_aviso_com_limite', args)` (service_role). */
  registrar(args: ArgumentosDoAviso): Promise<{ data: unknown; error: ErroDoBanco | null }>;
  /** O push dos celulares da conta (`notifyCaregiver` em ./index.ts). */
  avisar(kind: string, corpo: string, id: string): Promise<ResumoDoPush>;
  /** Quantos celulares a conta tem cadastrados agora, ou null se não deu para saber. */
  celulares(): Promise<number | null>;
  /** Uma linha de log; `chave` agrupa as repetidas (ver `registroComIntervalo`). */
  registrarLog(chave: string, linha: string): void;
}

export type ResultadoDoLimite =
  /** Não passa pelo limite (o socorro, e postura, fadiga e recalibração): o caminho de sempre. */
  | { tipo: 'direto' }
  /** A função ainda não existe no banco (migração não aplicada): o caminho de antes. */
  | { tipo: 'funcao_ausente' }
  /** Resposta pronta para o computador. */
  | { tipo: 'resposta'; status: number; corpo: Record<string, unknown> };

/** PostgREST (PGRST202) ou Postgres (42883): a função não existe — ainda. */
function funcaoAusente(erro: ErroDoBanco): boolean {
  return erro.code === 'PGRST202' || erro.code === '42883';
}

/**
 * Passa a ajuda e o aviso de dispositivo pelo limite do banco e monta a
 * resposta de `help.create`, com o push quando o aviso foi gravado.
 *
 * Acima do limite, nada é gravado nem avisado, e a resposta leva
 * `push: { avisados: 0 }` além de `limitado`: o computador lê isso como
 * `sem_push` (frontend/src/cloud/eventos.ts → entregaDaResposta) — a tela diz
 * que nenhum celular foi avisado, e o chamado toca no computador. Sem o
 * campo, ele entenderia "o celular do cuidador foi avisado".
 */
export async function pedidoComLimite(e: EntradaDoAviso, dep: DependenciasDoLimite): Promise<ResultadoDoLimite> {
  if (!passaPeloLimite(e.kind)) return { tipo: 'direto' };

  const { data, error } = await dep.registrar({
    p_device_id: e.deviceId,
    p_kind: e.kind,
    p_message: e.message,
    p_session_id: e.sessionId,
    p_created_at: e.quando,
    p_id: e.id,
  });
  if (error) {
    if (funcaoAusente(error)) {
      dep.registrarLog(
        'funcao_ausente',
        'registrar_aviso_com_limite não existe no banco (migração 20261021120000 não aplicada?): aviso gravado sem o limite novo',
      );
      return { tipo: 'funcao_ausente' };
    }
    dep.registrarLog(`erro:${error.code ?? ''}`, `registrar_aviso_com_limite falhou (${error.code || 'sem código'})`);
    // Como os outros erros do banco: 400 só para conteúdo inválido; o resto é
    // passageiro (503) e o computador reenvia.
    return { tipo: 'resposta', status: statusDoErroDoBanco(error), corpo: { error: error.message } };
  }

  const r = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (r.ok === false && r.motivo === 'limite') {
    dep.registrarLog(`limite:${e.kind}`, `aviso de ${e.kind} acima do limite do computador: descartado sem push`);
    return {
      tipo: 'resposta',
      status: 200,
      corpo: { ok: true, limitado: true, push: { avisados: 0, recusados: 0, motivos: ['limite'] } },
    };
  }
  if (r.ok === false && r.motivo === 'computador_desvinculado') {
    // O computador foi desvinculado entre a conferência da chave e a gravação.
    return { tipo: 'resposta', status: 403, corpo: { error: 'device_revoked' } };
  }
  if (r.ok !== true || typeof r.id !== 'string' || !r.id) {
    dep.registrarLog('resposta_inesperada', 'resposta inesperada de registrar_aviso_com_limite');
    return { tipo: 'resposta', status: 503, corpo: { error: 'servico_indisponivel' } };
  }

  if (r.repetido === true) {
    // Reenvio de um pedido já gravado: sem segundo push. A resposta diz o que
    // se sabe do push (ver pushDoReenvio em ./push.ts), pelo tipo GRAVADO.
    const kindGravado = typeof r.kind === 'string' ? r.kind : e.kind;
    const push = pushDoReenvio(kindGravado, avisaPorPush(kindGravado) ? await dep.celulares() : null);
    return {
      tipo: 'resposta',
      status: 200,
      corpo: { ok: true, id: r.id, repetido: true, ...(push !== undefined ? { push } : {}) },
    };
  }

  const push = await dep.avisar(e.kind, corpoDoPedido(e.message, e.quando, e.agora), r.id);
  return {
    tipo: 'resposta',
    status: 200,
    corpo: { ok: true, id: r.id, push: { avisados: push.avisados, recusados: push.recusados, motivos: push.motivos } },
  };
}

/**
 * Log com intervalo: no máximo uma linha por `chave` a cada `intervaloMs`.
 * Avisos acima do limite chegam em rajada (é para isso que o limite existe):
 * sem o intervalo, uma chave roubada encheria o log da função também.
 */
export function registroComIntervalo(
  intervaloMs: number,
  escrever: (linha: string) => void,
): (chave: string, linha: string, agoraMs: number) => void {
  const ultimo = new Map<string, number>();
  return (chave, linha, agoraMs) => {
    const antes = ultimo.get(chave);
    if (antes !== undefined && agoraMs - antes < intervaloMs) return;
    ultimo.set(chave, agoraMs);
    escrever(linha);
  };
}
