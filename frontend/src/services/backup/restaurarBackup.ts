/**
 * Restaura um backup (rodada 3, 21/10/2026): troca o que há neste computador pelo
 * que veio do arquivo. É a operação mais perigosa do aplicativo, então a ordem é
 * a que deixa mais caminhos de volta:
 *
 *   1. VALIDA o arquivo (nada de fora entra), CONFERE a soma de verificação dele
 *      (se tiver) e o pedido (qual paciente).
 *   2. Confere que a voz tem como voltar — senão recusa, sem tocar em nada.
 *   3. Guarda uma CÓPIA DE SEGURANÇA do que há agora. Sem cópia, não restaura.
 *   4. Devolve as gravações da voz (só SOMA ao que existe; se falhar, nada mais mudou).
 *   5. Grava as chaves, com volta ao estado anterior se o armazenamento recusar.
 *   6. Guarda o recado (sobrevive à recarga) e recarrega a página.
 *
 * Dois modos. COMPLETO: o computador passa a ter o que o backup tem — o que só
 * existia aqui (e é da pessoa) sai, e a cópia de segurança o guarda. DE UM
 * PACIENTE: só as chaves daquele paciente e a linha dele na lista; o resto do
 * computador não muda.
 *
 * O que é DESTE computador (licença, calibração, câmera e tela) nunca é tocado:
 * ver `chaves.ts`.
 */

import type { ResultadoDaCopiaDeSeguranca } from '@tracker/backup/protocolo';
import type { ArquivoParaRestaurar } from '@tracker/voz/vozGuardada';
import { descarregar, esquecerSemGravar } from '../assistente/armazenamento';
import { baixarTexto, nomeDaCopiaBaixada } from './arquivo';
import { BLOCO_DA_DECODIFICACAO, deBase64Async } from './base64';
import { CHAVE_DAS_CONFIGURACOES, chaveEntraNoBackup, chavesDoPaciente, configuracoesParaRestaurar } from './chaves';
import { ErroDeBackup } from './erro';
import { conferirSoma, serializarBackup, validarBackup, type BackupV1 } from './formato';
import { montarBackup } from './montarBackup';
import { falhaDoIpc, ponteDoBackupDaVoz, type PonteDoBackupDaVoz } from './ponteDaVoz';
import { guardarResumoDaRestauracao, linhasDePerfis, nomeDoPaciente, type ResumoDaRestauracao } from './resumo';

export interface OpcoesDaRestauracao {
  /** Id do paciente: restaura só ele. Ausente: restauração completa. */
  perfil?: string;
}

export interface DependenciasDaRestauracao {
  /** O `localStorage`. */
  armazenamento?: Storage;
  /** Onde o recado para depois da recarga fica (`sessionStorage`). */
  sessao?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** A ponte da voz; `null` = não há (navegador). Padrão: a da janela. */
  ponteDaVoz?: PonteDoBackupDaVoz | null;
  /** Guarda a cópia de segurança na pasta do app; `null` = não há (navegador): a cópia é baixada. Padrão: a da janela. */
  guardarCopia?: ((texto: string) => Promise<ResultadoDaCopiaDeSeguranca>) | null;
  /** Só no navegador: entrega a cópia de segurança como download. */
  baixarCopia?: (nome: string, texto: string) => void;
  recarregar?: () => void;
  agora?: () => Date;
  versaoDoApp?: () => Promise<string>;
}

const NADA_FOI_RESTAURADO = 'Nada foi restaurado.';
const CHAVE_DA_ESCOLHA_DO_PACIENTE = 'irisflow_auth';
const CHAVE_DA_LISTA_DE_PACIENTES = 'irisflow_profiles';

const comPonto = (frase: string): string => (/[.!?]$/.test(frase.trim()) ? frase.trim() : `${frase.trim()}.`);

// -----------------------------------------------------------------------------
// O plano: o que gravar e o que remover. Calculado ANTES de escrever qualquer coisa.
// -----------------------------------------------------------------------------

interface Plano {
  modo: 'completo' | 'paciente';
  paciente?: { id: string; nome: string };
  grava: [chave: string, valor: string][];
  remove: string[];
  /** Restauração por paciente do paciente que está escolhido: a escolha volta. */
  desmarcaPaciente: boolean;
}

