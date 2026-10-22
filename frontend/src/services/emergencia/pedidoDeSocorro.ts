/**
 * O pedido de socorro em andamento — envio, alarme local e confirmação do
 * cuidador — FORA da árvore do React.
 *
 * Por que um módulo, e não a tela de emergência (auditoria de falhas
 * silenciosas de 18/10/2026, itens 2 e 6):
 *
 *  - O envio morava no `useEffect` da tela `/emergency`, que é carregada sob
 *    demanda. Um erro ao desenhar a tela (ou ao baixar o pedaço do código dela)
 *    deixava só a fronteira de erro: nenhum pedido saía, nenhum alarme tocava, e
 *    o texto da fronteira dizia que o botão de Emergência continuava valendo —
 *    sendo que nessa rota ele não aparece.
 *  - O alarme também morava na tela: um olhar no "Voltar" do cabeçalho (ou no
 *    "Parar o alarme") desmontava a tela e calava o único alarme, sem pedir
 *    confirmação, mesmo com o pedido preso na fila sem internet.
 *  - E o alarme local só começava depois do prazo do cuidador (até 300 s),
 *    sem olhar se o pedido tinha saído. O prazo pressupõe que o celular foi
 *    avisado e que o servidor vai escalar; sem internet o servidor nem sabe do
 *    pedido, e a tela afirmava "o alarme está tocando aqui" enquanto só um bipe
 *    de 2 s tinha tocado.
 *
 * Agora quem dispara (botão flutuante, contagem regressiva, Modo Computador ou
 * a grade da própria tela) chama `dispararPedidoDeSocorro`, que envia NA HORA
 * e cuida do alarme; a tela só mostra o estado. O alarme para quando o
 * cuidador confirma (`registrarReconhecimento`) ou quando o paciente confirma,
 * em dois passos, que quer pará-lo (`encerrarPedido`).
 *
 * Quando o alarme local começa:
 *  - pedido entregue (`enviado`) ou ensaio: no prazo do cuidador
 *    (`patient_settings.emergency_timeout_s`; sem ajuste, 45 s — o MESMO padrão
 *    do servidor em `escalar_pedidos_de_ajuda`; antes o computador usava 15 s e
 *    o servidor 45, e os dois avisos não coincidiam);
 *  - pedido NÃO entregue (`na_fila`, `falhou`, `sem_nuvem`, `sem_push`): em
 *    5 s — ninguém mais vai ser avisado, o alarme daqui é o único;
 *  - pedido gravado sem saber do push (`push_incerto`, o reenvio que achou o
 *    pedido já gravado): também em 5 s. Esperar o prazo do cuidador (até
 *    300 s) pressupõe que o celular foi avisado, e isso ninguém sabe; um
 *    alarme a mais aqui é o erro seguro (revisão de UX de 19/10/2026);
 *  - sem resposta do envio (`enviando`) por 12 s: tratado como não entregue
 *    (o envio desiste em 10 s e vai para a fila).
 *
 * O pedido ativo sobrevive a uma recarga da página (revisão de segurança de
 * 19/10/2026): ele é gravado no `sessionStorage` a cada mudança e
 * `restaurarPedidoDeSocorro` (chamado no `main.tsx`, antes de desenhar) o traz
 * de volta — com o alarme, se ele estava tocando. Antes, uma página travada que
 * o vigia recarregava voltava sem pedido e sem sirene, e o alarme do sistema
 * (janela por cima, volume no máximo) ficava preso no processo principal.
 */
import {
  emitirFalaDoPaciente,
  emitirPedidoDeAjuda,
  ouvirEntrega,
  entregaDoPedido,
  idDoPedidoNoServidor,
  type EntregaDoPedido,
} from '../../cloud/eventos';
import { novoIdDePedido } from '../../cloud/desktopSync';
import type { ReconhecimentoDoCuidador } from '../../cloud/types';
import { getSharedAudioContext, tocarSirene } from '../../utils/emergencyAudio';
import { falaPrioritariaEmCurso } from '../voz/sistema';
import { definirEmergenciaAtiva } from '../estadoDeEmergencia';
import { ligarAlarmeDoSistema, desligarAlarmeDoSistema, reconciliarAlarmeDoSistema } from './ponteDoAlarme';

