/**
 * O que o app mede do USO, dia a dia (21/10/2026).
 *
 * A evolução semanal precisa de números que o app não guardava: até aqui só
 * ficavam as frases, as medições da calibração e os relatos de dor. Sem eles a
 * tela de evolução só teria a curva do erro — e "quanto tempo a pessoa
 * conseguiu usar", "com que velocidade escreveu" e "quantas vezes teve de
 * desfazer" são justamente o que o médico e a fonoaudióloga perguntam.
 *
 * Só CONTAGENS por dia. Nunca o que foi escrito, nunca onde o olhar estava:
 * letras e palavras já estão (com autorização) no histórico de frases; aqui
 * fica o suficiente para somar e comparar semanas, e nada mais. Tudo local,
 * por paciente, e só com a autorização do histórico clínico — a mesma das
 * frases —, e apagado junto com ele (ver `clearClinicalData`).
 *
 * Dia e semana são sempre os de Brasília (ver `fuso.ts`).
 */

import { limitarDwellMs } from '../../dwellMs';
import { hasConsent, perfilAtivoDoHistorico } from '../../utils/clinicalLogger';
import { registrarFalhaDeGravacao } from '../local/falhasDeGravacao';
import { chaveDoUso } from './chaves';
import { diaDeBrasilia, ehDia } from './fuso';

/** Um dia de uso, no fuso de Brasília. */
export interface DiaDeUso {
  /** `AAAA-MM-DD`. */
  dia: string;
  /** Minutos em que houve ao menos uma seleção. */
  minutosUteis: number;
  /** O último minuto contado (minutos desde 1970): evita contar o mesmo minuto duas vezes, nem depois de reabrir o app. */
  ultimoMinuto: number;
  /** Caracteres escritos COM intervalo medido (o primeiro de cada rajada só marca o relógio). */
  caracteres: number;
  /** Tempo, em ms, entre esses caracteres — sem as pausas longas. */
  msDigitando: number;
  /** Quantas vezes apertou um "desfazer" (Apagar, Limpar, Voltar). */
  desfazer: number;
  avisosDeFadiga: number;
  /** Soma do dwell em uso, amostrado uma vez por minuto útil. */
  dwellSomaMs: number;
  dwellAmostras: number;
}

/** Versão do formato dentro do arquivo. A da CHAVE (`.v1.`) é a que separa formatos incompatíveis. */
const VERSAO = 1;

/**
 * Teto: os dias mais recentes. 400 cobre mais de um ano de acompanhamento, e
 * cada dia tem ~150 bytes — o arquivo inteiro fica abaixo de 60 KB, que é o que
 * se regrava a cada seleção.
 */
export const MAX_DIAS_DE_USO = 400;

/**
 * Entre duas letras, mais que isto é pausa — a pessoa foi descansar, pensar,
 * falar com alguém —, e não velocidade de escrita. Generoso de propósito: com
 * ELA avançada, 10 a 15 s por letra existem, e cortar esses intervalos tiraria
 * da conta justamente os dias mais difíceis.
 */
export const PAUSA_MAXIMA_NA_DIGITACAO_MS = 30_000;

const MS_POR_MINUTO = 60_000;

const vazio = (dia: string): DiaDeUso => ({
  dia,
  minutosUteis: 0,
  ultimoMinuto: 0,
  caracteres: 0,
  msDigitando: 0,
  desfazer: 0,
  avisosDeFadiga: 0,
  dwellSomaMs: 0,
  dwellAmostras: 0,
});

/** Número finito e não negativo; qualquer outra coisa vira 0 (o armazenamento pode ter sido mexido à mão). */
const contagem = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

const porDia = (a: DiaDeUso, b: DiaDeUso): number => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0);

/** `null` = o conteúdo não é um registro de uso. */
function normalizar(bruto: unknown): DiaDeUso[] | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const { versao, dias } = bruto as { versao?: unknown; dias?: unknown };
  if (versao !== VERSAO || !Array.isArray(dias)) return null;

  // Dia repetido: vale o último gravado.
  const porData = new Map<string, DiaDeUso>();
  for (const item of dias) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (!ehDia(r.dia)) continue;
    porData.set(r.dia, {
      dia: r.dia,
      minutosUteis: contagem(r.minutosUteis),
      ultimoMinuto: contagem(r.ultimoMinuto),
      caracteres: contagem(r.caracteres),
      msDigitando: contagem(r.msDigitando),
      desfazer: contagem(r.desfazer),
      avisosDeFadiga: contagem(r.avisosDeFadiga),
      dwellSomaMs: contagem(r.dwellSomaMs),
      dwellAmostras: contagem(r.dwellAmostras),
    });
  }
  return [...porData.values()].sort(porDia);
}

