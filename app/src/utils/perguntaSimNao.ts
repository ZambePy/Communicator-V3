import type { Message } from '@/data/types';

/**
 * Pergunta sim/não do cuidador (pedido de 21/10/2026).
 *
 * O cuidador manda a pergunta como mensagem `simnao`; o computador a mostra
 * grande, o paciente responde olhando para um lado, e a resposta volta como
 * `simnao` do paciente com o texto "Sim (pergunta)" ou "Não (pergunta)". É pela
 * pergunta entre parênteses que a resposta é ligada à pergunta — o banco não
 * tem coluna de "resposta a".
 *
 * Os chips "Sim" e "Não" da conversa (a resposta curta do CUIDADOR) também
 * saem como `simnao`: um texto que é só "sim" ou "não" é recado, não pergunta.
 * A mesma regra vale no computador (`frontend/src/cloud/perguntaDoCuidador.ts`).
 */

/** A pergunta aparece grande na tela do computador: curta, para caber e ser lida de longe. */
export const MAXIMO_DA_PERGUNTA = 160;

/**
 * Quantas letras o texto do campo passa do limite da pergunta (0 se cabe, ou se
 * o campo não está no modo pergunta). Conta o texto como será enviado, sem os
 * espaços das pontas. Revisão final de 21/10/2026: o `maxLength` do campo não
 * corta o que já estava escrito quando o cuidador liga a pergunta, e 300 letras
 * de mensagem iam como pergunta.
 */
export function excessoDaPergunta(texto: string, perguntando: boolean): number {
  if (!perguntando) return 0;
  return Math.max(0, texto.trim().length - MAXIMO_DA_PERGUNTA);
}

/** Forma de comparar: minúscula, sem acento, sem pontuação, espaços simples. */
function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RESPOSTA_CURTA = /^(sim|nao|s|n)$/;

export function ehPerguntaSimNao(m: Pick<Message, 'sender' | 'kind' | 'text'>): boolean {
  if (m.sender !== 'cuidador' || m.kind !== 'simnao') return false;
  const k = chave(m.text ?? '');
  return k.length > 0 && !RESPOSTA_CURTA.test(k);
}

export type LadoDaResposta = 'sim' | 'nao';

/**
 * O sim/não do paciente: o lado e, quando é resposta a uma pergunta, a
 * pergunta. `null` para o que não é sim/não do paciente.
 */
export function lerResposta(m: Pick<Message, 'sender' | 'kind' | 'text'>): { resposta: LadoDaResposta; pergunta: string | null } | null {
  if (m.sender !== 'paciente' || m.kind !== 'simnao') return null;
  const t = (m.text ?? '').trim();
  const comPergunta = /^(sim|não|nao)\s*\(([\s\S]*)\)$/i.exec(t);
  if (comPergunta) {
    const pergunta = comPergunta[2].trim();
    return { resposta: chave(comPergunta[1]) === 'sim' ? 'sim' : 'nao', pergunta: pergunta || null };
  }
  const solta = chave(t);
  if (solta === 'sim' || solta === 's') return { resposta: 'sim', pergunta: null };
  if (solta === 'nao' || solta === 'n') return { resposta: 'nao', pergunta: null };
  return null;
}

/**
 * Quanto a resposta pode vir "antes" da pergunta e ainda ser dela: as horas são
 * do servidor, mas a da resposta é recalculada a partir do relógio do
 * computador (`occurred_at`/`sent_at`), que pode estar um pouco adiantado.
 */
const TOLERANCIA_DO_RELOGIO_MS = 2 * 60_000;

/** A pergunta `texto` é a que a resposta cita? A citação encurtada ("…") vale pelo começo. */
function citaAPergunta(texto: string, citada: string): boolean {
  if (citada.endsWith('…')) {
    const comeco = chave(citada.slice(0, -1));
    return comeco.length > 0 && chave(texto).startsWith(comeco);
  }
  return chave(texto) === chave(citada);
}

/**
 * Liga cada resposta à sua pergunta: a mais antiga ainda sem resposta com o
 * mesmo texto — a ordem em que o computador mostra as perguntas.
 */
export function ligarRespostas(messages: readonly Message[]): {
  /** id da pergunta → a resposta. */
  respostaDe: Map<string, Message>;
  /** id da resposta → a pergunta. */
  perguntaDe: Map<string, Message>;
} {
  const ordenadas = [...messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const perguntas = ordenadas.filter(ehPerguntaSimNao);
  const respostaDe = new Map<string, Message>();
  const perguntaDe = new Map<string, Message>();
  for (const m of ordenadas) {
    const r = lerResposta(m);
    if (!r?.pergunta) continue;
    const quando = Date.parse(m.created_at);
    const p = perguntas.find(
      (q) => !respostaDe.has(q.id) && Date.parse(q.created_at) <= quando + TOLERANCIA_DO_RELOGIO_MS && citaAPergunta(q.text, r.pergunta!),
    );
    if (p) {
      respostaDe.set(p.id, m);
      perguntaDe.set(m.id, p);
    }
  }
  return { respostaDe, perguntaDe };
}