/** Mesmo padrão do servidor (`coalesce(ps.emergency_timeout_s, 45)`). */
export const PRAZO_PADRAO_DO_CUIDADOR_S = 45;
/** Pedido que não chegou a ninguém: o alarme daqui começa quase na hora. */
export const PRAZO_SEM_ENTREGA_S = 5;
/** Sem resposta do envio por este tempo = não entregue (o envio desiste em 10 s). */
export const PRAZO_DO_ENVIO_S = 12;
/** Ciclo do alarme: sirene de 3 s, depois a frase falada, sem uma cobrir a outra. */
export const CICLO_DO_ALARME_MS = 6_000;
const SIRENE_S = 3;

export type FaseDoPedido = 'aguardando' | 'escalado' | 'visto' | 'encerrado';

export interface PedidoDeSocorro {
  id: string;
  /** Tipo escolhido na grade ('pain', 'breath', 'cold', 'other'). */
  tipo: string;
  rotulo: string;
  disparadoEm: number;
  entrega: EntregaDoPedido | null;
  fase: FaseDoPedido;
  /** `acknowledged_at` da confirmação do cuidador. */
  vistoEm: string | null;
  escaladoEm: number | null;
  motivoDoEscalonamento: 'prazo' | 'sem_entrega' | null;
  /** Prazo do cuidador em vigor para ESTE pedido, em segundos. */
  prazoS: number;
  /** Id com que o servidor gravou o pedido, quando não aceitou o daqui; senão `null`. */
  idNoServidor: string | null;
}

/** Onde o pedido ativo sobrevive a uma recarga da página. */
export const CHAVE_DO_PEDIDO_ATIVO = 'irisflow_socorro_ativo';
/** Pedido gravado há mais do que isto não volta (o servidor já escalou o que tinha de escalar). */
export const RESTAURAR_PEDIDO_ATE_MS = 6 * 3600_000;

// `limitado` não deveria chegar a um pedido de socorro (o servidor nunca limita a Emergência), mas se
// chegasse o alarme daqui não pode esperar o prazo do cuidador: é como não entregue (M6, 21/10/2026).
const ENTREGAS_SEM_DESTINATARIO = new Set<EntregaDoPedido>(['na_fila', 'falhou', 'sem_nuvem', 'sem_push', 'limitado', 'push_incerto']);
const ENTREGAS_VALIDAS = new Set<EntregaDoPedido>(['enviando', 'enviado', 'sem_push', 'limitado', 'push_incerto', 'na_fila', 'sem_nuvem', 'falhou', 'ensaio']);

let atual: PedidoDeSocorro | null = null;
const ouvintes = new Set<() => void>();
let prazoDoCuidadorS: number | null = null;
let volumeMaximo = true;
let timerDoEscalonamento: ReturnType<typeof setTimeout> | null = null;
let timerDoAlarme: ReturnType<typeof setInterval> | null = null;
let timerDaFala: ReturnType<typeof setTimeout> | null = null;
let soltarEntrega: (() => void) | null = null;
let vistoDito = false;
let timerDoVisto: ReturnType<typeof setTimeout> | null = null;

/**
 * Teto da espera pela frase "Seu cuidador viu o pedido às HH:MM" (3 s de fala):
 * se o Chromium não avisar o fim, a pergunta do cuidador à espera não pode
 * ficar esperando para sempre. Mesmo cuidado do teto de segurança da voz.
 */
export const ESPERA_MAXIMA_DO_VISTO_MS = 8_000;

/** Grava (ou apaga) o pedido ativo. Sem armazenamento, ele vive só na memória, como antes. */
function gravarPedidoAtivo(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (!atual || atual.fase === 'encerrado') sessionStorage.removeItem(CHAVE_DO_PEDIDO_ATIVO);
    else sessionStorage.setItem(CHAVE_DO_PEDIDO_ATIVO, JSON.stringify(atual));
  } catch {
    // Armazenamento cheio ou bloqueado: a recarga perderia o pedido, mas o
    // pedido em si (e o alarme) seguem nesta página.
  }
}

