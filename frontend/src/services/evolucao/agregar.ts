/**
 * A evolução da pessoa, SEMANA a semana (21/10/2026).
 *
 * Junta o que o app mede — o erro das calibrações e o uso por dia — em linhas
 * de segunda a domingo, no horário de Brasília. É dado de ACOMPANHAMENTO para
 * levar à consulta, não diagnóstico: aqui só se soma, se tira média e se
 * compara com a semana anterior.
 *
 * Princípios que valem para cada número:
 *   - taxa é calculada sobre os TOTAIS da semana (caracteres ÷ tempo digitando),
 *     nunca como média das médias de cada dia: o dia de dois minutos de teste
 *     não pesa igual ao de duas horas;
 *   - sem base suficiente não há número (`null`), e a tela diz "sem dados" em
 *     vez de mostrar uma velocidade tirada de um minuto de teste;
 *   - a semana em andamento aparece, mas é parcial e nunca ganha seta;
 *   - medição herdada (de antes da separação por paciente) pode ser de outra
 *     pessoa: fica de fora, a menos que o cuidador diga que não.
 */

import type { CalibrationLog } from '../../utils/clinicalLogger';
import { diaDeBrasilia, ehDia, segundaDaSemana, somarDias } from './fuso';
import type { DiaDeUso } from './registroDeUso';
import { compararMetrica, type Metrica, type Tendencia } from './tendencia';

/** Quantas semanas a tela mostra, no máximo: os três últimos meses. */
export const MAX_SEMANAS_NA_EVOLUCAO = 12;

/** Menos de um minuto digitando não é velocidade, é um teste de teclado. */
export const MIN_MS_DIGITANDO_PARA_VELOCIDADE = 60_000;
export const MIN_CARACTERES_PARA_VELOCIDADE = 10;

/** "Por hora de uso" com meia hora de uso na semana é número de acaso. */
export const MIN_MINUTOS_PARA_TAXA = 30;

const MS_POR_MINUTO = 60_000;

export type MedicaoDaEvolucao = Pick<CalibrationLog, 'errorDeg' | 'timestamp' | 'herdado'>;

export interface EntradaDaEvolucao {
  calibracoes: ReadonlyArray<MedicaoDaEvolucao>;
  uso: ReadonlyArray<DiaDeUso>;
  /** O instante de "agora": separa a semana em andamento das completas. */
  agora: number;
  /** Quantas semanas mostrar (as mais recentes). */
  semanas?: number;
  /** Contar também as medições herdadas. Padrão: não. */
  incluirHerdadas?: boolean;
}

export type TendenciasDaSemana = Record<Metrica, Tendencia>;

export interface SemanaDeEvolucao {
  /** A segunda-feira (`AAAA-MM-DD`). */
  inicio: string;
  /** O domingo (`AAAA-MM-DD`). */
  fim: string;
  /** Já terminou? A semana de hoje não. */
  completa: boolean;
  /** Há alguma medição ou algum registro de uso nesta semana? */
  temDados: boolean;

  /** Média do erro das medições (graus); `null` sem medição. */
  erroMedioDeg: number | null;
  medicoes: number;

  /** Há registro de uso (qualquer dia) nesta semana? As setas de uso só comparam semanas que têm. */
  usoRegistrado: boolean;
  diasComUso: number;
  minutosUteis: number;
  /** Dwell em uso, média ponderada pelos minutos úteis; `null` sem amostra. */
  dwellMedioMs: number | null;
  caracteres: number;
  caracteresPorMinuto: number | null;
  avisosDeFadiga: number;
  avisosDeFadigaPorHora: number | null;
  desfazer: number;
  desfazerPorHora: number | null;

  /** Em relação à semana anterior; `sem-dados` na semana em andamento e onde falta com o que comparar. */
  tendencias: TendenciasDaSemana;
}

