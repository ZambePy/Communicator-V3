/**
 * Os dois resumos do backup (rodada 3, 21/10/2026):
 *
 *  - `resumoDoBackup`: o que a pessoa lê ANTES de confirmar ("o que vai entrar"):
 *    de quem são os dados, de quando, e o que mais o arquivo traz.
 *  - `ResumoDaRestauracao`: o que a restauração fez, guardado na SESSÃO da janela
 *    para sobreviver à recarga e ser mostrado uma vez só. `sessionStorage` e não
 *    `localStorage`: o `localStorage` do app entra no próximo backup, e um recado
 *    de uma restauração antiga não pode viajar dentro dele.
 */

import { chaveEntraNoBackup } from './chaves';
import { chavesIgnoradasDoBackup, type BackupV1 } from './formato';

export interface PacienteDoBackup {
  id: string;
  nome: string;
}

export interface ResumoDoBackup {
  criadoEm: string;
  app: string;
  pacientes: PacienteDoBackup[];
  configuracoes: boolean;
  /** O que o assistente aprendeu (palavras e frases), do paciente ou no formato antigo. */
  vocabulario: boolean;
  /** O histórico (frases faladas, calibrações, dor). */
  historico: boolean;
  gravacoesDaVoz: number;
  /** Quantos itens do arquivo esta versão NÃO restaura (são de cada computador, ou de uma versão diferente): a tela diz que serão ignorados. */
  itensIgnorados: number;
}

const SEM_NOME = 'Paciente sem nome';

export type LinhaDePerfil = { id: string } & Record<string, unknown>;

/**
 * As linhas da lista de pacientes (`irisflow_profiles`) que têm um id. Texto
 * ilegível ou que não é uma lista: lista vazia. Id repetido: vale a primeira.
 * As linhas voltam como estão (todos os campos), porque a restauração por
 * paciente as copia inteiras.
 */
