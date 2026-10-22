/**
 * Onde as abreviações moram: `localStorage`, no computador, POR PACIENTE.
 *
 * Duas chaves, e a separação é de propósito:
 *
 *   - `irisflow.abreviacoes.v1.<perfil>`: SÓ o que a pessoa fez à mão
 *     (acrescentou, mudou, apagou). As sementes não são copiadas para cá — vêm
 *     do código, e uma semente corrigida numa versão nova chega a quem nunca
 *     mexeu nela.
 *   - `irisflow.abreviacoes.falas.v1.<perfil>`: as frases curtas que o paciente
 *     falou, contadas. É a matéria-prima das siglas aprendidas e é o que "Apagar
 *     o aprendizado" tira — sem levar junto o que a pessoa escreveu.
 *
 * Não há cache em memória. O teclado chama o dicionário a cada mudança do texto,
 * mas são duas leituras de JSON pequeno; um cache pediria invalidação toda vez
 * que o aprendizado é apagado por outro módulo, e um dicionário velho aqui
 * significaria um chip que oferece o que a pessoa acabou de apagar.
 *
 * Falha nunca é silenciosa: o que não foi possível ler ou gravar vai para o
 * console UMA vez (não a cada tecla) e, quando é a pessoa que pediu a ação, o
 * motivo volta para ela na tela.
 */

import { perfilDoAssistente } from '../assistente/armazenamento';
import { avisarUmaVez as avisarNoConsole } from '../assistente/avisoUnico';
import { BASE_DAS_ABREVIACOES, BASE_DAS_FALAS, chaveDoPaciente } from '../assistente/chavesPorPaciente';
import {
  MAX_ABREVIACOES_MINHAS,
  SEMENTES,
  aprendidasDasFalas,
  contarFala,
  frasesCurtasDoTexto,
  listarAbreviacoes,
  montarDicionario,
  sementesAlteradas,
  validarAbreviacao,
  type AbreviacoesDoPerfil,
  type FalasContadas,
  type ItemDaLista,
  type ResultadoDaValidacao,
} from './dicionario';
import { chaveDaAbreviacao } from './expandir';

export type ResultadoSimples = { ok: true } | { ok: false; motivo: string };

const MOTIVO_SEM_GRAVAR =
  'Não foi possível guardar neste computador (o armazenamento está cheio ou bloqueado). Nada foi alterado.';

const temPropria = (objeto: object, chave: string): boolean =>
  Object.prototype.hasOwnProperty.call(objeto, chave);

const chaveDasAbreviacoes = (): string => chaveDoPaciente(BASE_DAS_ABREVIACOES, perfilDoAssistente());
const chaveDasFalas = (): string => chaveDoPaciente(BASE_DAS_FALAS, perfilDoAssistente());

/* ── Avisos: uma vez por tipo de problema, nunca por tecla ── */

function avisarUmaVez(id: string, mensagem: string, erro?: unknown): void {
  avisarNoConsole(`abreviacoes:${id}`, `[abreviações] ${mensagem}`, erro);
}

/* ── Leitura e gravação ── */

function lerJson(chave: string, id: string): unknown {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) {
    avisarUmaVez(`leitura:${id}`, `não consegui ler ${id}; vale o padrão até a próxima gravação`, e);
    return null;
  }
}

function gravarJson(chave: string, valor: unknown, id: string): boolean {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch (e) {
    avisarUmaVez(`gravacao:${id}`, `não foi possível gravar ${id} (armazenamento cheio ou bloqueado)`, e);
    return false;
  }
}

const eObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** O que a pessoa fez à mão, já limpo: dado estragado é ignorado, nunca derruba. */
function lerEstado(): AbreviacoesDoPerfil {
  const bruto = lerJson(chaveDasAbreviacoes(), 'as abreviações');
  const estado: AbreviacoesDoPerfil = { editadas: {}, removidas: [] };
  if (!eObjeto(bruto)) return estado;

  if (eObjeto(bruto.editadas)) {
    for (const [sigla, significado] of Object.entries(bruto.editadas)) {
      if (typeof significado !== 'string') continue;
      const v = validarAbreviacao(sigla, significado);
      if (v.ok && v.sigla === sigla) estado.editadas[sigla] = v.significado;
    }
  }
  if (Array.isArray(bruto.removidas)) {
    for (const sigla of bruto.removidas) {
      if (typeof sigla === 'string' && /^[a-z]{1,8}$/.test(sigla) && !estado.removidas.includes(sigla)) {
        estado.removidas.push(sigla);
      }
    }
  }
  return estado;
}

function gravarEstado(estado: AbreviacoesDoPerfil): boolean {
  return gravarJson(chaveDasAbreviacoes(), { v: 1, editadas: estado.editadas, removidas: estado.removidas }, 'as abreviações');
}

