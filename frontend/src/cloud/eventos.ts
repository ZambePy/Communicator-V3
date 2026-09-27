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
  /** O paciente falou algo (teclado, frase rápida, pictograma, sim/não). */
  | { tipo: 'fala'; texto: string; kind: MessageKind }
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
    return;
  }
  // Ninguém ouvindo (a integração com a nuvem não está montada): o pedido
  // de ajuda não sai deste computador, e a tela precisa saber.
  if (e.tipo === 'ajuda' && e.id && ouvintes.size === 0) informarEntrega(e.id, 'sem_nuvem');
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
export const emitirFalaDoPaciente = (texto: string, kind: MessageKind = 'texto') =>
  emitir({ tipo: 'fala', texto, kind });
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
 * - `enviado`: o servidor gravou (o celular do cuidador recebe);
 * - `na_fila`: sem internet — sai sozinho quando a conexão voltar;
 * - `sem_nuvem`: este computador não está ligado a um celular de cuidador;
 * - `falhou`: o servidor recusou (o alarme continua só aqui);
 * - `ensaio`: modo apresentação — nada foi enviado de propósito.
 */
export type EntregaDoPedido = 'enviando' | 'enviado' | 'na_fila' | 'sem_nuvem' | 'falhou' | 'ensaio';

const entregas = new Map<string, EntregaDoPedido>();
const ouvintesDeEntrega = new Set<(id: string, entrega: EntregaDoPedido) => void>();

export function informarEntrega(id: string, entrega: EntregaDoPedido): void {
  // Um "enviado" não volta para "na fila" (uma resposta atrasada de outra
  // tentativa não pode desdizer a entrega).
  if (entregas.get(id) === 'enviado' && entrega !== 'enviado') return;
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
  if (r.ok) return 'enviado';
  if (r.error === 'sem_vinculo') return 'sem_nuvem';
  if (r.enfileirado) return 'na_fila';
  return 'falhou';
}

export function entregaDoPedido(id: string): EntregaDoPedido | null {
  return entregas.get(id) ?? null;
}

export function ouvirEntrega(o: (id: string, entrega: EntregaDoPedido) => void): () => void {
  ouvintesDeEntrega.add(o);
  return () => { ouvintesDeEntrega.delete(o); };
}

/** Só para testes: zera os ouvintes. */
export function _limparOuvintes(): void {
  ouvintes.clear();
  ouvintesDeEntrega.clear();
  entregas.clear();
}
