/**
 * Para onde a voz do paciente sai — o caminho da voz até as chamadas
 * (roadmap 3, de 19/10/2026; rodada 3, de 21/10/2026).
 *
 * Numa chamada de WhatsApp ou Meet, a voz precisa chegar ao outro lado. O
 * caminho é um cabo de áudio virtual (VB-CABLE): o IrisFlow toca a voz em
 * "CABLE Input", e o aplicativo da chamada usa "CABLE Output" como microfone.
 * Quem manda o som para lá é o `setSinkId` do Chromium (no Electron 43 do
 * projeto ele existe tanto no `<audio>` quanto no `AudioContext`; este desde o
 * Chromium 110 — e, sem ele, a função devolve `false` em vez de lançar).
 *
 * O que segue a saída escolhida: a voz clonada e a voz guardada, que tocam
 * pelo `AudioContext` de `local.ts`. O que NÃO segue, de propósito ou por
 * limite da plataforma:
 *  - a voz do sistema (`speechSynthesis`): o Chromium não deixa escolher a
 *    saída dela;
 *  - o alarme da emergência e a leitura das mensagens do cuidador: são para
 *    quem está em casa ouvir, não para a outra ponta da chamada.
 *
 * Este arquivo tem duas partes: o que não depende da tela (listar as saídas do
 * computador e aplicar uma a um `<audio>` ou `AudioContext`) e a "saída em
 * uso" (o ajuste de Configurações, aplicado ao contexto da voz e vigiado).
 * Nada aqui lança: uma saída que não abre nunca pode derrubar a fala.
 */

import { codificarWav } from './vozGuardada/wav';

/** Uma saída de áudio do computador, como a lista da tela mostra. */
export interface SaidaDeAudio {
  id: string;
  /** Nunca vazio: o navegador esconde o nome antes da permissão de mídia. */
  rotulo: string;
}

/** O que sabe trocar de saída: um `<audio>`/`<video>` ou um `AudioContext`. */
export type AlvoDeAudio = HTMLMediaElement | AudioContext;

/** A opção que não escolhe nada: o som segue a saída padrão do Windows. */
export const ROTULO_DA_SAIDA_PADRAO = 'Saída padrão do computador';

/**
 * O Chromium repete o aparelho padrão como "default" e o de chamadas como
 * "communications". Os dois já cabem na opção "Saída padrão do computador" —
 * e o cabo aparece de novo, pelo nome de verdade, mais abaixo na lista.
 */
const IDS_DE_ATALHO = new Set(['default', 'communications']);

/** O nome que a lista dá a um aparelho quando o sistema não informa o dele. */
const rotuloGenerico = (posicao: number) => `Saída ${posicao}`;

/**
 * `true` para o nome inventado por `listarSaidas` ("Saída 2"). A tela usa isto
 * para explicar como achar o cabo quando o Windows não mostra os nomes.
 */
export const ehRotuloGenerico = (rotulo: string): boolean => /^Saída \d+$/.test(rotulo);

/** Um `deviceId` tem algumas dezenas de caracteres; mais que isto é disco editado à mão. */
const TAMANHO_MAXIMO_DO_ID = 512;

/**
 * As saídas de áudio do computador (alto-falantes, fones, o CABLE Input quando
 * instalado). Nunca lança: sem a lista, a tela mostra só a saída padrão.
 *
 * Antes da permissão de mídia o navegador devolve o nome vazio. O item não
 * some: ganha "Saída 2", "Saída 3"… pela posição na lista, que é também o que
 * a pessoa vê na tela.
 */
export async function listarSaidas(): Promise<SaidaDeAudio[]> {
  try {
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!md?.enumerateDevices) return [];
    const todos = await md.enumerateDevices();
    return todos
      .filter((d) => d.kind === 'audiooutput' && !!d.deviceId && !IDS_DE_ATALHO.has(d.deviceId))
      .map((d, i) => {
        const nome = d.label?.trim();
        return { id: d.deviceId, rotulo: nome ? nome : rotuloGenerico(i + 1) };
      });
  } catch {
    return [];
  }
}