/**
 * Console: no máximo uma linha por minuto. Registrar uma seleção acontece a
 * cada olhar fixado; um armazenamento ilegível não pode encher o console (nem
 * ficar mudo — o relato de 18/10/2026 foi justamente sobre falha calada).
 */
const INTERVALO_DO_AVISO_MS = 60_000;
let ultimoAviso = -Infinity;
function avisarNoConsole(mensagem: string, erro?: unknown): void {
  const agora = Date.now();
  if (agora - ultimoAviso < INTERVALO_DO_AVISO_MS) return;
  ultimoAviso = agora;
  console.warn(`[uso] ${mensagem}`, erro ?? '');
}

/**
 * Os dias de uso do paciente, do mais antigo para o mais recente.
 *
 * Armazenamento ilegível ou de formato desconhecido volta como lista vazia,
 * sem exceção — mas com um aviso no console, e o próximo registro recomeça do
 * zero. Uma tela de evolução quebrada por causa de um número a menos seria pior.
 */
export function lerUso(perfilId: string): DiaDeUso[] {
  let bruto: string | null;
  try {
    bruto = localStorage.getItem(chaveDoUso(perfilId));
  } catch (e) {
    avisarNoConsole('não foi possível ler o registro de uso neste computador', e);
    return [];
  }
  if (bruto === null) return [];
  try {
    const dias = normalizar(JSON.parse(bruto));
    if (dias) return dias;
    avisarNoConsole('o registro de uso tem um formato desconhecido; será recomeçado');
  } catch (e) {
    avisarNoConsole('o registro de uso está ilegível; será recomeçado', e);
  }
  return [];
}

function gravar(perfilId: string, dias: DiaDeUso[]): void {
  const recentes = dias.length > MAX_DIAS_DE_USO ? dias.slice(-MAX_DIAS_DE_USO) : dias;
  try {
    localStorage.setItem(chaveDoUso(perfilId), JSON.stringify({ versao: VERSAO, dias: recentes }));
    // Sem `registrarGravacaoOk`: o item 'historico' é compartilhado com as
    // frases e as medições, e um registro de uso que coube não prova que o
    // histórico coube — limpar o aviso aqui o esconderia sem ter resolvido nada.
  } catch (e) {
    // Armazenamento cheio ou bloqueado não derruba quem registrou, mas também
    // não passa por salvo: o aviso "não foi possível salvar o histórico" aparece.
    registrarFalhaDeGravacao('historico', e);
  }
}

/**
 * O paciente a quem atribuir o uso, ou `null` quando não se pode gravar:
 * sem a autorização do histórico clínico, ou sem paciente escolhido (não há a
 * quem atribuir, e misturar pacientes é pior que não ter o número).
 */
function pacienteQueGrava(): string | null {
  try {
    if (!hasConsent()) return null;
  } catch {
    return null;
  }
  return perfilAtivoDoHistorico();
}

/**
 * Lê, altera o dia do instante e regrava. Sem estado em memória de propósito:
 * o app pode fechar a qualquer momento (queda de energia, o cuidador desliga o
 * computador) e o que já aconteceu tem de estar gravado. `alterar` devolve
 * `false` quando nada mudou — e então nada é regravado, nem o dia é criado.
 */
function atualizar(agora: number, alterar: (dia: DiaDeUso) => boolean): void {
  const paciente = pacienteQueGrava();
  if (paciente === null) return;
  const dia = diaDeBrasilia(agora);
  if (dia === null) return;

  const dias = lerUso(paciente);
  const existente = dias.find((d) => d.dia === dia);
  const doDia = existente ?? vazio(dia);
  if (!alterar(doDia)) return;
  if (!existente) {
    dias.push(doDia);
    dias.sort(porDia);
  }
  gravar(paciente, dias);
}

/**
 * Uma seleção (o olhar fixou e o botão foi acionado).
 *
 * Conta UM minuto útil por minuto em que houve seleção — "minutos úteis" é
 * quanto tempo a pessoa de fato usou, não quantos cliques deu. O dwell em uso
 * é amostrado uma vez por minuto útil: a média por minuto não pesa a rajada de
 * um minuto cheio de cliques como se fosse um uso mais longo.
 */