function notificar(): void {
  gravarPedidoAtivo();
  avisarOuvintes();
}

function avisarOuvintes(): void {
  for (const o of ouvintes) {
    try {
      o();
    } catch (e) {
      console.warn('[socorro] ouvinte falhou', e);
    }
  }
}

function atualizar(p: Partial<PedidoDeSocorro>): void {
  if (!atual) return;
  atual = { ...atual, ...p };
  notificar();
}

/** O pedido mais recente (inclusive encerrado), ou `null`. Mesmo objeto até mudar. */
export function pedidoAtual(): PedidoDeSocorro | null {
  return atual;
}

/** Há um pedido que ainda pede atenção (aguardando, escalado ou visto)? */
export function haPedidoAtivo(): boolean {
  return atual !== null && atual.fase !== 'encerrado';
}

export function ouvirPedido(o: () => void): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

/**
 * Prazo configurado pelo cuidador no app (`emergency_timeout_s`). `null`
 * volta ao padrão. Vale também para o pedido em andamento.
 */
export function definirPrazoDoCuidador(segundos: number | null | undefined): void {
  const s = typeof segundos === 'number' && Number.isFinite(segundos) && segundos > 0 ? segundos : null;
  if (s === prazoDoCuidadorS) return;
  prazoDoCuidadorS = s;
  if (atual && atual.fase === 'aguardando') {
    atualizar({ prazoS: s ?? PRAZO_PADRAO_DO_CUIDADOR_S });
    reavaliar();
  }
}

/** Ajuste "volume máximo no alarme" (Configurações). */
export function definirVolumeMaximoDoAlarme(ligado: boolean): void {
  volumeMaximo = ligado;
}

/**
 * Fala `texto` pelo sintetizador. Devolve se a fala foi entregue a ele (`false`:
 * sem voz no sistema ou erro ao pedir). `aoTerminar` roda no fim da fala, ou se
 * ela der erro ou for cortada — o que vier primeiro.
 */
function falar(texto: string, opcoes: { pitch?: number; rate?: number; aoTerminar?: () => void } = {}): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
  try {
    // A mensagem do cuidador (fala prioritária) não é cortada por um aviso
    // repetitivo: o aviso entra na fila dela.
    if (!falaPrioritariaEmCurso()) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'pt-BR';
    u.rate = opcoes.rate ?? 1.0;
    if (opcoes.pitch !== undefined) u.pitch = opcoes.pitch;
    u.volume = 1.0;
    if (opcoes.aoTerminar) {
      u.onend = opcoes.aoTerminar;
      u.onerror = opcoes.aoTerminar;
    }
    window.speechSynthesis.speak(u);
    return true;
  } catch (e) {
    console.warn('[socorro] fala indisponível', e);
    return false;
  }
}

/**
 * A frase "Seu cuidador viu o pedido às HH:MM" está sendo dita? A pergunta do
 * cuidador, que abre no instante do "visto", espera o fim dela: a voz da pergunta
 * começa com `speechSynthesis.cancel()` e cortava a frase (revisão final, rodada
 * 1, M1, 21/10/2026). Quem lê assina com `ouvirPedido`.
 */
export function vistoSendoDito(): boolean {
  return vistoDito;
}

function definirVistoDito(dito: boolean): void {
  if (timerDoVisto) {
    clearTimeout(timerDoVisto);
    timerDoVisto = null;
  }
  if (dito) {
    timerDoVisto = setTimeout(() => {
      timerDoVisto = null;
      definirVistoDito(false);
    }, ESPERA_MAXIMA_DO_VISTO_MS);
  }
  if (vistoDito === dito) return;
  vistoDito = dito;
  avisarOuvintes();
}

function pararFala(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    if (!falaPrioritariaEmCurso()) window.speechSynthesis.cancel();
  } catch { /* nada a parar */ }
}

