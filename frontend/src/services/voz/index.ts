/**
 * A voz do paciente: um ponto de entrada para tudo que o app fala EM NOME
 * DELE (teclado, frases, pictogramas, respostas ao cuidador).
 *
 *   falar(texto) → voz clonada local, se estiver pronta e liberada;
 *                  senão, voz do sistema. Nunca lança; sempre fala com
 *                  alguma voz ou explica por que não falou
 *                  (`{ origem: 'nenhuma', motivo }`).
 *
 * Alarmes (emergência) e a leitura das mensagens do CUIDADOR não passam por
 * aqui de propósito: não são a fala do paciente e não devem sair na voz dele
 * — chamam `falarComVozDoSistema` direto.
 *
 * O estado do motor (voz importada? ativa? modelo baixado?) vem do processo
 * principal e é espelhado aqui para as telas, com um hook.
 */

import { useEffect, useState } from 'react';
import type { EstadoDoMotorDeVoz } from '@tracker/voz/protocolo';
import { LICENSE_KEY } from '../../context/LicenseContext';
import type { Plan } from '../license/types';
import { pararVozClonada, ponteDaVoz, tocarWav, type PonteDaVoz } from './local';
import { falarComVozDoSistemaComDesfecho, pararVozDoSistema, type OpcoesDaVozDoSistema } from './sistema';
import { comAFalaDoPacienteMarcada } from './falaEmCurso';
import type { ResultadoDaFala } from './resultado';

export type { OrigemDaVoz, ResultadoDaFala } from './resultado';
export { falaSaiu, falaFalhou } from './resultado';

export interface OpcoesDeFala extends OpcoesDaVozDoSistema {
  /** Força a voz do sistema mesmo com a clonada pronta. */
  sistema?: boolean;
}

// ---------------------------------------------------------------------------
// Estado do motor, espelhado do main.
// ---------------------------------------------------------------------------

let estadoAtual: EstadoDoMotorDeVoz | null = null;
let cancelarAssinatura: (() => void) | null = null;
let carregando: Promise<void> | null = null;
const ouvintes = new Set<(e: EstadoDoMotorDeVoz | null) => void>();

function notificar(): void {
  for (const cb of ouvintes) {
    try { cb(estadoAtual); } catch (e) { console.error('[voz] ouvinte lançou', e); }
  }
}

/** Garante a assinatura do estado e a primeira leitura. Idempotente. */
export function acompanharEstadoDaVoz(ponte: PonteDaVoz | null = ponteDaVoz()): Promise<void> {
  if (!ponte) return Promise.resolve();
  if (!cancelarAssinatura) {
    cancelarAssinatura = ponte.onEstado((e) => { estadoAtual = e; notificar(); });
  }
  if (!carregando) {
    carregando = ponte.estado().then((e) => { estadoAtual = e; notificar(); }).catch(() => undefined);
  }
  return carregando;
}

export function estadoDaVoz(): EstadoDoMotorDeVoz | null {
  return estadoAtual;
}

export function assinarEstadoDaVoz(cb: (e: EstadoDoMotorDeVoz | null) => void): () => void {
  ouvintes.add(cb);
  void acompanharEstadoDaVoz();
  return () => { ouvintes.delete(cb); };
}

/** Hook para telas: `null` até a primeira resposta do main (ou fora do Electron). */
export function useEstadoDaVoz(): EstadoDoMotorDeVoz | null {
  const [estado, setEstado] = useState<EstadoDoMotorDeVoz | null>(estadoAtual);
  useEffect(() => assinarEstadoDaVoz(setEstado), []);
  return estado;
}

// ---------------------------------------------------------------------------
// Licença.
// ---------------------------------------------------------------------------

/**
 * O plano inclui voz clonada? Lê a licença gravada pelo `LicenseContext`.
 * Sem `features` (mock, cache antigo) trata como liberado — é o cache de uma
 * licença válida, e negar um recurso por falta de metadado puniria o paciente.
 */
export function vozClonadaLiberadaPelaLicenca(): boolean {
  try {
    const raw = localStorage.getItem(LICENSE_KEY);
    if (!raw) return true;
    const plan = (JSON.parse(raw) as { plan?: Plan }).plan;
    const voz = plan?.features?.voz;
    return voz === undefined ? true : voz === true;
  } catch {
    return true;
  }
}

