/**
 * Perguntas para levar ao médico (21/10/2026).
 *
 * Quem passa meses sem conseguir falar esquece, na hora da consulta, o que
 * queria perguntar. A lista tem duas origens:
 *   - o cuidador digita;
 *   - o paciente escreve pelo teclado do olhar — e as frases dele que terminam
 *     em "?" ficam disponíveis (`perguntasDasFrases`) para ele levar à consulta
 *     com um toque, sem reescrever letra a letra.
 *
 * Local, por paciente, só com a autorização do histórico clínico, e apagado
 * junto com ele (ver `clearClinicalData`).
 */

import { hasConsent, perfilAtivoDoHistorico, type ResultadoDoRegistro, type SpokenSentence } from '../../utils/clinicalLogger';
import { chaveDasPerguntas } from '../evolucao/chaves';
import { diaDeBrasilia, somarDias } from '../evolucao/fuso';
import { registrarFalhaDeGravacao } from '../local/falhasDeGravacao';

export type QuemPergunta = 'paciente' | 'cuidador';

export interface PerguntaDaConsulta {
  id: string;
  texto: string;
  quem: QuemPergunta;
  /** ISO. */
  criadaEm: string;
  feita: boolean;
}

/** Cabe na folha de 1 página, ao lado das outras seções. */
export const MAX_PERGUNTAS = 40;
export const MAX_TEXTO_DA_PERGUNTA = 200;
/** Quantas frases-pergunta do teclado se oferecem de uma vez. */
export const MAX_PERGUNTAS_SUGERIDAS = 8;
const DIAS_DAS_FRASES = 30;

const VERSAO = 1;

