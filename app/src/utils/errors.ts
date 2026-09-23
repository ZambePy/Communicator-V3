/**
 * Mensagens de erro para gente, não para desenvolvedor.
 *
 * O que sobe do Supabase e do `fetch` vem em inglês técnico ("Failed to fetch",
 * "new row violates row-level security policy", "JWT expired"). Quem lê a tela
 * é um cuidador — muitas vezes cansado, às vezes no meio de um cuidado — e
 * precisa saber o que aconteceu e o que fazer, não o nome do erro. Mensagens que
 * já foram escritas em português pelo app (ex.: "E-mail ou senha incorretos.")
 * passam como estão.
 */

export type TipoDeFalha = 'offline' | 'sessao' | 'permissao' | 'limite' | 'desconhecida' | 'mensagem';

const OFFLINE = /network|fetch|timeout|timed out|offline|internet|conex|socket|ECONN|ENOTFOUND|Load failed/i;
const SESSAO = /jwt|token.*(expired|invalid)|refresh token|not authenticated|auth session missing|sess(ã|a)o expirou/i;
const PERMISSAO = /row-level security|permission denied|violates|not allowed|forbidden|42501|PGRST301/i;
const LIMITE = /rate limit|too many/i;
/** Texto técnico em inglês (ou código) que não deve chegar à tela. */
const TECNICO = /[A-Za-z]+Error\b|PGRST|\b(failed|unexpected|undefined|null|exception|violates|invalid|cannot|could not|unable)\b|^[A-Z0-9_]{4,}$/i;

export function tipoDeFalha(erro: unknown): TipoDeFalha {
  const msg = mensagemBruta(erro);
  if (!msg) return 'desconhecida';
  if (OFFLINE.test(msg)) return 'offline';
  if (SESSAO.test(msg)) return 'sessao';
  if (PERMISSAO.test(msg)) return 'permissao';
  if (LIMITE.test(msg)) return 'limite';
  if (TECNICO.test(msg)) return 'desconhecida';
  return 'mensagem';
}

function mensagemBruta(erro: unknown): string {
  if (!erro) return '';
  if (typeof erro === 'string') return erro;
  if (erro instanceof Error) return erro.message;
  if (typeof erro === 'object' && 'message' in erro) return String((erro as { message: unknown }).message ?? '');
  return '';
}

/**
 * Frase curta, em português, dizendo o que houve e o que fazer.
 * `alternativa` substitui o texto genérico do caso desconhecido.
 */
export function mensagemDeErro(erro: unknown, alternativa = 'Algo não saiu como esperado. Tente de novo em instantes.'): string {
  switch (tipoDeFalha(erro)) {
    case 'offline':
      return 'Sem internet no momento. Confira a conexão e tente de novo.';
    case 'sessao':
      return 'Sua sessão expirou. Entre de novo para continuar.';
    case 'permissao':
      return 'Esta conta não tem permissão para isso. Se parecer errado, fale com a equipe IrisFlow.';
    case 'limite':
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    case 'mensagem':
      return mensagemBruta(erro);
    default:
      return alternativa;
  }
}
