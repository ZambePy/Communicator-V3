/**
 * Abreviações do paciente: o que ele pode escrever curto e ver por extenso.
 *
 * Quem escreve com o olhar paga duas fixações por letra, e "obrigado" são
 * oito letras. As abreviações de internet em português ("obg", "pfv", "vc")
 * já estão na cabeça de quem usa celular, e custam três letras.
 *
 * Duas decisões moldam o resto do módulo:
 *
 *   - A expansão é um CHIP de previsão, nunca uma troca automática (roadmap 2,
 *     rodada 3, 21/10/2026). Trocar "n" por "não" sozinho, no meio de uma frase
 *     de quem não consegue apagar rápido, é uma correção que o paciente não
 *     pediu — e "S" pode ser a letra de uma sigla. Quem decide é o olhar.
 *   - Tudo é editável. As sementes abaixo são só o ponto de partida; o paciente
 *     (ou o cuidador) muda, apaga e acrescenta nos ajustes, e o aparelho
 *     aprende as que o próprio paciente já escreve por extenso.
 */

import { PALAVRAS_COMUNS, normalizar, tokenizar } from '@tracker/assistente';
import { chaveDaAbreviacao } from './expandir';

/**
 * As catorze combinadas para o português do Brasil. As chaves já estão na forma
 * de comparação (minúsculas, sem acento): é nessa forma que `expandir` procura.
 *
 * "pq" fica como "por que" porque a pergunta é o uso que mais importa a quem
 * se comunica por fixação ("por que está frio?"); quem prefere "porque" troca
 * nos ajustes.
 */
export const SEMENTES: Readonly<Record<string, string>> = Object.freeze({
  obg: 'obrigado',
  pfv: 'por favor',
  vc: 'você',
  td: 'tudo',
  tb: 'também',
  hj: 'hoje',
  qd: 'quando',
  pq: 'por que',
  msg: 'mensagem',
  n: 'não',
  s: 'sim',
  agr: 'agora',
  dps: 'depois',
  blz: 'beleza',
});

/* ────────────────────────────────────────────────────────────────────────────
 * Limites. Cada um existe por um motivo de uso, não de armazenamento.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Mais que isso deixa de ser abreviação: é uma palavra escrita pela metade. */
export const MAX_SIGLA = 8;
/**
 * O significado precisa caber, inteiro, numa célula do teclado: 42 letras, o
 * mesmo limite das frases (`MAX_CARACTERES_NA_CELULA` em KeyboardScreen). Um
 * chip cortado seria um alvo que o paciente escolhe sem saber o que escolheu —
 * então a conta fecha aqui, na hora de cadastrar, e não na hora de desenhar.
 */
export const MAX_SIGNIFICADO = 42;
/** Quantas abreviações a pessoa pode ter cadastradas ou alteradas à mão. */
export const MAX_ABREVIACOES_MINHAS = 60;
/** Quantas vezes uma frase precisa ser falada para o aparelho propor a sigla dela. */
export const FALAS_PARA_APRENDER = 3;
/** Frases de 2 a 5 palavras: menos é uma palavra só, mais não vira sigla que se lembre. */
export const PALAVRAS_MIN = 2;
export const PALAVRAS_MAX = 5;
/** Quantas frases curtas o aparelho acompanha ao mesmo tempo (as menos repetidas saem). */
export const MAX_FALAS_CONTADAS = 200;

/* ────────────────────────────────────────────────────────────────────────────
 * O que a pessoa fez à mão
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * O que foi mudado à mão neste paciente, e SÓ isso: as sementes não são
 * copiadas para o armazenamento. Assim uma semente corrigida numa versão futura
 * do aplicativo chega a quem nunca mexeu nela, e quem mexeu continua com o que
 * escolheu.
 */
export interface AbreviacoesDoPerfil {
  /** Siglas acrescentadas ou com o significado trocado. Vencem tudo. */
  editadas: Record<string, string>;
  /** Siglas apagadas à mão (sementes ou aprendidas). */
  removidas: string[];
}

export type ResultadoDaValidacao =
  | { ok: true; sigla: string; significado: string }
  | { ok: false; motivo: string };

const recusa = (motivo: string): ResultadoDaValidacao => ({ ok: false, motivo });

const SIGLA_VALIDA = /^[a-z]{1,8}$/;

const temPropria = (objeto: object, chave: string): boolean =>
  Object.prototype.hasOwnProperty.call(objeto, chave);

