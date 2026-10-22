// Respostas das ações de pareamento do celular da desktop-sync —
// `pairing.create`, `pairing.status` e `pairing.cancel` (pedido do dono de
// 19/10/2026: conectar o celular do cuidador por código QR, sem senha;
// migração 20261019200000_pareamento_do_celular).
//
// Módulo sem APIs do Deno: é importado pela função e pelos testes
// (`deno test supabase/functions/desktop-sync/`).

/** Validade do código (a mesma da migração): 3 minutos. */
export const VALIDADE_DO_CODIGO_S = 180;

/** O que o computador lê de `pareamentos_de_celular` para a tela do QR. */
export interface LinhaDoPareamento {
  id: string;
  expira_em: string;
  usado_em: string | null;
  conectado_em: string | null;
  cancelado_em: string | null;
}

/**
 * - `aguardando`: o QR vale; o computador continua mostrando;
 * - `usado`: um celular trocou o código pela entrada na conta, e a confirmação
 *   dele (já logado) ainda não chegou — o computador diz que o código foi
 *   usado, e não que o celular entrou;
 * - `conectado`: o celular confirmou que entrou ("Celular conectado às…");
 * - `vencido` e `cancelado`: o QR não vale mais;
 * - `desconhecido`: não é um código deste computador (ou a faxina já o apagou).
 */
export type EstadoDoCodigo = 'aguardando' | 'usado' | 'conectado' | 'vencido' | 'cancelado' | 'desconhecido';

export interface RespostaDoEstado {
  estado: EstadoDoCodigo;
  /** Segundos de validade pelo relógio do SERVIDOR — o do computador pode estar errado. */
  restante_s?: number;
  usado_em?: string;
  conectado_em?: string;
}

/** Segundos até `expiraEm`, nunca negativo (0 para data ilegível). */
export function segundosRestantes(expiraEm: string, agoraMs: number): number {
  const fim = Date.parse(expiraEm);
  if (!Number.isFinite(fim)) return 0;
  return Math.max(0, Math.round((fim - agoraMs) / 1000));
}

/**
 * Estado do código que está na tela. Uso vale mais que validade: um celular
 * que usou o código no último segundo continua "usado" depois do vencimento.
 */
export function estadoDoPareamento(linha: LinhaDoPareamento | null | undefined, agoraMs: number): RespostaDoEstado {
  if (!linha) return { estado: 'desconhecido' };
  if (linha.conectado_em) {
    return { estado: 'conectado', conectado_em: linha.conectado_em, ...(linha.usado_em ? { usado_em: linha.usado_em } : {}) };
  }
  if (linha.usado_em) return { estado: 'usado', usado_em: linha.usado_em };
  if (linha.cancelado_em) return { estado: 'cancelado' };
  const restante = segundosRestantes(linha.expira_em, agoraMs);
  if (restante <= 0) return { estado: 'vencido', restante_s: 0 };
  return { estado: 'aguardando', restante_s: restante };
}

export type RespostaDaCriacao =
  | { status: 200; corpo: { ok: true; id: string; expira_em: string; restante_s: number; validade_s: number } }
  | { status: 403 | 409 | 429 | 503; corpo: { error: string; tente_em?: string } };

/**
 * Resposta HTTP do `pairing.create` a partir do JSON de
 * `criar_codigo_de_pareamento`. O código em si é acrescentado por quem chama
 * (só ele o tem). Erros com nome próprio, para o computador dizer o que fazer:
 *   429 limite                 (5 códigos em 10 minutos; `tente_em`)
 *   409 email_nao_confirmado   (confirme o e-mail da conta antes)
 *   403 device_revoked         (o computador foi desvinculado no meio)
 *   503 servico_indisponivel   (resposta que o banco não deveria dar)
 */
export function respostaDaCriacao(resultado: unknown, agoraMs: number): RespostaDaCriacao {
  const r = (resultado && typeof resultado === 'object' ? resultado : {}) as Record<string, unknown>;
  if (r.ok === true && typeof r.id === 'string' && typeof r.expira_em === 'string') {
    return {
      status: 200,
      corpo: {
        ok: true,
        id: r.id,
        expira_em: r.expira_em,
        restante_s: segundosRestantes(r.expira_em, agoraMs),
        validade_s: typeof r.validade_s === 'number' ? r.validade_s : VALIDADE_DO_CODIGO_S,
      },
    };
  }
  switch (r.motivo) {
    case 'limite':
      return { status: 429, corpo: { error: 'limite', ...(typeof r.tente_em === 'string' ? { tente_em: r.tente_em } : {}) } };
    case 'email_nao_confirmado':
      return { status: 409, corpo: { error: 'email_nao_confirmado' } };
    case 'computador_desvinculado':
      // O mesmo código que a função usa quando a chave foi revogada.
      return { status: 403, corpo: { error: 'device_revoked' } };
    default:
      return { status: 503, corpo: { error: 'servico_indisponivel' } };
  }
}