function lerObjeto(texto: string | null): Record<string, unknown> | null {
  if (texto === null) return null;
  try {
    const v: unknown = JSON.parse(texto);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function chavesLocaisNoEscopo(armazenamento: Storage): string[] {
  const nomes: string[] = [];
  for (let i = 0; i < armazenamento.length; i++) {
    const nome = armazenamento.key(i);
    if (nome !== null && chaveEntraNoBackup(nome)) nomes.push(nome);
  }
  return nomes;
}

const perfilAusente = (): ErroDeBackup => new ErroDeBackup('perfil-ausente', `O paciente escolhido não está neste backup. ${NADA_FOI_RESTAURADO}`);

function planejar(backup: BackupV1, opcoes: OpcoesDaRestauracao, armazenamento: Storage): Plano {
  if (opcoes.perfil === undefined) {
    // SÓ o que esta versão restaura: o arquivo pode trazer chaves de fora (licença, modo apresentação…), que o validador
    // deixa passar e conta como ignoradas. Gravar uma delas ligaria o modo que descarta os pedidos de socorro, ou
    // trocaria a licença deste computador.
    const grava: Plano['grava'] = Object.entries(backup.chaves).filter(([chave]) => chaveEntraNoBackup(chave)).map(([chave, valor]) => [
      chave,
      // O posto de uso (câmera, tela) é deste computador, não do que fez o backup.
      chave === CHAVE_DAS_CONFIGURACOES ? configuracoesParaRestaurar(valor, armazenamento.getItem(CHAVE_DAS_CONFIGURACOES)) : valor,
    ]);
    // Configurações nunca saem: sem elas o aplicativo perde até o tema e a velocidade da fixação.
    const remove = chavesLocaisNoEscopo(armazenamento).filter((k) => !Object.hasOwn(backup.chaves, k) && k !== CHAVE_DAS_CONFIGURACOES);
    return { modo: 'completo', grava, remove, desmarcaPaciente: false };
  }

  const id = opcoes.perfil;
  if (typeof id !== 'string' || id.trim() === '') throw perfilAusente();
  const linhaDoBackup = linhasDePerfis(backup.chaves[CHAVE_DA_LISTA_DE_PACIENTES]).find((l) => l.id === id);
  if (!linhaDoBackup) throw perfilAusente();

  const familia = chavesDoPaciente(id);
  const grava: Plano['grava'] = familia.filter((k) => Object.hasOwn(backup.chaves, k)).map((k) => [k, backup.chaves[k]]);
  const remove = familia.filter((k) => !Object.hasOwn(backup.chaves, k) && armazenamento.getItem(k) !== null);

  // A linha do paciente na lista: troca a que há (no mesmo lugar) ou entra no fim.
  const locais = linhasDePerfis(armazenamento.getItem(CHAVE_DA_LISTA_DE_PACIENTES));
  const lista = locais.some((l) => l.id === id) ? locais.map((l) => (l.id === id ? linhaDoBackup : l)) : [...locais, linhaDoBackup];
  grava.push([CHAVE_DA_LISTA_DE_PACIENTES, JSON.stringify(lista)]);

  // A tela guarda uma CÓPIA do paciente escolhido (nome, foto) em `irisflow_auth`. Se é ele o restaurado,
  // essa cópia fica velha: a escolha volta, e a pessoa o escolhe de novo.
  const escolhido = lerObjeto(armazenamento.getItem(CHAVE_DA_ESCOLHA_DO_PACIENTE))?.currentProfile;
  const escolhidoId = escolhido && typeof escolhido === 'object' ? (escolhido as { id?: unknown }).id : undefined;
  const desmarcaPaciente = escolhidoId === id;
  if (desmarcaPaciente) grava.push([CHAVE_DA_ESCOLHA_DO_PACIENTE, JSON.stringify({ currentProfile: null })]);

  return { modo: 'paciente', paciente: { id, nome: nomeDoPaciente(linhaDoBackup) }, grava, remove, desmarcaPaciente };
}

// -----------------------------------------------------------------------------
// A cópia de segurança
// -----------------------------------------------------------------------------

function guardarCopiaDaJanela(): ((texto: string) => Promise<ResultadoDaCopiaDeSeguranca>) | null {
  const ponte = (window as unknown as { irisflowBackup?: { guardarCopia?: (texto: string) => Promise<ResultadoDaCopiaDeSeguranca> } }).irisflowBackup;
  return ponte && typeof ponte.guardarCopia === 'function' ? (texto) => ponte.guardarCopia!(texto) : null;
}

const SEM_COPIA = 'Não foi possível guardar a cópia de segurança do que há neste computador';

/**
 * A cópia só leva as chaves, SEM a voz: a restauração da voz apenas soma, nada
 * dela se perde. Quem a chama já mandou o assistente gravar o que aprendeu
 * (`descarregar`, antes do plano) — senão a cópia o deixaria de fora.
 */
async function guardarACopia(deps: DependenciasDaRestauracao, armazenamento: Storage, agora: () => Date): Promise<ResumoDaRestauracao['copia']> {
  let texto: string;
  try {
    const atual = await montarBackup({ comVoz: false }, { armazenamento, ponteDaVoz: null, agora: deps.agora, versaoDoApp: deps.versaoDoApp });
    texto = serializarBackup(atual).texto;
  } catch (e) {
    console.warn('[backup] não foi possível montar a cópia de segurança:', e);
    throw new ErroDeBackup('copia-falhou', `${SEM_COPIA}: não foi possível ler os dados daqui. ${NADA_FOI_RESTAURADO}`);
  }

  const guardar = deps.guardarCopia === undefined ? guardarCopiaDaJanela() : deps.guardarCopia;
  if (guardar) {
    let resposta: ResultadoDaCopiaDeSeguranca;
    try {
      resposta = await guardar(texto);
    } catch (e) {
      console.warn('[backup] o canal da cópia de segurança falhou:', e);
      throw new ErroDeBackup('copia-falhou', `${SEM_COPIA}. ${comPonto(falhaDoIpc(e))} ${NADA_FOI_RESTAURADO}`);
    }
    if (!resposta.ok) throw new ErroDeBackup('copia-falhou', `${comPonto(resposta.erro)} ${NADA_FOI_RESTAURADO}`);
    return { onde: 'pasta-do-app', nome: resposta.nome, pasta: resposta.pasta };
  }

  // Navegador: não há pasta do app. A cópia vira download (a pessoa a guarda).
  const nome = nomeDaCopiaBaixada(agora());
  try {
    (deps.baixarCopia ?? baixarTexto)(nome, texto);
  } catch (e) {
    console.warn('[backup] o navegador não baixou a cópia de segurança:', e);
    throw new ErroDeBackup('copia-falhou', `O navegador não deixou baixar a cópia de segurança do que há neste computador. ${NADA_FOI_RESTAURADO}`);
  }
  return { onde: 'download', nome };
}

// -----------------------------------------------------------------------------
// A voz
// -----------------------------------------------------------------------------

async function devolverAVoz(ponte: PonteDoBackupDaVoz, backup: BackupV1, perfil: string | undefined): Promise<NonNullable<ResumoDaRestauracao['voz']>> {
  const arquivos: ArquivoParaRestaurar[] = [];
  // A decodificação cede a vez à janela (Minor 7, rodada de correção 1): a voz de um backup são dezenas
  // de MB de texto. `deBase64Async` já espera entre os blocos de UM áudio; entre áudios pequenos, a espera
  // vem a cada bloco de texto acumulado.
  let desdeAUltimaEspera = 0;
  for (const a of backup.arquivosDaVoz ?? []) {
    const bytes = await deBase64Async(a.base64);
    // O validador já conferiu: aqui só impede um erro de programação de virar áudio vazio.
    if (!bytes) throw new ErroDeBackup('invalido', `As gravações da voz deste backup estão fora do formato. ${NADA_FOI_RESTAURADO}`);
    arquivos.push({ nome: a.nome, bytes });
    desdeAUltimaEspera += a.base64.length;
    if (desdeAUltimaEspera >= BLOCO_DA_DECODIFICACAO) {
      desdeAUltimaEspera = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  try {
    const r = await ponte.backupRestaurar(arquivos, perfil === undefined ? undefined : { perfil });
    if (!r.ok) throw new ErroDeBackup('voz-falhou', `${comPonto(r.erro)} ${NADA_FOI_RESTAURADO}`);
    // `copiadas` ausente (aplicativo mais velho do que esta tela): nenhuma.
    return { gravacoes: r.gravacoes, termos: r.termos, ignoradas: r.ignoradas, copiadas: typeof r.copiadas === 'number' ? r.copiadas : 0 };
  } catch (e) {
    if (e instanceof ErroDeBackup) throw e;
    console.warn('[backup] a restauração da voz falhou:', e);
    throw new ErroDeBackup('voz-falhou', `${comPonto(falhaDoIpc(e))} ${NADA_FOI_RESTAURADO}`);
  }
}

// -----------------------------------------------------------------------------
// Gravar as chaves, com volta ao estado anterior
// -----------------------------------------------------------------------------

function descreverACopia(copia: ResumoDaRestauracao['copia']): string {
  return copia.onde === 'pasta-do-app' ? `${copia.nome} (na pasta ${copia.pasta})` : `${copia.nome} (baixada pelo navegador)`;
}

function gravarAsChaves(armazenamento: Storage, plano: Plano, copia: ResumoDaRestauracao['copia']): void {
  const antes = new Map<string, string | null>();
  try {
    for (const k of [...plano.remove, ...plano.grava.map(([chave]) => chave)]) antes.set(k, armazenamento.getItem(k));
    // Primeiro o que sai (libera espaço), depois o que entra.
    for (const k of plano.remove) armazenamento.removeItem(k);
    for (const [k, v] of plano.grava) armazenamento.setItem(k, v);
  } catch (e) {
    console.warn('[backup] o armazenamento recusou a restauração; desfazendo:', e);
    let completo = true;
    for (const [k, v] of antes) {
      try {
        if (v === null) armazenamento.removeItem(k);
        else armazenamento.setItem(k, v);
      } catch {
        completo = false;
      }
    }
    throw new ErroDeBackup(
      'armazenamento',
      completo
        ? 'O armazenamento do aplicativo recusou os dados restaurados (talvez esteja cheio). O que havia antes foi mantido.'
        : `O armazenamento do aplicativo recusou os dados restaurados e nem tudo pôde ser desfeito. O estado de antes está na cópia de segurança ${descreverACopia(copia)}.`,
    );
  }
}

// -----------------------------------------------------------------------------

export async function restaurarBackup(
  b: BackupV1,
  opcoes: OpcoesDaRestauracao = {},
  deps: DependenciasDaRestauracao = {},
): Promise<ResumoDaRestauracao> {
  // 1. Nada de fora entra: o arquivo passa pelo validador MESMO que a tela já o tenha validado.
  const validado = validarBackup(b);
  if (!validado.ok) throw new ErroDeBackup('invalido', `${comPonto(validado.motivo)} ${NADA_FOI_RESTAURADO}`);
  const backup = validado.backup;

  // 1b. O conteúdo é o que o arquivo diz que é? Um valor estragado que continue JSON válido passaria pelo validador e, no
  //     "Tudo", trocaria o dado bom. Antes de QUALQUER escrita — inclusive a do vocabulário do assistente, logo abaixo.
  //     Backup sem soma (feito antes dela) passa.
  const conferido = await conferirSoma(backup);
  if (!conferido.ok) throw new ErroDeBackup('invalido', `${comPonto(conferido.motivo)} ${NADA_FOI_RESTAURADO}`);

  const armazenamento = deps.armazenamento ?? window.localStorage;
  const agora = deps.agora ?? (() => new Date());

  // O assistente guarda o vocabulário na memória e só o grava um instante depois. O plano (o que sai, o que entra) e a
  // cópia olham o `localStorage`: com o modelo ainda só na memória, ele ficaria fora da remoção e sobraria depois da
  // restauração, misturado com o do backup (correção da rodada 1, 21/10/2026). Gravá-lo antes de planejar é o que o
  // aplicativo faria em seguida de qualquer jeito (no `pagehide`); não é uma escrita do backup. Sem pausa entre isto, o
  // plano e a cópia: nada novo chega à memória no meio.
  descarregar();

  let plano: Plano;
  try {
    plano = planejar(backup, opcoes, armazenamento);
  } catch (e) {
    if (e instanceof ErroDeBackup) throw e;
    console.warn('[backup] não foi possível ler o armazenamento:', e);
    throw new ErroDeBackup('armazenamento', `Não foi possível ler os dados guardados neste navegador agora. ${NADA_FOI_RESTAURADO}`);
  }

  // 2. A voz tem como voltar? (Antes da cópia e de qualquer escrita: recusar sai de graça.)
  const ponteDaVoz = deps.ponteDaVoz === undefined ? ponteDoBackupDaVoz() : deps.ponteDaVoz;
  if (backup.arquivosDaVoz && !ponteDaVoz) {
    throw new ErroDeBackup(
      'voz-falhou',
      `Este backup traz gravações da voz, que só o aplicativo instalado consegue restaurar. Abra o IrisFlow instalado neste computador e restaure por lá. ${NADA_FOI_RESTAURADO}`,
    );
  }

  // 3. Sem cópia do que há, não há volta: não restaura.
  const copia = await guardarACopia(deps, armazenamento, agora);

  // 4. A voz só SOMA. Se falhar, nada do resto foi tocado.
  const voz = backup.arquivosDaVoz && ponteDaVoz ? await devolverAVoz(ponteDaVoz, backup, opcoes.perfil) : null;

  // 5. O assistente guarda o vocabulário na memória e o grava ao fechar a página (`pagehide`): sem esquecê-lo
  //    antes, a recarga desta restauração o sobrescreveria com o de antes. (Já foi gravado, antes do plano.)
  esquecerSemGravar();
  gravarAsChaves(armazenamento, plano, copia);

  // 6. O recado (aparece depois da recarga) e a recarga.
  const resumo: ResumoDaRestauracao = {
    modo: plano.modo,
    ...(plano.paciente ? { paciente: plano.paciente } : {}),
    restauradoEm: agora().toISOString(),
    backupCriadoEm: backup.criadoEm,
    chavesGravadas: plano.grava.length,
    chavesRemovidas: plano.remove.length,
    voz,
    copia,
    ...(plano.desmarcaPaciente ? { pacienteDesmarcado: true } : {}),
  };
  guardarResumoDaRestauracao(resumo, deps.sessao);
  (deps.recarregar ?? (() => window.location.reload()))();
  return resumo;
}