/** Bipe forte inicial (2 s) e a frase "ALERTA MÉDICO". */
function avisoInicial(rotulo: string): void {
  const ctx = getSharedAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 2);
      osc.onended = () => { try { osc.disconnect(); } catch { /* já desconectado */ } };
    } catch {
      // áudio indisponível não derruba o pedido
    }
  }
  falar(`ALERTA MÉDICO: ${rotulo}`, { pitch: 1.5 });
}

function limparTimerDoEscalonamento(): void {
  if (timerDoEscalonamento) {
    clearTimeout(timerDoEscalonamento);
    timerDoEscalonamento = null;
  }
}

function ligarAlarme(): void {
  if (timerDoAlarme) return;
  const ciclo = () => {
    tocarSirene(SIRENE_S);
    if (timerDaFala) clearTimeout(timerDaFala);
    timerDaFala = setTimeout(() => {
      timerDaFala = null;
      if (!atual || atual.fase !== 'escalado') return;
      // Nunca por cima da mensagem do cuidador (FE-5).
      if (falaPrioritariaEmCurso()) return;
      falar('ALERTA CRÍTICO: o paciente precisa de socorro imediato!', { pitch: 1.3 });
    }, SIRENE_S * 1000 + 200);
  };
  ciclo();
  timerDoAlarme = setInterval(ciclo, CICLO_DO_ALARME_MS);
  ligarAlarmeDoSistema({ volumeMaximo });
}

function desligarAlarme(): void {
  if (timerDoAlarme) {
    clearInterval(timerDoAlarme);
    timerDoAlarme = null;
  }
  if (timerDaFala) {
    clearTimeout(timerDaFala);
    timerDaFala = null;
  }
  pararFala();
  desligarAlarmeDoSistema();
}

function escalar(motivo: 'prazo' | 'sem_entrega'): void {
  if (!atual || atual.fase !== 'aguardando') return;
  limparTimerDoEscalonamento();
  atualizar({ fase: 'escalado', escaladoEm: Date.now(), motivoDoEscalonamento: motivo });
  console.warn(`[socorro] alarme local ligado (${motivo === 'prazo' ? `ninguém confirmou em ${atual.prazoS} s` : `pedido não entregue: ${atual.entrega ?? 'sem resposta'}`})`);
  ligarAlarme();
}

/** Quando o alarme local deve começar para o estado de entrega atual. */
export function momentoDoAlarme(p: Pick<PedidoDeSocorro, 'disparadoEm' | 'entrega' | 'prazoS'>): { em: number; motivo: 'prazo' | 'sem_entrega' } {
  if (p.entrega && ENTREGAS_SEM_DESTINATARIO.has(p.entrega)) {
    return { em: p.disparadoEm + PRAZO_SEM_ENTREGA_S * 1000, motivo: 'sem_entrega' };
  }
  if (p.entrega === 'enviado' || p.entrega === 'ensaio') {
    return { em: p.disparadoEm + p.prazoS * 1000, motivo: 'prazo' };
  }
  // `enviando` ou ainda sem notícia: espera a resposta do envio, não o prazo.
  return { em: p.disparadoEm + PRAZO_DO_ENVIO_S * 1000, motivo: 'sem_entrega' };
}

function reavaliar(): void {
  limparTimerDoEscalonamento();
  if (!atual || atual.fase !== 'aguardando') return;
  const { em, motivo } = momentoDoAlarme(atual);
  const espera = em - Date.now();
  if (espera <= 0) {
    escalar(motivo);
    return;
  }
  timerDoEscalonamento = setTimeout(() => {
    timerDoEscalonamento = null;
    // Reavalia na hora: a entrega pode ter mudado sem notificar (ou o prazo).
    if (!atual || atual.fase !== 'aguardando') return;
    const agora = momentoDoAlarme(atual);
    if (agora.em <= Date.now() + 5) escalar(agora.motivo);
    else reavaliar();
  }, espera);
}

function aoMudarEntrega(idDoPedido: string, entrega: EntregaDoPedido): void {
  if (!atual || idDoPedido !== atual.id) return;
  atualizar({ entrega, idNoServidor: idDoPedidoNoServidor(idDoPedido) ?? atual.idNoServidor });
  reavaliar();
}

