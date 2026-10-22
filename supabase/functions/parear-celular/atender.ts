// O pedido da Edge Function `parear-celular`, do começo ao fim, sem o Deno:
// o banco, o Auth e o log entram como dependências. Assim o caminho inteiro —
// inclusive "nenhum log com o código, o e-mail, o endereço ou o token" — é
// testado com dependências falsas (`deno test supabase/functions/parear-celular/`).
// O index.ts só liga isto ao cliente do Supabase.
//
// Pedido do dono de 19/10/2026: conectar o celular do cuidador por código QR,
// sem senha. Contrato no cabeçalho de ./index.ts.

import { codigoValido, hashDoCodigo } from './codigoDoCelular.ts';
import {
  CODIGO_INVALIDO, conferirLink, decidirUso, hashDoEndereco, ipDoPedido, mensagensDoCelularNovo, type MensagemDoCelularNovo,
  problemaDoPush, SERVICO_INDISPONIVEL, textoDoCelularNovo, TIPO_NAO_SUPORTADO,
} from './logica.ts';

interface ErroDoBanco {
  code?: string | null;
}

interface ErroDoAuth {
  status?: number;
  code?: string;
}

export interface Dependencias {
  /** `usar_codigo_de_pareamento(p_token_hash, p_ip_hash)` (service_role). */
  usarCodigo(tokenHash: string, ipHash: string): Promise<{ data: unknown; error: ErroDoBanco | null }>;
  /** `auth.admin.generateLink({ type: 'magiclink', email })` (service_role). */
  gerarLink(email: string): Promise<{ data: unknown; error: ErroDoAuth | null }>;
  /** Chave do HMAC do endereço de rede. */
  segredo: string;
  /** Uma linha de log. Só recebe texto fixo e códigos de erro — nunca dado do pedido. */
  registrar(nivel: 'warn' | 'error', linha: string): void;
  /**
   * Grava a nota de sistema na conversa do paciente do pareamento e devolve
   * esse paciente (service_role).
   */
  gravarNota(pareamentoId: string, texto: string): Promise<{ beneficiaryId: string | null; error: ErroDoBanco | null }>;
  /** Os tokens de push dos celulares já cadastrados na conta (`push_tokens`). */
  celularesDaConta(userId: string): Promise<{ tokens: string[]; error: ErroDoBanco | null }>;
  /** Manda os avisos pela API de push da Expo. Pode lançar (sem rede, prazo esgotado). */
  enviarPush(mensagens: MensagemDoCelularNovo[]): Promise<{ ok: boolean; corpo: unknown }>;
  /** Relógio: a hora do aviso. */
  agora(): Date;
  /** Teto do aviso de celular novo, em ms (padrão `PRAZO_DO_AVISO_MS`; os testes encurtam). */
  prazoDoAvisoMs?: number;
}

/**
 * Teto do aviso de celular novo. Quando ele começa, o código já foi gasto no
 * banco: se a nota ou a leitura dos celulares travarem, o celular novo ficaria
 * esperando a resposta até o tempo da função acabar — e perderia a entrada.
 * Passado o teto, a troca responde e o aviso fica para o log.
 */
