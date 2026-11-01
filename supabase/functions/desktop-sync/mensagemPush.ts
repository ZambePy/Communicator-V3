// Push da MENSAGEM do paciente para os celulares da conta (31/10/2026).
//
// Antes só o socorro, a ajuda e o aviso do dispositivo iam por push: a frase
// que o paciente escrevia com o olhar só aparecia no celular quando o app do
// cuidador estava aberto (realtime) ou quando ele voltava para o app. Com o
// celular no bolso, "Estou com sede" esperava até alguém abrir o app.
//
// Módulo sem APIs do Deno: é importado pela função e pelos testes
// (`deno test supabase/functions/desktop-sync/`).

import { celularesParaAvisar, resumoDosTickets, type DependenciasDosCelulares, type ResumoDoPush } from './push.ts';

/** Canal do Android criado pelo app (importância alta, som e vibração, sem furar o "Não perturbe"). */
export const CANAL_DE_MENSAGENS = 'mensagens';

/** Tamanho máximo do texto na notificação. */
export const LIMITE_DO_CORPO = 140;

/** Quanto o envio do push pode esperar a Expo. A resposta ao computador já saiu antes disso. */
export const PRAZO_DO_PUSH_DE_MENSAGEM_MS = 4_000;

/**
 * Tipos de mensagem que viram push. `sistema` não: são notas automáticas
 * ("Estou bem", escalonamento) que já têm o próprio aviso ou não pedem um.
 */
export function mensagemAvisaPorPush(kind: string): boolean {
  return kind !== 'sistema';
}

/** Corta o texto no limite, sem partir a última palavra quando dá, com reticências. */
export function truncar(texto: string, limite = LIMITE_DO_CORPO): string {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (t.length <= limite) return t;
  const corte = t.slice(0, limite - 1);
  const espaco = corte.lastIndexOf(' ');
  const base = espaco > limite * 0.6 ? corte.slice(0, espaco) : corte;
  return `${base.replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** Agrupamento por pessoa na central de notificações (iOS `threadId`, Android pelo `tag` do canal). */
export function grupoDaConversa(beneficiaryId: string): string {
  return `irisflow-conversa-${beneficiaryId}`;
}

export type PushDeMensagem = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: typeof CANAL_DE_MENSAGENS;
  interruptionLevel: 'active';
  threadId: string;
  data: {
    type: 'mensagem';
    beneficiaryId: string;
    messageId: string;
    /** O mesmo id no formato antigo: o app de antes desta versão lê `beneficiary_id`. */
    beneficiary_id: string;
  };
};

/** Uma notificação por celular: título = nome da pessoa, corpo = o que ela escreveu. */
export function pushesDaMensagem(tokens: string[], nome: string, texto: string, beneficiaryId: string, messageId: string): PushDeMensagem[] {
  const title = nome.trim() || 'IrisFlow';
  const body = truncar(texto);
  return tokens.map((to) => ({
    to,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: CANAL_DE_MENSAGENS,
    interruptionLevel: 'active',
    threadId: grupoDaConversa(beneficiaryId),
    data: { type: 'mensagem', beneficiaryId, messageId, beneficiary_id: beneficiaryId },
  }));
}

/** Resposta do envio à Expo, como `fetch` a entrega (o teste passa uma falsa). */
export type EnviarParaExpo = (corpo: PushDeMensagem[], prazoMs: number) => Promise<{ ok: boolean; json: unknown }>;

export interface DependenciasDoPushDeMensagem extends DependenciasDosCelulares {
  enviar: EnviarParaExpo;
  /** Tira da tabela os tokens que a Expo diz que não existem mais. */
  removerTokens?(tokens: string[]): Promise<void>;
  /** Registro de falha (console.error na função). */
  registrar?(linha: string): void;
  prazoMs?: number;
}

export type ResultadoDoPushDeMensagem =
  | { tipo: 'ignorada'; motivo: 'sistema' | 'texto_vazio' }
  | { tipo: 'sem_destino'; motivo: string }
  | { tipo: 'enviado'; resumo: ResumoDoPush }
  | { tipo: 'falhou'; motivo: string };

/**
 * Avisa os celulares da conta de que chegou uma mensagem do paciente. NUNCA
 * rejeita: a mensagem já foi gravada (e chega pelo realtime com o app aberto);
 * o push é o canal para o celular no bolso, e a falha dele só vai para o log.
 */
export async function avisarMensagem(
  dep: DependenciasDoPushDeMensagem,
  m: { beneficiaryId: string; messageId: string; kind: string; text: string },
): Promise<ResultadoDoPushDeMensagem> {
  const log = dep.registrar ?? (() => undefined);
  try {
    if (!mensagemAvisaPorPush(m.kind)) return { tipo: 'ignorada', motivo: 'sistema' };
    if (!m.text.trim()) return { tipo: 'ignorada', motivo: 'texto_vazio' };
    const celulares = await celularesParaAvisar(dep);
    if (celulares.tipo === 'erro') {
      log(`[desktop-sync] push da mensagem: não deu para ler os celulares (${celulares.mensagem})`);
      return { tipo: 'falhou', motivo: 'erro_banco' };
    }
    if (celulares.tipo === 'nenhum') return { tipo: 'sem_destino', motivo: celulares.motivo };
    const corpo = pushesDaMensagem(celulares.tokens, celulares.nome, m.text, m.beneficiaryId, m.messageId);
    const resposta = await dep.enviar(corpo, dep.prazoMs ?? PRAZO_DO_PUSH_DE_MENSAGEM_MS);
    const resumo = resumoDosTickets(celulares.tokens, resposta.json, resposta.ok);
    if (resumo.recusados) log(`[desktop-sync] push da mensagem recusado para ${resumo.recusados} celular(es): ${resumo.motivos.join(', ')}`);
    if (resumo.tokensInvalidos.length && dep.removerTokens) {
      await dep.removerTokens(resumo.tokensInvalidos).catch((e) => log(`[desktop-sync] tokens inválidos não removidos: ${e instanceof Error ? e.message : String(e)}`));
    }
    return { tipo: 'enviado', resumo };
  } catch (e) {
    log(`[desktop-sync] push da mensagem falhou: ${e instanceof Error ? e.message : String(e)}`);
    return { tipo: 'falhou', motivo: 'rede' };
  }
}

/**
 * Deixa o push correr depois da resposta, sem segurar o computador. Na Edge
 * Function do Supabase, `EdgeRuntime.waitUntil` mantém a função viva até a
 * promessa acabar; fora dela (testes, `deno run`), a promessa só corre solta.
 * A promessa nunca rejeita (`avisarMensagem`), então não há rejeição perdida.
 */
export function emSegundoPlano(p: Promise<unknown>, runtime: unknown = (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime): void {
  const r = runtime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
  const segura = p.catch(() => undefined);
  if (r && typeof r.waitUntil === 'function') r.waitUntil(segura);
}
