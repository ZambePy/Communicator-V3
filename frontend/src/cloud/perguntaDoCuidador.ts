/**
 * Pergunta sim/não do cuidador (pedido de 21/10/2026).
 *
 * O cuidador escreve uma pergunta no app e a manda como mensagem `kind:
 * 'simnao'`. O computador a mostra grande, fala e espera o paciente responder
 * olhando para um lado (`PerguntaDoCuidador`). A resposta volta pela conversa
 * como `message.send` `kind: 'simnao'`, com o texto "Sim (pergunta)" ou "Não
 * (pergunta)": é pela pergunta entre parênteses que o app liga a resposta a ela
 * — o banco não tem coluna de "resposta a", e não precisou de migração.
 *
 * Os botões "Sim" e "Não" do app (a resposta curta do CUIDADOR) também saem
 * como `simnao`, desde antes desta pergunta existir: um texto que é só "sim" ou
 * "não" é recado, não pergunta.
 */
import type { Message } from './types';

export type RespostaDaPergunta = 'sim' | 'nao';

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

export function ehPerguntaDoCuidador(m: Pick<Message, 'sender' | 'kind' | 'text'>): boolean {
  if (m.sender !== 'cuidador' || m.kind !== 'simnao') return false;
  const k = chave(m.text ?? '');
  return k.length > 0 && !RESPOSTA_CURTA.test(k);
}

/** O limite de `messages.text` no banco (check `between 1 and 2000`). */
const LIMITE_DO_TEXTO = 2000;

/** "Sim (pergunta)" / "Não (pergunta)", numa linha e dentro do limite do banco. */
export function textoDaResposta(resposta: RespostaDaPergunta, pergunta: string): string {
  const rotulo = resposta === 'sim' ? 'Sim' : 'Não';
  const p = pergunta.replace(/\s+/g, ' ').trim();
  const cabe = LIMITE_DO_TEXTO - rotulo.length - 3;
  return `${rotulo} (${p.length <= cabe ? p : `${p.slice(0, cabe - 1)}…`})`;
}

// ---------- a pergunta fechada sem resposta ----------
//
// Revisão final, rodada 1 (M9, 21/10/2026): "Fechar sem responder" marca a pergunta como falada
// (ela sai da fila pendente do servidor, senão voltaria a cada abertura) mas não manda resposta
// nenhuma, e o app a mostrava como "mostrada na tela", como se a resposta estivesse a caminho. O
// banco não tem coluna para esse estado (e não vai ganhar migração por isto): o computador manda uma
// nota curta de SISTEMA (`message.send`, `kind: 'sistema'`) que o app mostra na conversa.
//
// O formato é um contrato com o app: o prefixo fixo, dois-pontos e a pergunta entre aspas curvas.
// Quem quiser ligar a nota à pergunta compara o texto entre as aspas com o da pergunta.

/** O começo fixo da nota. */
export const PREFIXO_DA_PERGUNTA_FECHADA = 'A pergunta foi fechada no computador sem resposta';
/** A pergunta citada na nota cabe em uma linha de conversa. */
const LIMITE_DA_PERGUNTA_NA_NOTA = 120;

/** `A pergunta foi fechada no computador sem resposta: “Você está com dor?”`, numa linha e curta. */
export function notaDePerguntaFechada(pergunta: string): string {
  const p = pergunta.replace(/\s+/g, ' ').trim();
  const citada = p.length <= LIMITE_DA_PERGUNTA_NA_NOTA ? p : `${p.slice(0, LIMITE_DA_PERGUNTA_NA_NOTA - 1)}…`;
  return `${PREFIXO_DA_PERGUNTA_FECHADA}: “${citada}”`;
}

// ---------- a hora da pergunta ----------
//
// Revisão de 21/10/2026 (Minor 4): a pergunta não expira — sem resposta, ela
// espera, e uma pendente desde ontem volta quando o app abre. Ela aparece com
// a hora, e a fala começa pela hora quando já passou de uma hora: a pergunta
// das 14:00 não pode soar como a de agora. No fuso de Brasília (o do produto),
// qualquer que seja o relógio do computador.

const FUSO = 'America/Sao_Paulo';
/** Acima disto, a fala da pergunta começa pela hora. */
export const IDADE_PARA_FALAR_A_HORA_MS = 60 * 60_000;

const formatoDaHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const formatoDoDia = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
const DIA_MS = 24 * 60 * 60_000;

/**
 * "das 14:00" (hoje), "de ontem, às 14:00", "de 19/10, às 14:00" — para
 * completar "Pergunta …". `null` com uma data que não dá para ler.
 */
export function quandoFoiAPergunta(criadaEm: string, agoraMs: number = Date.now()): string | null {
  const ms = Date.parse(criadaEm);
  if (!Number.isFinite(ms)) return null;
  const hora = formatoDaHora.format(ms);
  const dia = formatoDoDia.format(ms);
  if (dia === formatoDoDia.format(agoraMs)) return `das ${hora}`;
  if (dia === formatoDoDia.format(agoraMs - DIA_MS)) return `de ontem, às ${hora}`;
  return `de ${dia.slice(0, 5)}, às ${hora}`;
}

/** O que a voz do sistema fala: a pergunta, e antes dela a hora, se já passou de uma hora. */
export function falaDaPergunta(texto: string, criadaEm: string, agoraMs: number = Date.now()): string {
  const quando = quandoFoiAPergunta(criadaEm, agoraMs);
  const idade = agoraMs - Date.parse(criadaEm);
  return quando && idade > IDADE_PARA_FALAR_A_HORA_MS ? `Pergunta ${quando}: ${texto}` : texto;
}

// ---------- as já respondidas ----------
//
// Respondida, a pergunta só deixa de ser "pendente" no servidor quando o
// `message.spoken` chega lá. Sem internet ele espera na fila — e, se o app for
// reaberto antes, a busca de pendentes a traria de volta e o paciente
// responderia de novo. As respondidas ficam no disco (as 50 últimas).

export const CHAVE_DAS_PERGUNTAS_RESPONDIDAS = 'irisflow.perguntasRespondidas';
const MAXIMO_GUARDADO = 50;

let emMemoria: string[] | null = null;
let falhaDeGravacaoAvisada = false;

function lerDoDisco(): string[] {
  try {
    const bruto = localStorage.getItem(CHAVE_DAS_PERGUNTAS_RESPONDIDAS);
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string').slice(-MAXIMO_GUARDADO) : [];
  } catch {
    return [];
  }
}

function respondidas(): string[] {
  if (emMemoria === null) emMemoria = lerDoDisco();
  return emMemoria;
}

export function perguntaFoiRespondida(id: string): boolean {
  return respondidas().includes(id);
}

export function marcarPerguntaRespondida(id: string): void {
  const lista = respondidas().filter((x) => x !== id);
  lista.push(id);
  emMemoria = lista.slice(-MAXIMO_GUARDADO);
  try {
    localStorage.setItem(CHAVE_DAS_PERGUNTAS_RESPONDIDAS, JSON.stringify(emMemoria));
  } catch (e) {
    // Vale nesta sessão; reaberto o app sem internet, a pergunta poderia voltar.
    if (!falhaDeGravacaoAvisada) {
      falhaDeGravacaoAvisada = true;
      console.warn('[pergunta do cuidador] não deu para guardar as perguntas respondidas no disco', e);
    }
  }
}

/** Só para testes: esquece a cópia em memória (o disco fica). */
export function _esquecerRespondidasEmMemoria(): void {
  emMemoria = null;
}