/**
 * Confere uma abreviação digitada nos ajustes e devolve a forma que será
 * guardada. A mensagem de recusa é a que a pessoa lê: curta, sem jargão, e diz o
 * que fazer — recusar calado deixaria o cuidador sem saber por que nada entrou.
 */
export function validarAbreviacao(sigla: string, significado: string): ResultadoDaValidacao {
  const chave = chaveDaAbreviacao(sigla.trim());
  if (!chave) return recusa('Escreva a abreviação, por exemplo “obg”.');
  if (!/^[a-z]+$/.test(chave)) return recusa('Use só letras na abreviação, sem espaço, número ou pontuação.');
  if (chave.length > MAX_SIGLA) return recusa(`A abreviação pode ter até ${MAX_SIGLA} letras.`);

  const texto = significado.trim().replace(/\s+/g, ' ');
  if (!texto) return recusa('Escreva o que a abreviação quer dizer.');
  if (texto.length > MAX_SIGNIFICADO) return recusa(`O significado pode ter até ${MAX_SIGNIFICADO} letras.`);
  // Comparação com o acento: "voce" → "você" é um conserto que vale cadastrar.
  if (texto.toLowerCase() === chave) {
    return recusa('A abreviação e o significado são iguais. Escreva o significado por extenso.');
  }
  return { ok: true, sigla: chave, significado: texto };
}

/** Só entram no dicionário siglas e significados que passariam na validação. */
function validas(origem: Readonly<Record<string, string>>): [string, string][] {
  return Object.entries(origem).filter(
    ([sigla, significado]) => SIGLA_VALIDA.test(sigla) && typeof significado === 'string' && significado.trim() !== '',
  );
}

/**
 * O dicionário em uso: aprendidas por baixo, sementes por cima (uma sigla que o
 * aparelho propõe nunca troca uma que foi combinada), o que a pessoa apagou
 * fora, e o que ela escreveu por cima de tudo. Não altera os argumentos.
 */
export function montarDicionario(
  estado: AbreviacoesDoPerfil,
  aprendidas: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const dicionario: Record<string, string> = {};
  for (const [sigla, significado] of validas(aprendidas)) dicionario[sigla] = significado;
  for (const [sigla, significado] of Object.entries(SEMENTES)) dicionario[sigla] = significado;
  for (const sigla of estado.removidas) delete dicionario[sigla];
  for (const [sigla, significado] of validas(estado.editadas)) dicionario[sigla] = significado;
  return dicionario;
}

export type OrigemDaAbreviacao = 'semente' | 'minha' | 'aprendida';

export interface ItemDaLista {
  sigla: string;
  significado: string;
  origem: OrigemDaAbreviacao;
  /** Uma semente cujo significado a pessoa trocou. */
  mudada: boolean;
}

/** A lista que a tela de ajustes mostra, em ordem alfabética. */
export function listarAbreviacoes(
  estado: AbreviacoesDoPerfil,
  aprendidas: Readonly<Record<string, string>> = {},
): ItemDaLista[] {
  return Object.entries(montarDicionario(estado, aprendidas))
    .map(([sigla, significado]): ItemDaLista => {
      const ehSemente = temPropria(SEMENTES, sigla);
      const origem: OrigemDaAbreviacao = ehSemente ? 'semente' : temPropria(estado.editadas, sigla) ? 'minha' : 'aprendida';
      return { sigla, significado, origem, mudada: ehSemente && significado !== SEMENTES[sigla] };
    })
    .sort((a, b) => a.sigla.localeCompare(b.sigla, 'pt-BR'));
}

/** Quantas sementes foram mudadas ou apagadas: o que "Restaurar" desfaz. */
export function sementesAlteradas(estado: AbreviacoesDoPerfil): number {
  const dicionario = montarDicionario(estado);
  return Object.entries(SEMENTES).filter(([sigla, original]) => dicionario[sigla] !== original).length;
}

/* ────────────────────────────────────────────────────────────────────────────
 * O que o aparelho aprende: as frases que o paciente escreve por extenso
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A sigla de uma frase é a inicial de cada palavra: "estou com dor" → "ecd".
 * É o que qualquer pessoa reinventa sozinha, e é por isso que se lembra: o
 * aparelho não impõe um código, propõe o que a pessoa já adivinharia.
 */