/** Voz clonada pronta para falar agora. */
export function vozClonadaPronta(e: EstadoDoMotorDeVoz | null = estadoAtual): boolean {
  return !!e && e.disponivel && e.voz.importada && e.ativa && e.motor !== 'erro' && vozClonadaLiberadaPelaLicenca();
}

// ---------------------------------------------------------------------------
// Falar.
// ---------------------------------------------------------------------------

export function pararFala(): void {
  pararVozClonada();
  pararVozDoSistema();
}

/**
 * Quanto o paciente espera pela voz clonada antes de o app falar com a voz do
 * sistema. Frases já ditas saem do cache na hora; uma frase nova em CPU pode
 * levar 3–8 s (mais a carga do modelo na primeira vez), e ficar mudo esse
 * tempo é pior do que falar com a outra voz. A geração continua em segundo
 * plano: na próxima vez a frase sai clonada.
 */
export const ORCAMENTO_DA_VOZ_CLONADA_MS = 4_000;

/** Contador de falas: uma fala nova invalida a anterior (a última vence). */
let turno = 0;

const esperar = (ms: number) => new Promise<null>((r) => setTimeout(() => r(null), ms));

/** O que a tentativa com a voz clonada deu. */
type TentativaClonada =
  | { desfecho: 'tocou' }
  | { desfecho: 'substituida' }
  /** Começou a decodificar e alguém parou a voz antes do som sair. */
  | { desfecho: 'interrompida' }
  /** A clonada não serve agora: fala com a do sistema (`motivo` diz por quê). */
  | { desfecho: 'usar_sistema'; motivo?: string };

/**
 * A voz clonada, inteira dentro de um `try`.
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 5): o
 * `sintetizar` do cache e o `Promise.race` da geração ficavam fora de qualquer
 * `try`, embora o contrato de `falar()` seja "nunca lança". Quando o IPC
 * rejeitava (arquivo do cache preso pelo antivírus, apagado no meio da leitura),
 * `falar()` rejeitava, as telas só registravam no console, e a frase sumia —
 * sem cair para a voz do sistema. Agora qualquer exceção aqui vira "usar a voz
 * do sistema".
 */
async function tentarVozClonada(
  t: string,
  opcoes: OpcoesDeFala,
  substituida: () => boolean,
): Promise<TentativaClonada> {
  try {
    // Primeira fala do app: o espelho do estado pode ainda não ter chegado.
    if (estadoAtual === null) await acompanharEstadoDaVoz();
    const ponte = ponteDaVoz();
    if (!ponte || !vozClonadaPronta()) return { desfecho: 'usar_sistema' };

    // 1. Já está no cache? Toca na hora.
    const emCache = await ponte.sintetizar(t, { soCache: true });
    if (substituida()) return { desfecho: 'substituida' };
    let wav: ArrayBuffer;
    if (emCache.ok) {
      wav = emCache.wav;
    } else if (emCache.motivo === 'nao_em_cache') {
      // 2. Gera com prazo. Dentro do prazo, toca clonada; fora dele, fala com
      //    o sistema agora e deixa a geração terminar para o cache.
      const geracao = ponte.sintetizar(t);
      // A geração segue sozinha quando não é esperada: uma falha depois do
      // prazo não pode virar rejeição sem dono.
      geracao.catch(() => undefined);
      const vencedor = await Promise.race([geracao.then((r) => ({ r })), esperar(ORCAMENTO_DA_VOZ_CLONADA_MS)]);
      if (substituida()) return { desfecho: 'substituida' };
      if (!vencedor) return { desfecho: 'usar_sistema', motivo: 'demorou' };
      if (!vencedor.r.ok) {
        console.warn('[voz] clonada indisponível, usando a voz do sistema:', vencedor.r.motivo, vencedor.r.erro ?? '');
        return { desfecho: 'usar_sistema', motivo: vencedor.r.motivo };
      }
      wav = vencedor.r.wav;
    } else {
      console.warn('[voz] clonada indisponível, usando a voz do sistema:', emCache.motivo, emCache.erro ?? '');
      return { desfecho: 'usar_sistema', motivo: emCache.motivo };
    }

    const tocou = await tocarWav(wav, opcoes.aoComecar);
    if (substituida()) return { desfecho: 'substituida' };
    return tocou ? { desfecho: 'tocou' } : { desfecho: 'interrompida' };
  } catch (e) {
    console.warn('[voz] a voz clonada falhou, usando a voz do sistema:', e);
    return { desfecho: 'usar_sistema', motivo: 'erro' };
  }
}

