/**
 * Entrar na conta da família pelo código QR do computador, sem digitar e-mail
 * nem senha (pedido do dono de 19/10/2026).
 *
 * O computador do paciente mostra um QR em Configurações; a câmera do celular
 * abre a página /parear do site, que abre este app em
 * `irisflow://parear?t=<código>` (rota app/parear.tsx). Depois de um toque do
 * cuidador:
 *   1. o código vai para a Edge Function `parear-celular`, que o troca — uma
 *      vez só — por um link mágico da conta e devolve só o `token_hash` dele;
 *   2. `verifyOtp({ type: 'magiclink', token_hash })` abre a sessão; daí em
 *      diante é o fluxo normal do app (AppProvider carrega a conta, o push é
 *      registrado);
 *   3. o app avisa o computador que entrou (`confirmar_celular_conectado`),
 *      que então mostra "Celular conectado às HH:MM".
 *
 * O código não é guardado em lugar nenhum nem escrito no console: vive só na
 * memória da tela, até o toque.
 */
import { FunctionsFetchError, FunctionsHttpError, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';

/** 32 bytes em base64url: 43 caracteres (o formato de supabase/functions/desktop-sync/codigoDoCelular.ts). */
export const FORMATO_DO_CODIGO = /^[A-Za-z0-9_-]{43}$/;

/** O código do link (`t`), se tiver o formato certo; o expo-router pode entregar lista. */
export function codigoDoLink(t: unknown): string | null {
  const v = Array.isArray(t) ? t[0] : t;
  return typeof v === 'string' && FORMATO_DO_CODIGO.test(v) ? v : null;
}

export type FalhaDoPareamento = 'codigo' | 'limite' | 'rede' | 'servico';

export type ResultadoDoPareamento = { ok: true; paciente: string | null } | { ok: false; falha: FalhaDoPareamento };

/** O que a tela diz em cada falha: o que houve e o que fazer, sem jargão. */
export const MENSAGENS: Record<FalhaDoPareamento, string> = {
  codigo:
    'Este código não vale mais: ele dura 3 minutos e serve uma vez só. No computador, clique em Gerar outro e aponte a câmera para o código novo.',
  limite: 'Muitas tentativas seguidas a partir desta rede. Espere alguns minutos e tente de novo.',
  rede: 'Sem internet no momento. Confira a conexão e tente de novo enquanto o código ainda vale.',
  servico: 'Não foi possível conectar agora. No computador, gere outro código e tente de novo em instantes.',
};

/** Resposta de erro da Edge Function → o que dizer. */
async function falhaDaFuncao(erro: unknown): Promise<FalhaDoPareamento> {
  if (erro instanceof FunctionsFetchError) return 'rede';
  if (erro instanceof FunctionsHttpError) {
    const contexto = erro.context as { status?: number; json?: () => Promise<unknown> } | undefined;
    let corpo: { error?: unknown } | null = null;
    try {
      corpo = ((await contexto?.json?.()) ?? null) as { error?: unknown } | null;
    } catch {
      corpo = null;
    }
    if (contexto?.status === 429 || corpo?.error === 'muitas_tentativas') return 'limite';
    // Inexistente, vencido, usado, de computador desvinculado: a função dá a
    // mesma resposta para todos, de propósito (ver supabase/functions/parear-celular).
    if (contexto?.status === 400 || corpo?.error === 'codigo_invalido') return 'codigo';
    return 'servico';
  }
  return 'servico';
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Troca o código pela sessão da conta. Nunca lança: devolve o que a tela deve
 * mostrar. O link mágico gerado pela função também é de uso único; um tropeço
 * de rede no `verifyOtp` ganha uma segunda tentativa com o mesmo `token_hash`.
 */
export async function entrarComCodigo(sb: SupabaseClient, codigo: string): Promise<ResultadoDoPareamento> {
  if (!FORMATO_DO_CODIGO.test(codigo)) return { ok: false, falha: 'codigo' };

  let dados: Record<string, unknown> | null;
  try {
    const { data, error } = await sb.functions.invoke('parear-celular', { body: { codigo } });
    if (error) return { ok: false, falha: await falhaDaFuncao(error) };
    dados = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return { ok: false, falha: 'rede' };
  }
  const tokenHash = dados?.token_hash;
  if (typeof tokenHash !== 'string' || !tokenHash) return { ok: false, falha: 'servico' };

  let erroDaSessao: unknown = null;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const { error } = await sb.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
      erroDaSessao = error;
    } catch (e) {
      erroDaSessao = e;
    }
    if (!erroDaSessao || !isAuthRetryableFetchError(erroDaSessao) || tentativa === 2) break;
    await espera(1_000);
  }
  if (erroDaSessao) {
    if (isAuthRetryableFetchError(erroDaSessao)) return { ok: false, falha: 'rede' };
    const e = erroDaSessao as { code?: string; status?: number };
    // Link vencido ou já usado: na prática, o código também não vale mais.
    if (e.code === 'otp_expired' || e.status === 403) return { ok: false, falha: 'codigo' };
    return { ok: false, falha: 'servico' };
  }

  // Avisa o computador ("Celular conectado às…"). Já entrou: se o aviso
  // falhar, o computador diz que o código foi usado e pede para conferir aqui.
  if (typeof dados?.pareamento_id === 'string') {
    try {
      const { error } = await sb.rpc('confirmar_celular_conectado', { p_pareamento: dados.pareamento_id });
      if (error) console.warn('[IrisFlow Cuidador] o computador não recebeu o aviso de que este celular entrou:', error.message);
    } catch (e) {
      console.warn('[IrisFlow Cuidador] o computador não recebeu o aviso de que este celular entrou:', e instanceof Error ? e.message : e);
    }
  }
  const paciente = typeof dados?.paciente === 'string' && dados.paciente.trim() ? dados.paciente.trim() : null;
  return { ok: true, paciente };
}
