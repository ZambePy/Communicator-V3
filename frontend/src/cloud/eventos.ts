/**
 * Barramento de eventos do paciente → nuvem.
 *
 * As telas do paciente (teclado, frases, pictogramas, emergência, calibração)
 * NÃO conhecem o Supabase. Elas anunciam o que aconteceu aqui; o
 * `CloudProvider` escuta e decide se e como sincronizar. Isso mantém as telas
 * testáveis sem rede e faz a integração inteira desligável num só lugar.
 *
 * Para acrescentar um evento novo: declare o tipo em `EventoDoPaciente`,
 * emita-o na tela e trate-o em `CloudContext.tsx`.
 */
import type { MessageKind, HelpKind } from './types';
import type { RespostaSync } from './desktopSync';
import type { AccuracyResult, RunMeta } from '@tracker/accuracy';
import { modoApresentacaoAtivo } from '../services/apresentacao';

export type EventoDoPaciente =
  /**
   * O paciente falou algo (teclado, frase rápida, pictograma, sim/não).
   * `id` (UUID, opcional): a tela que quer dizer o que aconteceu com a frase
   * (o mapa da dor) escolhe o id e acompanha a entrega por
   * `ouvirEntregaDaMensagem`.
   */
  | { tipo: 'fala'; texto: string; kind: MessageKind; id?: string }
  /**
   * O paciente pediu ajuda ou o sistema detectou algo que o cuidador deve saber.
   * `id` (UUID, opcional): quem precisa reconhecer a confirmação do cuidador
   * para ESTE pedido — a tela de emergência — escolhe o id e o passa aqui.
   */
  | { tipo: 'ajuda'; kind: HelpKind; mensagem: string; id?: string }
  /** Calibração + teste de precisão concluídos. */
  | { tipo: 'calibracao'; resultado: AccuracyResult; meta: RunMeta | null; duracaoCalibracaoS: number | null }
  /** Contadores da sessão (o teclado conta caracteres; as telas contam frases). */
  | { tipo: 'uso'; caracteres?: number; frases?: number; modulo?: string };

type Ouvinte = (e: EventoDoPaciente) => void;
const ouvintes = new Set<Ouvinte>();

export function emitir(e: EventoDoPaciente): void {
  // Modo apresentação: o barramento é o único caminho daqui para a nuvem, e é
  // por isso que o corte fica exatamente aqui. Numa demonstração, alguém vai
  // olhar para o botão de socorro — e esse olhar não pode acordar o celular
  // de um cuidador de verdade. As telas seguem funcionando: o que morre é a
  // saída, não o aplicativo.
  if (modoApresentacaoAtivo()) {
    console.info(`[cloud] modo apresentação: evento "${e.tipo}" não foi enviado`);
    if (e.tipo === 'ajuda' && e.id) informarEntrega(e.id, 'ensaio');
    if (e.tipo === 'fala' && e.id) informarEntregaDaMensagem(e.id, 'ensaio');
    return;
  }
  // Ninguém ouvindo (a integração com a nuvem não está montada): o pedido
  // de ajuda não sai deste computador, e a tela precisa saber.
  if (e.tipo === 'ajuda' && e.id && ouvintes.size === 0) informarEntrega(e.id, 'sem_nuvem');
  if (e.tipo === 'fala' && e.id && ouvintes.size === 0) informarEntregaDaMensagem(e.id, 'sem_nuvem');
  for (const o of ouvintes) {
    try {
      o(e);
    } catch (err) {
      // um ouvinte com defeito não pode derrubar a tela do paciente
      console.warn('[cloud] ouvinte falhou', err);
    }
  }
}