/** `crypto.randomUUID` pode faltar (contexto sem ele); o id só precisa ser único neste computador. */
function novoId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `pergunta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const normalizar = (texto: string): string => texto.replace(/\s+/g, ' ').trim();
/** Para comparar: sem maiúsculas nem espaços a mais. */
const chaveDe = (texto: string): string => normalizar(texto).toLocaleLowerCase('pt-BR');

let ultimoAviso = -Infinity;
function avisarNoConsole(mensagem: string, erro?: unknown): void {
  const agora = Date.now();
  if (agora - ultimoAviso < 60_000) return;
  ultimoAviso = agora;
  console.warn(`[perguntas] ${mensagem}`, erro ?? '');
}

/** As perguntas do paciente, das mais antigas para as mais novas. Conteúdo estragado dá lista vazia, com um aviso no console. */
export function lerPerguntas(perfilId: string): PerguntaDaConsulta[] {
  try {
    const bruto = localStorage.getItem(chaveDasPerguntas(perfilId));
    if (bruto === null) return [];
    const o = JSON.parse(bruto) as { versao?: unknown; perguntas?: unknown } | null;
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.versao !== VERSAO || !Array.isArray(o.perguntas)) {
      avisarNoConsole('as perguntas têm um formato desconhecido; serão recomeçadas');
      return [];
    }
    const saida: PerguntaDaConsulta[] = [];
    for (const item of o.perguntas) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const texto = typeof r.texto === 'string' ? normalizar(r.texto).slice(0, MAX_TEXTO_DA_PERGUNTA) : '';
      if (!texto || (r.quem !== 'paciente' && r.quem !== 'cuidador')) continue;
      if (typeof r.id !== 'string' || !r.id) continue;
      saida.push({
        id: r.id,
        texto,
        quem: r.quem,
        criadaEm: typeof r.criadaEm === 'string' && Number.isFinite(Date.parse(r.criadaEm)) ? r.criadaEm : new Date(0).toISOString(),
        feita: r.feita === true,
      });
    }
    return saida;
  } catch (e) {
    avisarNoConsole('as perguntas estão ilegíveis; serão recomeçadas', e);
    return [];
  }
}

/** Quem pode gravar: com autorização e com paciente. `string` = o paciente; senão, por que não. */
function pacienteQueGrava(): { paciente: string } | { motivo: ResultadoDoRegistro } {
  try {
    if (!hasConsent()) return { motivo: 'sem_consentimento' };
  } catch {
    return { motivo: 'falhou' };
  }
  const paciente = perfilAtivoDoHistorico();
  return paciente === null ? { motivo: 'sem_perfil' } : { paciente };
}

function gravar(paciente: string, perguntas: PerguntaDaConsulta[]): ResultadoDoRegistro {
  try {
    localStorage.setItem(chaveDasPerguntas(paciente), JSON.stringify({ versao: VERSAO, perguntas }));
    return 'gravado';
  } catch (e) {
    registrarFalhaDeGravacao('historico', e);
    return 'falhou';
  }
}

/**
 * Acrescenta uma pergunta. Devolve por que ficou (ou não) gravada:
 *   - `repetida`: a mesma pergunta ainda pendente já está na lista;
 *   - `cheia`: a lista está no limite e não há pergunta já feita para dar lugar
 *     — nunca se apaga uma pergunta pendente para abrir espaço;
 *   - `invalido`: texto vazio ou autor desconhecido;
 *   - `sem_consentimento`, `sem_perfil`, `falhou`: como no histórico clínico.
 */
export function adicionarPergunta(texto: string, quem: QuemPergunta, agora: number = Date.now()): ResultadoDoRegistro | 'invalido' | 'repetida' | 'cheia' {
  if (quem !== 'paciente' && quem !== 'cuidador') return 'invalido';
  const limpo = normalizar(typeof texto === 'string' ? texto : '').slice(0, MAX_TEXTO_DA_PERGUNTA).trim();
  if (!limpo) return 'invalido';
  const quemGrava = pacienteQueGrava();
  if ('motivo' in quemGrava) return quemGrava.motivo;

  let lista = lerPerguntas(quemGrava.paciente);
  const chave = chaveDe(limpo);
  if (lista.some((p) => !p.feita && chaveDe(p.texto) === chave)) return 'repetida';
  if (lista.length >= MAX_PERGUNTAS) {
    const indiceDaFeitaMaisAntiga = lista.findIndex((p) => p.feita);
    if (indiceDaFeitaMaisAntiga === -1) return 'cheia';
    lista = lista.filter((_, i) => i !== indiceDaFeitaMaisAntiga);
  }
  lista.push({
    id: novoId(),
    texto: limpo,
    quem,
    criadaEm: new Date(Number.isFinite(agora) ? agora : Date.now()).toISOString(),
    feita: false,
  });
  return gravar(quemGrava.paciente, lista);
}

export function marcarComoFeita(id: string, feita = true): ResultadoDoRegistro | 'invalido' {
  const quemGrava = pacienteQueGrava();
  if ('motivo' in quemGrava) return quemGrava.motivo;
  const lista = lerPerguntas(quemGrava.paciente);
  if (!lista.some((p) => p.id === id)) return 'invalido';
  return gravar(quemGrava.paciente, lista.map((p) => (p.id === id ? { ...p, feita } : p)));
}

export function removerPergunta(id: string): ResultadoDoRegistro | 'invalido' {
  const quemGrava = pacienteQueGrava();
  if ('motivo' in quemGrava) return quemGrava.motivo;
  const lista = lerPerguntas(quemGrava.paciente);
  if (!lista.some((p) => p.id === id)) return 'invalido';
  return gravar(quemGrava.paciente, lista.filter((p) => p.id !== id));
}

/**
 * As frases do paciente que são perguntas: terminam em "?", dos últimos 30
 * dias (de Brasília), das mais novas para as mais antigas, sem repetir e sem as
 * que já estão na lista. No máximo `MAX_PERGUNTAS_SUGERIDAS`.
 *
 * Uma pergunta escrita letra a letra pelo olhar custa minutos; ela não pode se
 * perder só porque, na hora, ninguém anotou.
 */
export function perguntasDasFrases(
  frases: ReadonlyArray<SpokenSentence>,
  jaNaLista: ReadonlyArray<PerguntaDaConsulta>,
  agora: number,
): string[] {
  const hoje = diaDeBrasilia(agora);
  if (hoje === null) return [];
  const limite = somarDias(hoje, -DIAS_DAS_FRASES);

  const jaVistas = new Set(jaNaLista.filter((p) => !p.feita).map((p) => chaveDe(p.texto)));
  const candidatas = frases
    .map((f) => ({ texto: typeof f?.text === 'string' ? normalizar(f.text) : '', ms: Date.parse(f?.timestamp) }))
    .filter((f) => Number.isFinite(f.ms) && f.texto.endsWith('?') && f.texto.length >= 4 && f.texto.length <= MAX_TEXTO_DA_PERGUNTA)
    .filter((f) => (diaDeBrasilia(f.ms) ?? '') >= limite)
    .sort((a, b) => b.ms - a.ms);

  const saida: string[] = [];
  for (const c of candidatas) {
    const chave = chaveDe(c.texto);
    if (jaVistas.has(chave)) continue;
    jaVistas.add(chave);
    saida.push(c.texto);
    if (saida.length >= MAX_PERGUNTAS_SUGERIDAS) break;
  }
  return saida;
}