/**
 * Último aviso no console por motivo de silêncio: a frase que não saiu vai
 * para o console uma vez a cada minuto por motivo, não a cada "Falar".
 */
const ultimoAvisoDeSilencio = new Map<string, number>();
const INTERVALO_DO_AVISO_DE_SILENCIO_MS = 60_000;

function avisarSilencio(motivo: string): void {
  const agora = Date.now();
  const ultimo = ultimoAvisoDeSilencio.get(motivo) ?? -Infinity;
  if (agora - ultimo < INTERVALO_DO_AVISO_DE_SILENCIO_MS) return;
  ultimoAvisoDeSilencio.set(motivo, agora);
  console.warn(`[voz] a fala do paciente não saiu (${motivo}); a tela mostra o texto em letra grande.`);
}

/**
 * Fala `texto` em nome do paciente.
 *
 * Do instante da chamada até a fala acabar — a espera pela voz clonada
 * inclusive —, `pacienteFalando()` (`./falaEmCurso`) é verdadeiro: a varredura
 * falada do Plano B (rodada 3, 21/10/2026) consulta isso antes de anunciar um
 * botão, porque a voz do sistema começa com `cancel()` e cortaria a frase.
 */
export function falar(texto: string, opcoes: OpcoesDeFala = {}): Promise<ResultadoDaFala> {
  return comAFalaDoPacienteMarcada(() => falarDeVerdade(texto, opcoes));
}

async function falarDeVerdade(texto: string, opcoes: OpcoesDeFala): Promise<ResultadoDaFala> {
  const t = texto.trim();
  if (!t) return { origem: 'nenhuma', motivo: 'texto vazio' };
  const meuTurno = ++turno;
  const substituida = () => turno !== meuTurno;
  pararFala();

  let motivoDaClonada: string | undefined;
  if (!opcoes.sistema) {
    const tentativa = await tentarVozClonada(t, opcoes, substituida);
    if (tentativa.desfecho === 'tocou') return { origem: 'clonada' };
    if (tentativa.desfecho === 'substituida') return { origem: 'nenhuma', motivo: 'substituida' };
    if (tentativa.desfecho === 'interrompida') return { origem: 'nenhuma', motivo: 'interrompida' };
    motivoDaClonada = tentativa.motivo;
  }

  if (substituida()) return { origem: 'nenhuma', motivo: 'substituida' };
  // O desfecho da voz do sistema era descartado: a tela dizia "falou" com o
  // sistema sem voz instalada ou o sintetizador travado.
  const d = await falarComVozDoSistemaComDesfecho(t, opcoes);
  if (substituida()) return { origem: 'nenhuma', motivo: 'substituida' };
  if (d.falou) return motivoDaClonada ? { origem: 'sistema', motivo: motivoDaClonada } : { origem: 'sistema' };
  if (d.motivo === 'interrompida') return { origem: 'nenhuma', motivo: 'interrompida' };
  avisarSilencio(d.motivo);
  return { origem: 'nenhuma', motivo: d.motivo };
}

/**
 * Sintetiza frases em segundo plano, sem tocar, para o cache: frases rápidas
 * e pictogramas saem instantâneos na primeira vez que o paciente as usa.
 * Uma por vez, e para de tentar no primeiro erro do motor.
 */
export async function aquecerCache(textos: string[], ponte: PonteDaVoz | null = ponteDaVoz()): Promise<number> {
  if (!ponte || !vozClonadaPronta()) return 0;
  let feitas = 0;
  for (const texto of textos) {
    const t = texto.trim();
    if (!t) continue;
    const r = await ponte.sintetizar(t);
    if (!r.ok) {
      if (r.motivo === 'motor' || r.motivo === 'sem_modelo' || r.motivo === 'indisponivel') break;
      continue;
    }
    feitas++;
  }
  return feitas;
}

/** Só para testes: zera o espelho do estado. */
export function _redefinirVoz(): void {
  estadoAtual = null;
  cancelarAssinatura?.();
  cancelarAssinatura = null;
  carregando = null;
  ouvintes.clear();
  ultimoAvisoDeSilencio.clear();
}