export function ouvir(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

// Atalhos legíveis nas telas.
export const emitirFalaDoPaciente = (texto: string, kind: MessageKind = 'texto', id?: string) =>
  emitir(id ? { tipo: 'fala', texto, kind, id } : { tipo: 'fala', texto, kind });
export const emitirPedidoDeAjuda = (kind: HelpKind, mensagem: string, id?: string) =>
  emitir(id ? { tipo: 'ajuda', kind, mensagem, id } : { tipo: 'ajuda', kind, mensagem });
export const emitirResultadoDeCalibracao = (
  resultado: AccuracyResult, meta: RunMeta | null, duracaoCalibracaoS: number | null,
) => emitir({ tipo: 'calibracao', resultado, meta, duracaoCalibracaoS });
export const emitirUso = (uso: { caracteres?: number; frases?: number; modulo?: string }) =>
  emitir({ tipo: 'uso', ...uso });

// ---------- entrega dos pedidos de ajuda ----------
//
// A tela de emergência dizia "ALERTA ENVIADO!" sem saber se algo tinha saído
// (sem conta vinculada, sem internet, modo apresentação). O `CloudProvider`
// informa aqui o que aconteceu com o pedido de id conhecido; a tela mostra.

/**
 * - `enviando`: saiu para o servidor, sem resposta ainda;
 * - `enviado`: o servidor gravou e avisou o celular do cuidador (push aceito;
 *   servidores anteriores a 19/10/2026 não dizem do push e também caem aqui);
 * - `sem_push`: o servidor gravou, mas NENHUM celular foi avisado (nenhum
 *   aparelho cadastrado, ou a Expo/FCM recusou o aviso). O app do cuidador só
 *   vê o pedido se estiver aberto — para o alarme daqui é como não entregue;
 * - `limitado`: o servidor descartou o aviso porque este computador já fez
 *   chamadas de ajuda demais (6 em 10 minutos, `limites.ts` no servidor) —
 *   nenhum celular foi avisado e nada foi gravado. A Emergência nunca é
 *   limitada. Diferente de `sem_push`, a tela explica o motivo e lembra da
 *   Emergência (revisão final, rodada 1, M6, 21/10/2026);
 * - `push_incerto`: o servidor tem o pedido, mas não diz se algum celular foi
 *   avisado — o reenvio (`repetido`) de um pedido cuja primeira resposta se
 *   perdeu: o resultado do push daquele envio não fica gravado no banco.
 *   Ninguém pode afirmar que o celular foi avisado, então o alarme daqui vale
 *   como o de um pedido não entregue (revisão de UX de 19/10/2026);
 * - `na_fila`: sem internet — sai sozinho quando a conexão voltar;
 * - `sem_nuvem`: este computador não está ligado a um celular de cuidador;
 * - `falhou`: o servidor recusou (o alarme continua só aqui);
 * - `ensaio`: modo apresentação — nada foi enviado de propósito.
 */
export type EntregaDoPedido =
  | 'enviando' | 'enviado' | 'sem_push' | 'limitado' | 'push_incerto' | 'na_fila' | 'sem_nuvem' | 'falhou' | 'ensaio';

/**
 * O que a tela diz quando o limite de chamados do servidor foi atingido (M6, 21/10/2026).
 * Uma frase só para todas as telas (Sim · Não, mapa da dor, enfermagem): o paciente precisa
 * saber POR QUÊ ninguém foi avisado e o que fazer se for urgente — a Emergência não tem limite.
 */
export const TEXTO_DO_LIMITE_DE_CHAMADOS =
  'Você chamou várias vezes; o celular não recebe novos avisos por alguns minutos. Se for urgente, use a Emergência.';
/** O mesmo em até 32 caracteres, para o botão da enfermagem (duas linhas numa célula do tamanho mínimo). */
export const TEXTO_CURTO_DO_LIMITE_DE_CHAMADOS = 'Já chamou. Urgente? Emergência.';

const entregas = new Map<string, EntregaDoPedido>();
const ouvintesDeEntrega = new Set<(id: string, entrega: EntregaDoPedido) => void>();
/**
 * Id com que o servidor gravou o pedido, quando não é o daqui (servidor que
 * não aceitou o id do computador). A confirmação do cuidador chega com o id do
 * servidor; o pedido de socorro só aceita a do PRÓPRIO pedido (revisão de
 * segurança de 19/10/2026).
 */
const idsNoServidor = new Map<string, string>();

export function informarEntrega(id: string, entrega: EntregaDoPedido, idNoServidor?: string | null): void {
  if (typeof idNoServidor === 'string' && idNoServidor && idNoServidor !== id) {
    idsNoServidor.set(id, idNoServidor);
    if (idsNoServidor.size > 50) idsNoServidor.delete(idsNoServidor.keys().next().value as string);
  }
  // Um "enviado" não volta para "na fila" (uma resposta atrasada de outra
  // tentativa não pode desdizer a entrega).
  const anterior = entregas.get(id);
  if (anterior === 'enviado' && entrega !== 'enviado') return;
  // O mesmo para "gravado sem push": a fila não volta atrás, só um "enviado"
  // (o push saiu num reenvio) melhora o estado.
  // O mesmo para "limitado" (o servidor descartou o aviso): outra tentativa que falha não o desfaz.
  if ((anterior === 'sem_push' || anterior === 'limitado') && entrega !== 'enviado' && entrega !== 'sem_push' && entrega !== 'limitado') return;
  // "Gravado, sem saber do push" também já está no servidor: uma falha de
  // outra tentativa não o desfaz. Só uma resposta que SAIBA do push (enviado
  // ou sem_push) o substitui.
  if (anterior === 'push_incerto' && entrega !== 'enviado' && entrega !== 'sem_push' && entrega !== 'push_incerto') return;
  entregas.set(id, entrega);
  if (entregas.size > 50) entregas.delete(entregas.keys().next().value as string);
  for (const o of ouvintesDeEntrega) {
    try {
      o(id, entrega);
    } catch (err) {
      console.warn('[cloud] ouvinte de entrega falhou', err);
    }
  }
}

/** O que a resposta do envio (`DesktopSync.enviar`) diz sobre a entrega de um pedido. */
export function entregaDaResposta(r: RespostaSync): EntregaDoPedido {
  if (r.ok) {
    // Limite de chamados do computador (M6): o servidor responde ok, descarta o aviso e diz `limitado`.
    // Vem antes do push, que nesse caso também traz `avisados: 0` (e viraria "sem_push", sem o motivo).
    if (r.limitado === true) return 'limitado';
    // `push.avisados === 0`: gravado, mas nenhum celular avisado.
    if (r.push) return r.push.avisados === 0 ? 'sem_push' : 'enviado';
    // Reenvio que achou o pedido já gravado, sem dado do push (o servidor não
    // guarda o resultado do primeiro envio). Antes isto virava "enviado" e a
    // tela dizia "ALERTA ENVIADO! O celular do cuidador foi avisado" sem
    // ninguém saber (revisão de UX de 19/10/2026).
    if (r.repetido) return 'push_incerto';
    // Sem o campo e sem ser reenvio: servidor anterior a 19/10/2026, que não
    // diz do push — vale o `ok`, como antes.
    return 'enviado';
  }
  if (r.error === 'sem_vinculo') return 'sem_nuvem';
  if (r.enfileirado) return 'na_fila';
  return 'falhou';
}

export function entregaDoPedido(id: string): EntregaDoPedido | null {
  return entregas.get(id) ?? null;
}

/** O id do pedido no servidor, quando ele gravou com outro id; senão `null`. */
export function idDoPedidoNoServidor(id: string): string | null {
  return idsNoServidor.get(id) ?? null;
}

export function ouvirEntrega(o: (id: string, entrega: EntregaDoPedido) => void): () => void {
  ouvintesDeEntrega.add(o);
  return () => { ouvintesDeEntrega.delete(o); };
}

// ---------- entrega das falas acompanhadas ----------
//
// Revisão de UX de 20/10/2026, achado 3: o mapa da dor dizia "Mandei para o
// celular do cuidador" deduzindo só do vínculo e de `navigator.onLine`, com o
// resultado do envio ignorado. E `message.send` só GRAVA a frase na conversa:
// o servidor não manda push, e o app do cuidador só a mostra (e vibra) com o
// app aberto. Por isso aqui não existe "avisado" — quem precisa que o celular
// toque manda também um pedido de ajuda (ver `EntregaDoPedido`).

/**
 * - `enviando`: saiu para o servidor, sem resposta ainda;
 * - `gravada`: está na conversa; o cuidador vê quando abrir o app;
 * - `na_fila`: sem internet — sai sozinha quando a conexão voltar;
 * - `sem_nuvem`: este computador não está ligado a um celular de cuidador;
 * - `falhou`: o servidor recusou;
 * - `ensaio`: modo apresentação — nada foi enviado de propósito.
 */
export type EntregaDaMensagem = 'enviando' | 'gravada' | 'na_fila' | 'sem_nuvem' | 'falhou' | 'ensaio';

const entregasDeMensagem = new Map<string, EntregaDaMensagem>();
const ouvintesDeMensagem = new Set<(id: string, entrega: EntregaDaMensagem) => void>();

export function informarEntregaDaMensagem(id: string, entrega: EntregaDaMensagem): void {
  // "Gravada" não volta atrás: uma resposta atrasada de outra tentativa não
  // pode desdizer a entrega.
  const anterior = entregasDeMensagem.get(id);
  if (anterior === 'gravada' && entrega !== 'gravada') return;
  entregasDeMensagem.set(id, entrega);
  if (entregasDeMensagem.size > 50) entregasDeMensagem.delete(entregasDeMensagem.keys().next().value as string);
  for (const o of ouvintesDeMensagem) {
    try {
      o(id, entrega);
    } catch (err) {
      console.warn('[cloud] ouvinte de entrega da mensagem falhou', err);
    }
  }
}

/** O que a resposta do `message.send` diz sobre a frase. */
export function entregaDaMensagemPelaResposta(r: RespostaSync): EntregaDaMensagem {
  if (r.ok) return 'gravada';
  if (r.error === 'sem_vinculo') return 'sem_nuvem';
  if (r.enfileirado) return 'na_fila';
  return 'falhou';
}

export function entregaDaMensagem(id: string): EntregaDaMensagem | null {
  return entregasDeMensagem.get(id) ?? null;
}

export function ouvirEntregaDaMensagem(o: (id: string, entrega: EntregaDaMensagem) => void): () => void {
  ouvintesDeMensagem.add(o);
  return () => { ouvintesDeMensagem.delete(o); };
}

/** Só para testes: zera os ouvintes. */
export function _limparOuvintes(): void {
  ouvintes.clear();
  ouvintesDeEntrega.clear();
  entregas.clear();
  idsNoServidor.clear();
  ouvintesDeMensagem.clear();
  entregasDeMensagem.clear();
}