/** Por que a saída não foi aplicada. */
export type MotivoDaSaida =
  /** O alvo não tem `setSinkId` (runtime sem a API). */
  | 'sem_suporte'
  /** O aparelho não existe mais (cabo desinstalado, USB solto): `NotFoundError`. */
  | 'nao_encontrada'
  /** O sistema recusou (`NotAllowedError`, `SecurityError`). */
  | 'recusada'
  | 'erro';

export type ResultadoDaSaida = { ok: true } | { ok: false; motivo: MotivoDaSaida; erro?: unknown };

/** O pedaço de `HTMLMediaElement`/`AudioContext` que importa aqui. */
interface ComSaida {
  setSinkId?: (id: string) => Promise<void>;
}

function motivoDaFalha(e: unknown): MotivoDaSaida {
  const nome = (e as { name?: string } | null)?.name ?? '';
  if (nome === 'NotFoundError') return 'nao_encontrada';
  if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'recusada';
  return 'erro';
}

/**
 * Aplica a saída e diz por que não deu. Nunca lança.
 *
 * Sem `setSinkId` no alvo, o pedido de um aparelho não pode ser cumprido — mas
 * pedir a saída padrão sim: sem a API o som só pode estar nela.
 */
export async function tentarSaida(alvo: AlvoDeAudio, id: string | null): Promise<ResultadoDaSaida> {
  const a = alvo as unknown as ComSaida | null | undefined;
  if (!a) return { ok: false, motivo: 'sem_suporte' };
  if (typeof a.setSinkId !== 'function') {
    return id === null ? { ok: true } : { ok: false, motivo: 'sem_suporte' };
  }
  try {
    // '' é a saída padrão do sistema. Chamado como método: o `setSinkId` de
    // verdade precisa do `this` (do contrário, "Illegal invocation").
    await a.setSinkId(id ?? '');
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: motivoDaFalha(e), erro: e };
  }
}

/**
 * Manda o som de `alvo` para a saída `id` (`null` = a saída padrão).
 * `true` quando a saída pedida passou a valer; `false` quando não deu — sem
 * suporte, aparelho ausente ou recusado. Nunca lança.
 */
export async function aplicarSaida(alvo: AlvoDeAudio, id: string | null): Promise<boolean> {
  return (await tentarSaida(alvo, id)).ok;
}

/**
 * O código de um aparelho como saída da voz, ou `null` (a saída padrão) para
 * qualquer outra coisa — um valor estranho não pode virar um aparelho que nunca
 * vai abrir. (O ajuste não volta do disco: vale só para a sessão, B1.)
 */
export function saidaDaVozValida(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const id = v.trim();
  return id !== '' && id.length <= TAMANHO_MAXIMO_DO_ID ? id : null;
}

// ---------------------------------------------------------------------------
// A saída em uso.
// ---------------------------------------------------------------------------

/**
 * Evento na `window` quando a saída escolhida deixa de abrir (`perdida: true`)
 * ou volta a abrir (`perdida: false`). O aviso da tela e a seção de
 * Configurações escutam este evento.
 */
export const EVENTO_DA_SAIDA_DA_VOZ = 'irisflow:saida-da-voz';

export interface DetalheDaSaidaDaVoz {
  perdida: boolean;
}

/**
 * Quanto a fala espera uma troca de saída que ainda está em andamento. Só
 * conta na primeira fala depois de abrir o app ou de trocar o ajuste: sem
 * troca em andamento a fala não espera nada. É o que impede a primeira frase
 * de uma chamada de sair pelo alto-falante da sala em vez de ir para o cabo.
 */
export const TETO_DA_TROCA_DE_SAIDA_MS = 400;

/** O ajuste de Configurações, espelhado aqui para quem toca a voz. */
let escolhida: string | null = null;
/** A saída escolhida não abriu: a voz está na saída padrão. */
let perdida = false;
/** Quem toca a voz do paciente (hoje, o `AudioContext` de `local.ts`). */
const alvos = new Set<AlvoDeAudio>();
/** Sobe a cada troca: o resultado de uma troca que já foi superada não vale. */
let geracao = 0;
/** A troca em andamento, se houver. */
let pendente: Promise<void> | null = null;
/** Onde o `devicechange` está sendo ouvido. */
let dispositivos: EventTarget | null = null;