/**
 * Dispara o pedido de socorro: envia agora, toca o aviso inicial e passa a
 * vigiar a entrega. Com um pedido ainda ativo, devolve o mesmo pedido — não
 * cria um segundo (nem um segundo push).
 */
export function dispararPedidoDeSocorro(tipo: string, rotulo: string): PedidoDeSocorro {
  if (atual && atual.fase !== 'encerrado') return atual;
  limparTudo();
  const id = novoIdDePedido();
  atual = {
    id, tipo, rotulo,
    disparadoEm: Date.now(),
    entrega: null,
    fase: 'aguardando',
    vistoEm: null,
    escaladoEm: null,
    motivoDoEscalonamento: null,
    prazoS: prazoDoCuidadorS ?? PRAZO_PADRAO_DO_CUIDADOR_S,
    idNoServidor: null,
  };
  // Durante o socorro a correção por dwell não aprende (ver estadoDeEmergencia).
  definirEmergenciaAtiva(true, 'pedido');
  notificar();
  soltarEntrega = ouvirEntrega(aoMudarEntrega);
  avisoInicial(rotulo);
  try {
    emitirPedidoDeAjuda('emergencia', rotulo, id);
  } catch (e) {
    // O barramento não lança (os ouvintes são isolados); se lançar mesmo
    // assim, o pedido não saiu e o alarme daqui assume.
    console.error('[socorro] o pedido não pôde ser enviado', e);
    atualizar({ entrega: 'falhou' });
  }
  // O barramento pode ter respondido de forma síncrona (sem nuvem, ensaio).
  const ja = entregaDoPedido(id);
  if (ja && atual && atual.entrega !== ja) atualizar({ entrega: ja });
  reavaliar();
  return atual;
}

/**
 * Chegou a confirmação do cuidador. Só vale a DESTE pedido, reconhecida pelo
 * id (o daqui, que o servidor grava, ou o que a resposta do envio devolveu).
 *
 * Revisão de segurança de 19/10/2026: antes, a confirmação de OUTRO pedido com
 * horário até 60 s antes do disparo também valia. O "Estou indo" do "Chamar
 * atenção" calava o socorro de falta de ar disparado logo depois — o alarme
 * local dos 45 s nunca tocava e o computador dizia ao paciente "Seu cuidador
 * viu o pedido". A comparação por horário existia para um servidor que não
 * gravasse o id do computador; esse caso agora vem pelo id da resposta.
 */