export function acronimoDaFrase(frase: string): string | null {
  const palavras = tokenizar(frase);
  if (palavras.length < PALAVRAS_MIN || palavras.length > PALAVRAS_MAX) return null;
  if (palavras.some((p) => /\d/.test(p))) return null;
  const iniciais = palavras.map((p) => p[0]).join('');
  return /^[a-z]+$/.test(iniciais) ? iniciais : null;
}

const SEM_PONTUACAO_NAS_PONTAS = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * As frases curtas de um texto falado. Cada frase (separada por ponto, "!", "?"
 * ou quebra de linha) com 2 a 5 palavras conta; um texto comprido é um recado,
 * não uma frase que se repita. O teclado do olhar só escreve em maiúsculas, e a
 * frase guardada vem em minúsculas: a sigla digitada em maiúsculas devolve a
 * frase em maiúsculas, e em minúsculas devolve como o paciente costuma dizer.
 */
export function frasesCurtasDoTexto(texto: string): string[] {
  const frases: string[] = [];
  for (const trecho of texto.split(/[.!?;…\n]+/u)) {
    const limpo = trecho.replace(/\s+/g, ' ').trim().replace(SEM_PONTUACAO_NAS_PONTAS, '');
    if (!limpo) continue;
    const palavras = tokenizar(limpo).length;
    if (palavras < PALAVRAS_MIN || palavras > PALAVRAS_MAX) continue;
    frases.push(/\p{Ll}/u.test(limpo) ? limpo : limpo.toLowerCase());
  }
  return frases;
}

export interface FalaContada {
  /** A forma que será o significado da abreviação. */
  texto: string;
  n: number;
  /** Quando foi falada pela última vez (ms desde 1970). */
  em: number;
}

/** Chave: a frase normalizada ("Estou com dor." e "ESTOU COM DOR" são a mesma). */
export type FalasContadas = Record<string, FalaContada>;

/** Soma ao placar as frases curtas de um texto que o paciente acabou de falar. */
export function contarFala(falas: FalasContadas, texto: string, agora: number): void {
  for (const frase of frasesCurtasDoTexto(texto)) {
    const chave = normalizar(frase);
    falas[chave] = { texto: frase, n: (falas[chave]?.n ?? 0) + 1, em: agora };
  }
  const chaves = Object.keys(falas);
  if (chaves.length <= MAX_FALAS_CONTADAS) return;
  // As frases ditas uma vez e há mais tempo saem primeiro: a que se repete é
  // justamente a que vale uma sigla.
  chaves
    .sort((a, b) => falas[a].n - falas[b].n || falas[a].em - falas[b].em)
    .slice(0, chaves.length - MAX_FALAS_CONTADAS)
    .forEach((chave) => delete falas[chave]);
}

/** Palavras de uma só palavra do dicionário de partida do assistente. */
const PALAVRAS_DO_DICIONARIO: ReadonlySet<string> = new Set(
  PALAVRAS_COMUNS.map((p) => normalizar(p)).filter((p) => p && !p.includes(' ')),
);

/**
 * As abreviações que o aparelho propõe: a sigla de cada frase falada pelo menos
 * `FALAS_PARA_APRENDER` vezes. Se duas frases dão a mesma sigla, fica a mais
 * falada (empatadas, a mais recente). Fora: siglas das sementes, siglas que a
 * pessoa já usa (`ocupadas`) e siglas que são palavras comuns — "ar", de "a
 * roupa", faria o chip aparecer sempre que a palavra "ar" fosse escrita.
 */
export function aprendidasDasFalas(
  falas: Readonly<FalasContadas>,
  opcoes: { ocupadas?: Iterable<string> } = {},
): Record<string, string> {
  const ocupadas = new Set<string>([...Object.keys(SEMENTES), ...(opcoes.ocupadas ?? [])]);
  const melhores = new Map<string, FalaContada>();
  for (const fala of Object.values(falas)) {
    if (fala.n < FALAS_PARA_APRENDER || fala.texto.length > MAX_SIGNIFICADO) continue;
    const sigla = acronimoDaFrase(fala.texto);
    if (!sigla || ocupadas.has(sigla) || PALAVRAS_DO_DICIONARIO.has(sigla)) continue;
    const atual = melhores.get(sigla);
    if (!atual || fala.n > atual.n || (fala.n === atual.n && fala.em > atual.em)) melhores.set(sigla, fala);
  }
  return Object.fromEntries([...melhores].map(([sigla, fala]) => [sigla, fala.texto]));
}
