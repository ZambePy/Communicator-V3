/**
 * Diário da consulta (21/10/2026): como foi o sono, como está o humor e uma
 * nota, por dia, para a pessoa levar ao médico em vez de tentar lembrar.
 *
 * A DOR não se digita aqui: vem do mapa da dor, que já guarda lugar e nível
 * (ver `dorPorDia`). Dois lugares para dizer a mesma coisa só produziriam
 * números diferentes.
 *
 * Local, por paciente, só com a autorização do histórico clínico, e apagado
 * junto com ele (ver `clearClinicalData`). Dia no fuso de Brasília.
 */

import { hasConsent, perfilAtivoDoHistorico, type RegistroDeDor, type ResultadoDoRegistro } from '../../utils/clinicalLogger';
import { chaveDoDiario } from '../evolucao/chaves';
import { diaDeBrasilia, ehDia } from '../evolucao/fuso';
import { registrarFalhaDeGravacao } from '../local/falhasDeGravacao';

export interface EntradaDoDiario {
  /** `AAAA-MM-DD`, em Brasília. */
  dia: string;
  /** 1 (muito ruim) a 5 (muito bom); `null` = não marcado. */
  sono: number | null;
  /** 1 (muito mal) a 5 (muito bem); `null` = não marcado. */
  humor: number | null;
  nota: string;
}

/** Palavra para cada degrau: o rosto ou o número sozinho não bastam a quem lê a folha impressa. */
export const ROTULOS_DO_SONO = ['Muito ruim', 'Ruim', 'Regular', 'Bom', 'Muito bom'] as const;
export const ROTULOS_DO_HUMOR = ['Muito mal', 'Mal', 'Mais ou menos', 'Bem', 'Muito bem'] as const;

/** Mais de um ano de diário. */
export const MAX_DIAS_NO_DIARIO = 400;
/** Cabe na folha de 1 página e na paciência de quem escreve letra a letra. */
export const MAX_NOTA = 280;

const VERSAO = 1;

const degrau = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

const limparNota = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, MAX_NOTA).trim() : '');

const vazia = (dia: string): EntradaDoDiario => ({ dia, sono: null, humor: null, nota: '' });

let ultimoAviso = -Infinity;
function avisarNoConsole(mensagem: string, erro?: unknown): void {
  const agora = Date.now();
  if (agora - ultimoAviso < 60_000) return;
  ultimoAviso = agora;
  console.warn(`[diario] ${mensagem}`, erro ?? '');
}

/** O diário do paciente, do dia mais antigo ao mais recente. Conteúdo estragado dá lista vazia, com um aviso no console. */
export function lerDiario(perfilId: string): EntradaDoDiario[] {
  try {
    const bruto = localStorage.getItem(chaveDoDiario(perfilId));
    if (bruto === null) return [];
    const o = JSON.parse(bruto) as { versao?: unknown; dias?: unknown } | null;
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.versao !== VERSAO || !Array.isArray(o.dias)) {
      avisarNoConsole('o diário tem um formato desconhecido; será recomeçado');
      return [];
    }
    const porDia = new Map<string, EntradaDoDiario>();
    for (const item of o.dias) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      if (!ehDia(r.dia)) continue;
      porDia.set(r.dia, { dia: r.dia, sono: degrau(r.sono), humor: degrau(r.humor), nota: limparNota(r.nota) });
    }
    return [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  } catch (e) {
    avisarNoConsole('o diário está ilegível; será recomeçado', e);
    return [];
  }
}

export function entradaDoDia(perfilId: string, dia: string): EntradaDoDiario {
  return lerDiario(perfilId).find((e) => e.dia === dia) ?? vazia(dia);
}

export interface ParteDoDiario {
  sono?: number | null;
  humor?: number | null;
  nota?: string;
}

/**
 * Grava só o que veio em `parte`, no dia de `agora`: tocar no humor não apaga o
 * sono já marcado. `null` desmarca. Devolve por que ficou (ou não) gravado — a
 * tela diz, em vez de dar por salvo:
 *   - `invalido`: sono ou humor fora de 1 a 5 (nada é gravado);
 *   - `sem_consentimento`, `sem_perfil`, `falhou`: como no histórico clínico.
 */
export function salvarNoDiario(parte: ParteDoDiario, agora: number = Date.now()): ResultadoDoRegistro | 'invalido' {
  for (const campo of ['sono', 'humor'] as const) {
    const v = parte[campo];
    if (v !== undefined && v !== null && degrau(v) === null) return 'invalido';
  }
  try {
    if (!hasConsent()) return 'sem_consentimento';
  } catch {
    return 'falhou';
  }
  const paciente = perfilAtivoDoHistorico();
  if (paciente === null) return 'sem_perfil';
  const dia = diaDeBrasilia(agora);
  if (dia === null) return 'invalido';

  const dias = lerDiario(paciente);
  const atual = dias.find((e) => e.dia === dia) ?? vazia(dia);
  const novo: EntradaDoDiario = {
    dia,
    sono: parte.sono === undefined ? atual.sono : parte.sono,
    humor: parte.humor === undefined ? atual.humor : parte.humor,
    nota: parte.nota === undefined ? atual.nota : limparNota(parte.nota),
  };
  const semAtual = dias.filter((e) => e.dia !== dia);
  // Um dia sem sono, humor nem nota não é registro: não ocupa lugar.
  const lista = novo.sono === null && novo.humor === null && novo.nota === '' ? semAtual : [...semAtual, novo];
  lista.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  const recentes = lista.length > MAX_DIAS_NO_DIARIO ? lista.slice(-MAX_DIAS_NO_DIARIO) : lista;
  try {
    localStorage.setItem(chaveDoDiario(paciente), JSON.stringify({ versao: VERSAO, dias: recentes }));
    return 'gravado';
  } catch (e) {
    registrarFalhaDeGravacao('historico', e);
    return 'falhou';
  }
}

/** A dor de um dia, lida do mapa da dor. */
export interface DorDoDia {
  dia: string;
  /** O maior nível (0 a 10) relatado no dia. */
  nivelMaximo: number;
  relatos: number;
  /** Do mais citado ao menos citado. */
  lugares: string[];
}

export function dorPorDia(registros: ReadonlyArray<RegistroDeDor>): Map<string, DorDoDia> {
  const porDia = new Map<string, { nivelMaximo: number; relatos: number; lugares: Map<string, number> }>();
  for (const r of registros) {
    if (!r || typeof r.nivel !== 'number' || !Number.isFinite(r.nivel)) continue;
    const dia = diaDeBrasilia(r.timestamp);
    if (dia === null) continue;
    const acc = porDia.get(dia) ?? { nivelMaximo: 0, relatos: 0, lugares: new Map<string, number>() };
    acc.nivelMaximo = Math.max(acc.nivelMaximo, r.nivel);
    acc.relatos += 1;
    const lugar = typeof r.lugar === 'string' && r.lugar.trim() ? r.lugar.trim() : null;
    if (lugar) acc.lugares.set(lugar, (acc.lugares.get(lugar) ?? 0) + 1);
    porDia.set(dia, acc);
  }
  const saida = new Map<string, DorDoDia>();
  for (const [dia, acc] of porDia) {
    const lugares = [...acc.lugares.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
      .map(([lugar]) => lugar);
    saida.set(dia, { dia, nivelMaximo: acc.nivelMaximo, relatos: acc.relatos, lugares });
  }
  return saida;
}