export function registrarSelecao(agora: number, dwellMs?: number): void {
  if (!Number.isFinite(agora)) return;
  const minuto = Math.floor(agora / MS_POR_MINUTO);
  atualizar(agora, (dia) => {
    if (dia.ultimoMinuto === minuto) return false;
    dia.ultimoMinuto = minuto;
    dia.minutosUteis += 1;
    if (typeof dwellMs === 'number' && Number.isFinite(dwellMs) && dwellMs > 0) {
      // O app só usa dwell dentro da faixa; um valor de fora seria dado ruim.
      dia.dwellSomaMs += limitarDwellMs(dwellMs);
      dia.dwellAmostras += 1;
    }
    return true;
  });
}

/** Relógio da digitação — só em memória: depois de reabrir o app, a primeira letra volta a só marcar. */
let relogioDaDigitacao: { paciente: string; ms: number } | null = null;

/**
 * `caracteres` entraram no texto agora (uma letra, ou uma palavra sugerida de
 * uma vez). A velocidade é caracteres por minuto DIGITANDO, então cada
 * caractere conta com o intervalo desde o avanço anterior:
 *   - o primeiro avanço depois de uma pausa só marca o relógio (sem intervalo
 *     não há velocidade — contar a letra inflaria o resultado);
 *   - intervalo maior que `PAUSA_MAXIMA_NA_DIGITACAO_MS` é pausa, não digitação;
 *   - o mesmo instante (intervalo zero) não conta.
 */
export function registrarDigitacao(caracteres: number, agora: number): void {
  if (!Number.isFinite(caracteres) || caracteres <= 0 || !Number.isFinite(agora)) return;
  const paciente = pacienteQueGrava();
  if (paciente === null) return;

  const anterior = relogioDaDigitacao && relogioDaDigitacao.paciente === paciente ? relogioDaDigitacao.ms : null;
  relogioDaDigitacao = { paciente, ms: agora };
  if (anterior === null) return;

  const intervalo = agora - anterior;
  if (intervalo <= 0 || intervalo > PAUSA_MAXIMA_NA_DIGITACAO_MS) return;
  atualizar(agora, (dia) => {
    dia.caracteres += caracteres;
    dia.msDigitando += intervalo;
    return true;
  });
}

/** Apertou um "desfazer" (Apagar, Limpar, Voltar). */
export function registrarCorrecao(agora: number): void {
  if (!Number.isFinite(agora)) return;
  atualizar(agora, (dia) => {
    dia.desfazer += 1;
    return true;
  });
}

/** O aviso de fadiga apareceu. */
export function registrarAvisoDeFadiga(agora: number): void {
  if (!Number.isFinite(agora)) return;
  atualizar(agora, (dia) => {
    dia.avisosDeFadiga += 1;
    return true;
  });
}

/**
 * Telas que NÃO contam como uso do dia a dia. As do paciente contam por
 * padrão: uma tela nova dele passa a contar sem ninguém lembrar de listá-la.
 *   - entrada, termo, escolha de perfil, tutorial, preparo e calibração: não é
 *     a pessoa usando o comunicador, é o app sendo preparado;
 *   - ajustes, voz, acessibilidade e Computador: configuração;
 *   - área do cuidador, conta, histórico e relatório: não é o paciente;
 *   - evolução e consulta: quem olha é o cuidador;
 *   - Emergência: um aumento ali é aflição, não melhora.
 */
const ROTAS_QUE_NAO_CONTAM = [
  '/intro',
  '/login',
  '/activated',
  '/consent',
  '/profiles',
  '/tutorial',
  '/calibration-check',
  '/calibration',
  '/retomada',
  '/setup',
  '/welcome',
  '/emergency',
  '/virtual-mouse',
  '/settings',
  '/accessibility',
  '/voice',
  '/conta',
  '/historico',
  '/relatorio',
  '/caregiver',
  '/evolucao',
  '/consulta',
] as const;

/** Casa por SEGMENTO: `/consulta` não esconde `/consultas-do-menu`. */
export function rotaContaComoUso(rota: string): boolean {
  if (typeof rota !== 'string' || rota === '' || rota === '/') return false;
  return !ROTAS_QUE_NAO_CONTAM.some((base) => rota === base || rota.startsWith(`${base}/`));
}

/** Só para testes: esquece o relógio da digitação e o limite do aviso do console. */
export function _redefinirRegistroDeUso(): void {
  relogioDaDigitacao = null;
  ultimoAviso = -Infinity;
}