export interface Evolucao {
  /** Da mais antiga para a mais recente, sem buracos, terminando na semana de hoje. */
  semanas: SemanaDeEvolucao[];
  /** Há alguma medição ou algum uso (mesmo fora da janela de semanas)? */
  temDados: boolean;
  /** Medições herdadas que NÃO entraram na curva. */
  herdadasDeFora: number;
  /** Medições herdadas que entraram porque o cuidador pediu. */
  herdadasIncluidas: number;
}

interface Acumulador {
  somaErro: number;
  medicoes: number;
  diasDeUsoRegistrados: number;
  diasComUso: number;
  minutosUteis: number;
  caracteres: number;
  msDigitando: number;
  desfazer: number;
  avisos: number;
  dwellSoma: number;
  dwellAmostras: number;
}

const novoAcumulador = (): Acumulador => ({
  somaErro: 0,
  medicoes: 0,
  diasDeUsoRegistrados: 0,
  diasComUso: 0,
  minutosUteis: 0,
  caracteres: 0,
  msDigitando: 0,
  desfazer: 0,
  avisos: 0,
  dwellSoma: 0,
  dwellAmostras: 0,
});

const SEM_COMPARACAO: Tendencia = { direcao: 'sem-dados', variacao: null };
const semTendencias = (): TendenciasDaSemana => ({
  erro: { ...SEM_COMPARACAO },
  dwell: { ...SEM_COMPARACAO },
  cpm: { ...SEM_COMPARACAO },
  minutos: { ...SEM_COMPARACAO },
  fadiga: { ...SEM_COMPARACAO },
  desfazer: { ...SEM_COMPARACAO },
});

const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function taxaPorHora(contagem: number, minutosUteis: number): number | null {
  return minutosUteis >= MIN_MINUTOS_PARA_TAXA ? contagem / (minutosUteis / 60) : null;
}

function semanaDoAcumulador(inicio: string, a: Acumulador | undefined, hoje: string): SemanaDeEvolucao {
  const fim = somarDias(inicio, 6);
  const acc = a ?? novoAcumulador();
  const caracteresPorMinuto =
    acc.msDigitando >= MIN_MS_DIGITANDO_PARA_VELOCIDADE && acc.caracteres >= MIN_CARACTERES_PARA_VELOCIDADE
      ? acc.caracteres / (acc.msDigitando / MS_POR_MINUTO)
      : null;
  return {
    inicio,
    fim,
    completa: fim < hoje,
    temDados: acc.medicoes > 0 || acc.diasDeUsoRegistrados > 0,
    erroMedioDeg: acc.medicoes > 0 ? acc.somaErro / acc.medicoes : null,
    medicoes: acc.medicoes,
    usoRegistrado: acc.diasDeUsoRegistrados > 0,
    diasComUso: acc.diasComUso,
    minutosUteis: acc.minutosUteis,
    dwellMedioMs: acc.dwellAmostras > 0 ? acc.dwellSoma / acc.dwellAmostras : null,
    caracteres: acc.caracteres,
    caracteresPorMinuto,
    avisosDeFadiga: acc.avisos,
    avisosDeFadigaPorHora: taxaPorHora(acc.avisos, acc.minutosUteis),
    desfazer: acc.desfazer,
    desfazerPorHora: taxaPorHora(acc.desfazer, acc.minutosUteis),
    tendencias: semTendencias(),
  };
}

/** O valor com que a semana entra na comparação; `null` = não entra. */
function valorParaComparar(s: SemanaDeEvolucao, m: Metrica): number | null {
  switch (m) {
    case 'erro':
      return s.erroMedioDeg;
    case 'dwell':
      return s.dwellMedioMs;
    case 'cpm':
      return s.caracteresPorMinuto;
    // Sem registro de uso a semana não teve "zero minutos": ela não foi medida
    // (o registro de uso é novo, e as primeiras semanas só têm calibração).
    case 'minutos':
      return s.usoRegistrado ? s.minutosUteis : null;
    case 'fadiga':
      return s.avisosDeFadigaPorHora;
    case 'desfazer':
      return s.desfazerPorHora;
  }
}

