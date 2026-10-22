/**
 * Quantas sugestões de resposta o paciente aceita — a medida que decide se a
 * faixa continua aparecendo.
 *
 * Roadmap 1 (rodada 3, 21/10/2026): "o sistema mede quantas sugestões são
 * aceitas. Abaixo de 30%, a faixa recolhe". Sugestão que quase nunca serve é
 * ruído em alvos grandes, e ruído num teclado ocular custa fadiga.
 *
 * Só contadores, no computador, por paciente. Nada do conteúdo das conversas:
 * guardam-se números e os identificadores das mensagens já contadas (para a
 * mesma mensagem não valer duas vezes quando a tela é desenhada de novo).
 *
 * Duas decisões de rigor:
 *   - Amostra mínima de 20. Com 3 mostradas e nenhuma aceita a taxa é 0%, e
 *     recolher a faixa por isso seria tirar a ajuda antes de ela ter tido
 *     chance de provar que serve.
 *   - "Abaixo de 30%" é estritamente abaixo: 6 em 20 (30%) ainda fica.
 */

import { perfilDoAssistente } from './armazenamento';
import { avisarUmaVez } from './avisoUnico';
import { BASE_DA_ACEITACAO, avisarMudancaDoAprendizado, chaveDoPaciente } from './chavesPorPaciente';

export const AMOSTRA_MINIMA = 20;
export const TAXA_MINIMA = 0.3;
/** Quantos identificadores recentes ficam guardados para não contar em dobro. */
const MAX_IDS = 40;

interface Guardado {
  mostradas: number;
  aceitas: number;
  /** Quando a contagem começou (ms desde 1970); 0 enquanto nada foi contado. */
  desde: number;
  vistas: string[];
  escolhidas: string[];
}

export interface Aceitacao {
  mostradas: number;
  aceitas: number;
  desde: number;
  /** aceitas ÷ mostradas; `null` sem nenhuma mostrada. */
  taxa: number | null;
}

const chave = (): string => chaveDoPaciente(BASE_DA_ACEITACAO, perfilDoAssistente());

const naoNegativo = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-MAX_IDS) : [];

function ler(): Guardado {
  const vazio: Guardado = { mostradas: 0, aceitas: 0, desde: 0, vistas: [], escolhidas: [] };
  try {
    const bruto = localStorage.getItem(chave());
    if (!bruto) return vazio;
    const j = JSON.parse(bruto) as Record<string, unknown> | null;
    if (!j || typeof j !== 'object') return vazio;
    const mostradas = naoNegativo(j.mostradas);
    return {
      mostradas,
      // Nunca mais aceitas que mostradas, nem se o dado estiver estragado.
      aceitas: Math.min(naoNegativo(j.aceitas), mostradas),
      desde: naoNegativo(j.desde),
      vistas: textos(j.vistas),
      escolhidas: textos(j.escolhidas),
    };
  } catch (e) {
    avisarUmaVez('aceitacao:leitura', '[sugestões] não consegui ler a contagem de aceitas; recomeçando do zero', e);
    return vazio;
  }
}

function gravar(g: Guardado): void {
  try {
    localStorage.setItem(chave(), JSON.stringify({ v: 1, ...g }));
  } catch (e) {
    avisarUmaVez('aceitacao:gravacao', '[sugestões] não foi possível gravar a contagem de aceitas', e);
  }
}

export function lerAceitacao(): Aceitacao {
  const g = ler();
  return { mostradas: g.mostradas, aceitas: g.aceitas, desde: g.desde, taxa: g.mostradas > 0 ? g.aceitas / g.mostradas : null };
}

/** A faixa foi mostrada para esta mensagem do cuidador. Conta uma vez por mensagem. */
export function registrarSugestaoMostrada(idDaMensagem: string): void {
  const g = ler();
  if (g.vistas.includes(idDaMensagem)) return;
  g.mostradas += 1;
  g.vistas = [...g.vistas, idDaMensagem].slice(-MAX_IDS);
  if (!g.desde) g.desde = Date.now();
  gravar(g);
}

/** O paciente escolheu uma das sugestões desta mensagem. Conta uma vez por mensagem. */
export function registrarSugestaoAceita(idDaMensagem: string): void {
  const g = ler();
  if (g.escolhidas.includes(idDaMensagem)) return;
  if (!g.vistas.includes(idDaMensagem)) {
    g.mostradas += 1;
    g.vistas = [...g.vistas, idDaMensagem].slice(-MAX_IDS);
  }
  g.aceitas += 1;
  g.escolhidas = [...g.escolhidas, idDaMensagem].slice(-MAX_IDS);
  if (!g.desde) g.desde = Date.now();
  gravar(g);
}

/** A regra pura: amostra suficiente e taxa abaixo do mínimo. */
export function estaRecolhida(a: { mostradas: number; aceitas: number }): boolean {
  return a.mostradas >= AMOSTRA_MINIMA && a.aceitas / a.mostradas < TAXA_MINIMA;
}

export function sugestoesRecolhidas(): boolean {
  return estaRecolhida(lerAceitacao());
}

/** Recomeça a contagem (a faixa volta por mais uma rodada de 20). */
export function zerarAceitacao(): void {
  try {
    localStorage.removeItem(chave());
  } catch (e) {
    avisarUmaVez('aceitacao:zerar', '[sugestões] não foi possível zerar a contagem de aceitas', e);
  }
  avisarMudancaDoAprendizado();
}