export function registrarReconhecimento(r: ReconhecimentoDoCuidador | null | undefined): void {
  if (!r || !atual) return;
  if (atual.fase !== 'aguardando' && atual.fase !== 'escalado') return;
  const idNoServidor = atual.idNoServidor ?? idDoPedidoNoServidor(atual.id);
  if (r.id !== atual.id && r.id !== idNoServidor) return;
  limparTimerDoEscalonamento();
  desligarAlarme();
  // A frase é dita sem prioridade; o módulo diz que está sendo dita até o fim
  // dela, para a pergunta do cuidador à espera não a cortar (M1). Antes de
  // `atualizar`: quem acorda com a fase "visto" já encontra a espera marcada.
  definirVistoDito(true);
  atualizar({ fase: 'visto', vistoEm: r.acknowledged_at });
  const hora = new Date(r.acknowledged_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const entregue = falar(`Seu cuidador viu o pedido às ${hora}.`, { rate: 0.95, aoTerminar: () => definirVistoDito(false) });
  if (!entregue) definirVistoDito(false);
}

/**
 * Fim do pedido do lado do computador: o paciente confirmou que quer parar o
 * alarme, ou saiu da tela depois de o cuidador ver. Se o cuidador ainda não
 * tinha visto, ele recebe uma mensagem dizendo que o alarme foi parado aqui —
 * o pedido continua aberto no celular dele (só ele o encerra).
 */
export function encerrarPedido(motivo: 'paciente_parou' | 'concluido'): void {
  if (!atual || atual.fase === 'encerrado') return;
  const naoVisto = atual.fase !== 'visto';
  limparTudo();
  atualizar({ fase: 'encerrado' });
  definirEmergenciaAtiva(false, 'pedido');
  if (motivo === 'paciente_parou' && naoVisto && atual.entrega !== 'ensaio' && atual.entrega !== 'sem_nuvem') {
    try {
      emitirFalaDoPaciente('O alarme de socorro foi parado no computador do paciente.', 'sistema');
    } catch (e) {
      console.warn('[socorro] aviso de alarme parado não enviado', e);
    }
  }
}

function limparTudo(): void {
  limparTimerDoEscalonamento();
  desligarAlarme();
  definirVistoDito(false);
  if (soltarEntrega) {
    soltarEntrega();
    soltarEntrega = null;
  }
}

/** Valida o pedido lido do armazenamento (pode estar truncado ou editado à mão). */
function pedidoGravado(o: unknown): PedidoDeSocorro | null {
  if (!o || typeof o !== 'object') return null;
  const p = o as Record<string, unknown>;
  const texto = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 500;
  const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!texto(p.id) || !texto(p.tipo) || typeof p.rotulo !== 'string' || !numero(p.disparadoEm)) return null;
  if (!numero(p.prazoS) || p.prazoS <= 0) return null;
  if (p.fase !== 'aguardando' && p.fase !== 'escalado' && p.fase !== 'visto') return null;
  return {
    id: p.id,
    tipo: p.tipo,
    rotulo: p.rotulo.slice(0, 500),
    disparadoEm: p.disparadoEm,
    entrega: ENTREGAS_VALIDAS.has(p.entrega as EntregaDoPedido) ? (p.entrega as EntregaDoPedido) : null,
    fase: p.fase,
    vistoEm: typeof p.vistoEm === 'string' ? p.vistoEm : null,
    escaladoEm: numero(p.escaladoEm) ? p.escaladoEm : null,
    motivoDoEscalonamento: p.motivoDoEscalonamento === 'prazo' || p.motivoDoEscalonamento === 'sem_entrega' ? p.motivoDoEscalonamento : null,
    prazoS: p.prazoS,
    idNoServidor: texto(p.idNoServidor) ? p.idNoServidor : null,
  };
}

/**
 * Na abertura da página: traz de volta o pedido que estava ativo antes de uma
 * recarga — com o alarme, se ele estava tocando, e o prazo contado do disparo
 * (não da recarga). Sem pedido a restaurar, desliga o alarme do sistema que a
 * página anterior possa ter deixado ligado. Devolve se restaurou.
 */
export function restaurarPedidoDeSocorro(agoraMs: number = Date.now()): boolean {
  if (atual) return false;
  let salvo: PedidoDeSocorro | null = null;
  try {
    const bruto = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CHAVE_DO_PEDIDO_ATIVO) : null;
    if (bruto) salvo = pedidoGravado(JSON.parse(bruto));
  } catch {
    salvo = null;
  }
  if (!salvo || agoraMs - salvo.disparadoEm > RESTAURAR_PEDIDO_ATE_MS || salvo.disparadoEm > agoraMs + 60_000) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CHAVE_DO_PEDIDO_ATIVO);
    } catch { /* nada gravado */ }
    reconciliarAlarmeDoSistema();
    return false;
  }
  atual = salvo;
  definirEmergenciaAtiva(true, 'pedido');
  soltarEntrega = ouvirEntrega(aoMudarEntrega);
  console.warn(`[socorro] pedido em andamento restaurado depois de a página recarregar (${salvo.fase})`);
  if (salvo.fase === 'escalado') {
    ligarAlarme();
  } else {
    reconciliarAlarmeDoSistema();
    reavaliar();
  }
  notificar();
  return true;
}

/** Só para testes. */
export function _reiniciarSocorroParaTestes(): void {
  limparTudo();
  atual = null;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CHAVE_DO_PEDIDO_ATIVO);
  } catch { /* sem armazenamento */ }
  prazoDoCuidadorS = null;
  volumeMaximo = true;
  ouvintes.clear();
  definirEmergenciaAtiva(false, 'pedido');
}