export function saidaDaVozEscolhida(): string | null {
  return escolhida;
}

/** A saída escolhida não está abrindo e a voz está na saída padrão. */
export function saidaDaVozPerdida(): boolean {
  return perdida;
}

function emitir(perdidaAgora: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<DetalheDaSaidaDaVoz>(EVENTO_DA_SAIDA_DA_VOZ, { detail: { perdida: perdidaAgora } }),
  );
}

/**
 * A saída escolhida não abriu: um aviso na tela e uma linha no console, UMA
 * vez por perda — não a cada fala. Só volta a avisar depois de a saída abrir
 * de novo (ou de a pessoa escolher outra).
 */
function marcarPerdida(motivo: MotivoDaSaida, erro?: unknown): void {
  if (perdida) return;
  perdida = true;
  console.warn(
    `[voz] a saída de áudio escolhida para as chamadas não abriu (${motivo}); a voz sai pelo alto-falante padrão.`,
    erro ?? '',
  );
  emitir(true);
}

function emAndamento(tarefa: Promise<void>): void {
  pendente = tarefa;
  void tarefa.then(() => {
    if (pendente === tarefa) pendente = null;
  });
}

/**
 * Põe a saída escolhida em todos os alvos. Se o aparelho não abre, devolve os
 * alvos à saída padrão e marca a perda — a fala segue, só que pelo
 * alto-falante.
 */
async function trocarSaidaDosAlvos(): Promise<void> {
  const minha = ++geracao;
  const id = escolhida;
  const lista = [...alvos];
  // Ainda não há contexto: nada foi conferido (o contexto, ao nascer, aplica).
  if (lista.length === 0) return;
  try {
    const resultados = await Promise.all(lista.map((a) => tentarSaida(a, id)));
    // Outra escolha tomou o lugar enquanto esta abria: quem manda é a última.
    if (minha !== geracao) return;
    const falha = resultados.find((r): r is Extract<ResultadoDaSaida, { ok: false }> => !r.ok);
    if (!falha || id === null) {
      if (perdida) {
        perdida = false;
        emitir(false);
      }
      return;
    }
    await Promise.all(lista.map((a) => aplicarSaida(a, null)));
    if (minha !== geracao) return;
    marcarPerdida(falha.motivo, falha.erro);
  } catch (e) {
    // `tentarSaida` e `aplicarSaida` não lançam; isto é só a rede de segurança.
    console.warn('[voz] a troca da saída de áudio falhou de um jeito inesperado:', e);
  }
}

function iniciarTroca(): void {
  emAndamento(trocarSaidaDosAlvos());
}

/**
 * O aparelho escolhido sumiu da lista do sistema (cabo desligado no meio da
 * sessão): a voz volta para a saída padrão agora, antes da próxima fala.
 */
async function voltarAoPadraoPorqueSumiu(): Promise<void> {
  const minha = ++geracao;
  await Promise.all([...alvos].map((a) => aplicarSaida(a, null)));
  if (minha === geracao) marcarPerdida('nao_encontrada');
}

/**
 * Confere se o aparelho escolhido continua na lista. Uma lista vazia não diz
 * nada (a API falhou, ou o sistema escondeu os aparelhos): só o que se vê
 * ausente numa lista que existe conta como "sumiu".
 */
async function conferirDispositivos(): Promise<void> {
  const id = escolhida;
  if (id === null) return;
  const saidas = await listarSaidas();
  if (id !== escolhida || saidas.length === 0) return;
  const presente = saidas.some((s) => s.id === id);
  if (!presente && !perdida) {
    const tarefa = voltarAoPadraoPorqueSumiu();
    emAndamento(tarefa);
    await tarefa;
  } else if (presente && perdida) {
    // O cabo voltou: a voz volta para ele.
    iniciarTroca();
  }
}

function aoMudarDispositivos(): void {
  void conferirDispositivos();
}