export function linhasDePerfis(texto: string | null | undefined): LinhaDePerfil[] {
  if (typeof texto !== 'string') return [];
  let lista: unknown;
  try {
    lista = JSON.parse(texto);
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const linhas: LinhaDePerfil[] = [];
  for (const linha of lista) {
    if (!linha || typeof linha !== 'object' || Array.isArray(linha)) continue;
    const { id } = linha as { id?: unknown };
    if (typeof id !== 'string' || id === '' || vistos.has(id)) continue;
    vistos.add(id);
    linhas.push(linha as LinhaDePerfil);
  }
  return linhas;
}

export function nomeDoPaciente(linha: LinhaDePerfil): string {
  return typeof linha.name === 'string' && linha.name.trim() !== '' ? linha.name.trim() : SEM_NOME;
}

export function resumoDoBackup(b: BackupV1): ResumoDoBackup {
  // Só o que a restauração grava: uma chave de fora que o arquivo traga não é "vocabulário" nem "histórico" que vá entrar.
  const nomes = Object.keys(b.chaves).filter(chaveEntraNoBackup);
  return {
    criadoEm: b.criadoEm,
    app: b.app,
    pacientes: linhasDePerfis(b.chaves.irisflow_profiles).map((l) => ({ id: l.id, nome: nomeDoPaciente(l) })),
    configuracoes: nomes.includes('irisflow_settings'),
    vocabulario: nomes.some((k) => k.startsWith('irisflow.assistente.v1') || k === 'irisflow_user_words' || k === 'irisflow_user_bigrams'),
    historico: nomes.some((k) => k.startsWith('irisflow_clinical_data')),
    gravacoesDaVoz: (b.arquivosDaVoz ?? []).filter((a) => a.nome.endsWith('.wav')).length,
    itensIgnorados: chavesIgnoradasDoBackup(b).length,
  };
}

/**
 * Os pacientes DESTE computador que o "Tudo" faz deixar de aparecer: estão na lista daqui (`irisflow_profiles`, texto
 * como está guardado) e não na do backup. Lista daqui ilegível = o aplicativo já a ignora: ninguém some. Backup sem a
 * lista, com a lista vazia ou ilegível: todos os de aqui somem (a cópia de segurança os guarda).
 */
export function pacientesQueDeixamDeAparecer(listaDaqui: string | null | undefined, b: BackupV1): PacienteDoBackup[] {
  const idsDoBackup = new Set(linhasDePerfis(b.chaves.irisflow_profiles).map((l) => l.id));
  return linhasDePerfis(listaDaqui).filter((l) => !idsDoBackup.has(l.id)).map((l) => ({ id: l.id, nome: nomeDoPaciente(l) }));
}

// -----------------------------------------------------------------------------

export interface ResumoDaRestauracao {
  modo: 'completo' | 'paciente';
  /** Só no modo "paciente". */
  paciente?: { id: string; nome: string };
  restauradoEm: string;
  backupCriadoEm: string;
  chavesGravadas: number;
  chavesRemovidas: number;
  /** `null`: o backup não trazia gravações da voz. */
  voz: {
    gravacoes: number; termos: number; ignoradas: number;
    /** Gravações que entraram com id novo porque já havia uma de cá com o mesmo id e outro áudio (a de cá não é tocada). */
    copiadas?: number;
  } | null;
  /** Onde ficou a cópia do que havia ANTES: a pasta do app (instalado) ou um arquivo baixado (navegador). */
  copia: { onde: 'pasta-do-app'; nome: string; pasta: string } | { onde: 'download'; nome: string };
  /** A restauração por paciente trocou os dados de quem estava escolhido: a tela de escolha volta. */
  pacienteDesmarcado?: boolean;
}

export const CHAVE_DO_RESUMO_DA_RESTAURACAO = 'irisflow.restauracao.resumo';

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ehNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function ehResumoDaRestauracao(x: unknown): x is ResumoDaRestauracao {
  if (!ehObjeto(x)) return false;
  if (x.modo !== 'completo' && x.modo !== 'paciente') return false;
  if (typeof x.restauradoEm !== 'string' || typeof x.backupCriadoEm !== 'string') return false;
  if (!ehNumero(x.chavesGravadas) || !ehNumero(x.chavesRemovidas)) return false;
  if (x.paciente !== undefined && !(ehObjeto(x.paciente) && typeof x.paciente.id === 'string' && typeof x.paciente.nome === 'string')) return false;
  if (x.voz !== null && !(ehObjeto(x.voz) && ehNumero(x.voz.gravacoes) && ehNumero(x.voz.termos) && ehNumero(x.voz.ignoradas))) return false;
  if (ehObjeto(x.voz) && x.voz.copiadas !== undefined && !ehNumero(x.voz.copiadas)) return false;
  if (x.pacienteDesmarcado !== undefined && typeof x.pacienteDesmarcado !== 'boolean') return false;
  const copia = x.copia;
  if (!ehObjeto(copia)) return false;
  if (copia.onde === 'pasta-do-app') return typeof copia.nome === 'string' && typeof copia.pasta === 'string';
  return copia.onde === 'download' && typeof copia.nome === 'string';
}

type Sessao = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Não conseguir guardar o recado não desfaz a restauração: só some o aviso depois da recarga. */
export function guardarResumoDaRestauracao(resumo: ResumoDaRestauracao, sessao?: Sessao): void {
  try {
    (sessao ?? sessionStorage).setItem(CHAVE_DO_RESUMO_DA_RESTAURACAO, JSON.stringify(resumo));
  } catch (e) {
    console.warn('[backup] não foi possível guardar o resumo da restauração:', e);
  }
}

export function lerResumoDaRestauracao(sessao?: Sessao): ResumoDaRestauracao | null {
  try {
    const bruto = (sessao ?? sessionStorage).getItem(CHAVE_DO_RESUMO_DA_RESTAURACAO);
    if (bruto === null) return null;
    const lido: unknown = JSON.parse(bruto);
    return ehResumoDaRestauracao(lido) ? lido : null;
  } catch {
    return null;
  }
}

export function descartarResumoDaRestauracao(sessao?: Sessao): void {
  try {
    (sessao ?? sessionStorage).removeItem(CHAVE_DO_RESUMO_DA_RESTAURACAO);
  } catch {
    /* nada a descartar */
  }
}