export const PRAZO_DO_AVISO_MS = 6_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // O token da resposta abre a conta: nenhum intermediário guarda cópia.
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** O tipo do corpo sem os parâmetros (`application/json; charset=utf-8` → `application/json`). */
function tipoDoCorpo(req: Request): string {
  return (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

export async function atender(req: Request, dep: Dependencias): Promise<Response> {
  // Sem CORS de propósito: o preflight (OPTIONS) cai aqui também.
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Só JSON (revisão de segurança de 20/10/2026). Qualquer página, aberta no
  // navegador de qualquer pessoa, manda um POST "simples" — text/plain ou
  // formulário — sem preflight de CORS: não lê a resposta, mas a tentativa
  // chegava ao banco e contava no limite. Para outra origem, o navegador só
  // manda application/json depois do preflight, que esta função não atende. O
  // app manda JSON (supabase-js, `functions.invoke` com um objeto).
  if (tipoDoCorpo(req) !== 'application/json') return json(TIPO_NAO_SUPORTADO, 415);

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return json(CODIGO_INVALIDO, 400);
  }
  const codigo = corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>).codigo : undefined;
  // Formato errado não chega ao banco (e não custa nada a ninguém).
  if (!codigoValido(codigo)) return json(CODIGO_INVALIDO, 400);

  const { data, error } = await dep.usarCodigo(
    await hashDoCodigo(codigo),
    await hashDoEndereco(dep.segredo, ipDoPedido(req.headers)),
  );
  if (error) {
    dep.registrar('error', `banco indisponível ao conferir o código (${error.code ?? 'sem código'})`);
    return json(SERVICO_INDISPONIVEL, 503);
  }

  const decisao = decidirUso(data);
  if (decisao.tipo === 'recusar') {
    if (decisao.registro) dep.registrar('warn', decisao.registro);
    return json(decisao.corpo, decisao.status);
  }

  // O código já foi gasto (UPDATE atômico no banco). Se o link falhar daqui em
  // diante, o celular pede para gerar outro — falha fechada.
  const { data: link, error: erroDoLink } = await dep.gerarLink(decisao.email);
  if (erroDoLink) {
    dep.registrar('error', `o Auth não gerou o link (${erroDoLink.status ?? '-'} ${erroDoLink.code ?? '-'})`);
    return json(SERVICO_INDISPONIVEL, 503);
  }
  const conferido = conferirLink(link, decisao.userId);
  if (!conferido.ok) {
    dep.registrar('error', conferido.registro);
    return json(CODIGO_INVALIDO, 400);
  }

  // A troca deu certo: o aviso a todos sai antes da resposta — assim os
  // celulares avisados são os que JÁ estavam na conta (o novo ainda nem tem a
  // sessão para cadastrar o dele) — e nunca a derruba.
  await dentroDoPrazo(avisarCelularNovo(dep, decisao.pareamentoId, decisao.userId), dep.prazoDoAvisoMs ?? PRAZO_DO_AVISO_MS, () => {
    try {
      dep.registrar('error', 'aviso de celular novo passou do prazo; a troca respondeu sem esperar');
    } catch {
      // o log não pode derrubar a troca
    }
  });

  return json({
    ok: true,
    token_hash: conferido.tokenHash,
    tipo: 'magiclink',
    pareamento_id: decisao.pareamentoId,
    paciente: decisao.paciente,
  });
}

/** Espera `tarefa` por no máximo `ms`; passado o prazo, chama `aoEstourar` e segue. Nunca lança. */
async function dentroDoPrazo(tarefa: Promise<void>, ms: number, aoEstourar: () => void): Promise<void> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<'prazo'>((resolve) => {
    relogio = setTimeout(() => resolve('prazo'), ms);
  });
  try {
    const venceu = await Promise.race([tarefa.then(() => 'feito' as const, () => 'feito' as const), prazo]);
    if (venceu === 'prazo') aoEstourar();
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Aviso de celular novo (decisão 1 da rodada 3, 21/10/2026): nota de sistema
 * na conversa ("Um celular novo entrou na conta pelo QR às HH:MM.") e push
 * nos celulares já cadastrados. Ver o porquê em ./logica.ts.
 *
 * Nunca lança e nunca muda a resposta da troca: o celular novo já tem a
 * entrada, e falhar aqui não pode deixá-lo de fora. Cada passo segue mesmo se
 * o anterior falhar (sem a nota, o push sai; sem o push, a nota fica), e o que
 * der errado vai para o log numa linha só, sem dado da conta nem token.
 */
async function avisarCelularNovo(dep: Dependencias, pareamentoId: string, userId: string): Promise<void> {
  const falhas: string[] = [];
  try {
    const texto = textoDoCelularNovo(dep.agora());
    let beneficiaryId: string | null = null;
    try {
      const nota = await dep.gravarNota(pareamentoId, texto);
      beneficiaryId = nota.beneficiaryId;
      if (nota.error) falhas.push(`nota não gravada (${nota.error.code || 'sem código'})`);
    } catch {
      falhas.push('nota não gravada (erro inesperado)');
    }

    let tokens: string[] = [];
    try {
      const celulares = await dep.celularesDaConta(userId);
      if (celulares.error) falhas.push(`celulares da conta não lidos (${celulares.error.code || 'sem código'})`);
      else tokens = celulares.tokens;
    } catch {
      falhas.push('celulares da conta não lidos (erro inesperado)');
    }

    if (tokens.length) {
      try {
        const r = await dep.enviarPush(mensagensDoCelularNovo(tokens, texto, beneficiaryId));
        const problema = problemaDoPush(r.ok, r.corpo, tokens.length);
        if (problema) falhas.push(`push ${problema}`);
      } catch {
        falhas.push('push não saiu (sem rede ou prazo esgotado)');
      }
    }
  } catch {
    falhas.push('erro inesperado');
  }
  if (!falhas.length) return;
  try {
    dep.registrar('error', `aviso de celular novo incompleto: ${falhas.join('; ')}`);
  } catch {
    // o log não pode derrubar a troca
  }
}