const METRICAS: readonly Metrica[] = ['erro', 'dwell', 'cpm', 'minutos', 'fadiga', 'desfazer'];

export function agregarPorSemana(entrada: EntradaDaEvolucao): Evolucao {
  const vazio: Evolucao = { semanas: [], temDados: false, herdadasDeFora: 0, herdadasIncluidas: 0 };
  const hoje = diaDeBrasilia(entrada.agora);
  if (hoje === null) return vazio;

  const semanaAtual = segundaDaSemana(hoje);
  const pedidas = finito(entrada.semanas) ? Math.floor(entrada.semanas) : MAX_SEMANAS_NA_EVOLUCAO;
  const quantas = Math.min(104, Math.max(1, pedidas));
  const inicioDaJanela = somarDias(semanaAtual, -7 * (quantas - 1));

  const porSemana = new Map<string, Acumulador>();
  /** A semana mais antiga com qualquer dado — mesmo fora da janela, para saber que HÁ histórico. */
  let primeiraComDado: string | null = null;
  const acumulador = (inicio: string): Acumulador | null => {
    // Depois da semana de hoje é relógio errado: não abre semana no futuro.
    if (inicio > semanaAtual) return null;
    if (primeiraComDado === null || inicio < primeiraComDado) primeiraComDado = inicio;
    if (inicio < inicioDaJanela) return null;
    let a = porSemana.get(inicio);
    if (!a) {
      a = novoAcumulador();
      porSemana.set(inicio, a);
    }
    return a;
  };

  let herdadasDeFora = 0;
  let herdadasIncluidas = 0;
  for (const c of entrada.calibracoes) {
    if (!c || !finito(c.errorDeg) || c.errorDeg < 0) continue;
    const dia = diaDeBrasilia(c.timestamp);
    if (dia === null) continue;
    if (c.herdado === true && !entrada.incluirHerdadas) {
      herdadasDeFora += 1;
      continue;
    }
    if (c.herdado === true) herdadasIncluidas += 1;
    const a = acumulador(segundaDaSemana(dia));
    if (!a) continue;
    a.somaErro += c.errorDeg;
    a.medicoes += 1;
  }

  for (const u of entrada.uso) {
    if (!u || !ehDia(u.dia)) continue;
    const a = acumulador(segundaDaSemana(u.dia));
    if (!a) continue;
    a.diasDeUsoRegistrados += 1;
    if (u.minutosUteis > 0) a.diasComUso += 1;
    a.minutosUteis += u.minutosUteis;
    a.caracteres += u.caracteres;
    a.msDigitando += u.msDigitando;
    a.desfazer += u.desfazer;
    a.avisos += u.avisosDeFadiga;
    a.dwellSoma += u.dwellSomaMs;
    a.dwellAmostras += u.dwellAmostras;
  }

  if (primeiraComDado === null) return { ...vazio, herdadasDeFora, herdadasIncluidas };

  const primeira: string = primeiraComDado;
  const inicioDasLinhas = primeira > inicioDaJanela ? primeira : inicioDaJanela;
  const semanas: SemanaDeEvolucao[] = [];
  for (let inicio = inicioDasLinhas; inicio <= semanaAtual; inicio = somarDias(inicio, 7)) {
    semanas.push(semanaDoAcumulador(inicio, porSemana.get(inicio), hoje));
  }

  // Seta: só semana completa contra a semana completa que vem antes dela.
  for (let i = 1; i < semanas.length; i += 1) {
    const atual = semanas[i];
    const anterior = semanas[i - 1];
    if (!atual.completa) continue;
    for (const m of METRICAS) {
      atual.tendencias[m] = compararMetrica(m, valorParaComparar(anterior, m), valorParaComparar(atual, m));
    }
  }

  return { semanas, temDados: true, herdadasDeFora, herdadasIncluidas };
}