function lerFalas(): FalasContadas {
  const bruto = lerJson(chaveDasFalas(), 'as frases curtas');
  const falas: FalasContadas = {};
  if (!eObjeto(bruto) || !eObjeto(bruto.falas)) return falas;
  for (const [chave, f] of Object.entries(bruto.falas)) {
    if (!eObjeto(f)) continue;
    const { texto, n, em } = f;
    if (typeof texto === 'string' && texto && typeof n === 'number' && n > 0 && typeof em === 'number') {
      falas[chave] = { texto, n, em };
    }
  }
  return falas;
}

/** As abreviações que o aparelho propõe; as siglas da pessoa não são tocadas. */
function aprendidas(estado: AbreviacoesDoPerfil): Record<string, string> {
  return aprendidasDasFalas(lerFalas(), { ocupadas: Object.keys(estado.editadas) });
}

/* ── O que o resto do aplicativo usa ── */

/** O dicionário em uso para o paciente atual. */
export function dicionarioDasAbreviacoes(): Record<string, string> {
  const estado = lerEstado();
  return montarDicionario(estado, aprendidas(estado));
}

/** A lista dos ajustes: sementes, minhas e aprendidas, com a origem de cada uma. */
export function listarAbreviacoesDoPaciente(): ItemDaLista[] {
  const estado = lerEstado();
  return listarAbreviacoes(estado, aprendidas(estado));
}

/** Quantas sementes foram mudadas ou apagadas (habilita o "Restaurar"). */
export function sementesAlteradasDoPaciente(): number {
  return sementesAlteradas(lerEstado());
}

/**
 * Acrescenta ou muda uma abreviação. A resposta diz o que foi guardado, ou o
 * motivo — a tela mostra esse motivo, então ele é uma frase para a pessoa.
 */
export function salvarAbreviacao(sigla: string, significado: string): ResultadoDaValidacao {
  const v = validarAbreviacao(sigla, significado);
  if (!v.ok) return v;

  const estado = lerEstado();
  const ehNova = !temPropria(estado.editadas, v.sigla);
  if (temPropria(SEMENTES, v.sigla) && SEMENTES[v.sigla] === v.significado) {
    // De volta ao que a semente já diz: não há o que guardar.
    delete estado.editadas[v.sigla];
  } else {
    if (ehNova && Object.keys(estado.editadas).length >= MAX_ABREVIACOES_MINHAS) {
      return {
        ok: false,
        motivo: `Você já escreveu ${MAX_ABREVIACOES_MINHAS} abreviações. Apague alguma antes de acrescentar outra.`,
      };
    }
    estado.editadas[v.sigla] = v.significado;
  }
  estado.removidas = estado.removidas.filter((s) => s !== v.sigla);

  return gravarEstado(estado) ? v : { ok: false, motivo: MOTIVO_SEM_GRAVAR };
}

/**
 * Apaga uma abreviação. A que a pessoa escreveu some; a semente e a aprendida
 * ficam escondidas (apagar só da lista de edições faria a sigla voltar na hora).
 */
export function removerAbreviacao(sigla: string): ResultadoSimples {
  const chave = chaveDaAbreviacao(sigla.trim());
  const estado = lerEstado();
  delete estado.editadas[chave];
  if (temPropria(montarDicionario(estado, aprendidas(estado)), chave) && !estado.removidas.includes(chave)) {
    estado.removidas.push(chave);
  }
  return gravarEstado(estado) ? { ok: true } : { ok: false, motivo: MOTIVO_SEM_GRAVAR };
}

/** Devolve as sementes ao que o aplicativo trouxe. As abreviações da pessoa ficam. */
export function restaurarSementes(): ResultadoSimples {
  const estado = lerEstado();
  for (const sigla of Object.keys(SEMENTES)) delete estado.editadas[sigla];
  estado.removidas = estado.removidas.filter((s) => !temPropria(SEMENTES, s));
  return gravarEstado(estado) ? { ok: true } : { ok: false, motivo: MOTIVO_SEM_GRAVAR };
}

/**
 * O paciente FALOU este texto. As frases curtas dele entram na conta que, a
 * partir da terceira vez, vira abreviação. Aprende mesmo com as sugestões
 * desligadas (como o resto do assistente): desligar é sobre o que aparece, não
 * sobre esquecer — e ao religar a sigla já estaria lá.
 *
 * Nunca lança: quem chama está no meio do "Falar", e uma falha de gravação aqui
 * não pode atrapalhar a voz.
 */
export function aprenderAbreviacoesDaFala(texto: string): void {
  try {
    if (frasesCurtasDoTexto(texto).length === 0) return;
    const falas = lerFalas();
    contarFala(falas, texto, Date.now());
    gravarJson(chaveDasFalas(), { v: 1, falas }, 'as frases curtas');
  } catch (e) {
    avisarUmaVez('aprender', 'não consegui aprender abreviações desta fala', e);
  }
}