function acompanharDispositivos(ligar: boolean): void {
  if (!ligar) {
    dispositivos?.removeEventListener('devicechange', aoMudarDispositivos);
    dispositivos = null;
    return;
  }
  if (dispositivos) return;
  const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!md?.addEventListener) return;
  md.addEventListener('devicechange', aoMudarDispositivos);
  dispositivos = md;
}

/**
 * Põe em vigor o ajuste "saída da voz" (`null` = a saída padrão). Chamado ao
 * abrir o app e a cada mudança do ajuste — nunca no caminho da fala.
 *
 * Escolher de novo o aparelho que está fora é "tentar outra vez"; fora isso,
 * repetir a escolha não faz nada (o React repete efeitos).
 */
export function definirSaidaDaVoz(id: string | null): void {
  const novo = saidaDaVozValida(id);
  if (novo === escolhida && !perdida) return;
  if (novo !== escolhida) {
    escolhida = novo;
    // Outra escolha: o aviso da anterior não vale mais.
    if (perdida) {
      perdida = false;
      emitir(false);
    }
  }
  acompanharDispositivos(novo !== null);
  iniciarTroca();
}

/**
 * Registra quem toca a voz do paciente (o `AudioContext` de `local.ts`, ou um
 * `<audio>`): ele passa a seguir a saída escolhida e já nasce nela.
 *
 * Na saída padrão não se chama nada — o alvo nasce certo, e o caminho de quem
 * nunca escolheu uma saída fica exatamente como era. Com o aparelho fora, o
 * alvo também fica como nasceu: na saída padrão, sem tentar o que já se sabe
 * que não abre. Devolve a função que desfaz o registro.
 */
export function registrarAlvoDaVoz(alvo: AlvoDeAudio): () => void {
  alvos.add(alvo);
  if (escolhida !== null && !perdida) iniciarTroca();
  return () => {
    alvos.delete(alvo);
  };
}

/**
 * A espera da fala por uma troca de saída em andamento — ou `null` quando não
 * há nenhuma (o caminho comum: a fala não espera nada, nem uma microtarefa).
 * Com teto, para um `setSinkId` que trava não prender a fala.
 */
export function esperaDaTrocaDeSaida(): Promise<void> | null {
  const troca = pendente;
  if (!troca) return null;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, TETO_DA_TROCA_DE_SAIDA_MS);
    const pronto = () => {
      clearTimeout(timer);
      resolve();
    };
    void troca.then(pronto, pronto);
  });
}

// ---------------------------------------------------------------------------
// O sinal de teste.
// ---------------------------------------------------------------------------

/**
 * Um sinal curto e calmo (duas notas) para o botão "Testar". Sai pelo mesmo
 * `tocarWav` da voz, então testa o caminho de verdade: o mesmo contexto, a
 * mesma saída. Não depende de a voz clonada estar instalada.
 */
export function sinalDeTeste(): ArrayBuffer {
  const taxa = 22_050;
  const nota = (hz: number, segundos: number): Float32Array => {
    const n = Math.round(taxa * segundos);
    const amostras = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / taxa;
      // Subida de 15 ms e queda de 10 ms: sem estalo nas pontas.
      const envelope = Math.min(1, t / 0.015) * Math.min(1, (segundos - t) / 0.01) * Math.exp(-3 * (t / segundos));
      amostras[i] = 0.3 * envelope * Math.sin(2 * Math.PI * hz * t);
    }
    return amostras;
  };
  const partes = [nota(587.33, 0.28), new Float32Array(Math.round(taxa * 0.05)), nota(783.99, 0.4)];
  const tudo = new Float32Array(partes.reduce((soma, p) => soma + p.length, 0));
  let pos = 0;
  for (const p of partes) {
    tudo.set(p, pos);
    pos += p.length;
  }
  return codificarWav(tudo, taxa);
}

/** Só para testes: volta tudo ao que era na abertura do app. */
export function _redefinirSaida(): void {
  acompanharDispositivos(false);
  escolhida = null;
  perdida = false;
  alvos.clear();
  geracao++;
  pendente = null;
}
