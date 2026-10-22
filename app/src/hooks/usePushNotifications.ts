import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useData } from '@/data/DataContext';
import { brand } from '@/theme';

/**
 * App aberto pelo Expo Go (o cliente da loja, não um build do projeto).
 *
 * No Android, o Expo Go não entrega push remoto desde o SDK 53 — e até IMPORTAR
 * `expo-notifications` ali já registra um erro. No iOS o Expo Go ainda recebe
 * push, mas só com o projeto EAS do próprio app, que o Expo Go não carrega. Em
 * nenhum dos dois o token serviria para o servidor avisar este celular; por isso
 * no Expo Go o registro simplesmente não acontece, sem erro e sem aviso na tela.
 * Os alertas em tempo real (realtime) continuam chegando com o app aberto.
 */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function getNotificationsModule() {
  if (isExpoGo()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    return Notifications;
  } catch {
    return null;
  }
}

/**
 * Por que este build NÃO recebe push, ou `null` se ele recebe.
 *
 *  - `expo-go`: ambiente de desenvolvimento (ver `isExpoGo`). A tela não diz nada.
 *  - `emulador`: emulador/simulador não recebe push. A tela não diz nada.
 *  - `sem-projeto`: build de verdade sem `extra.eas.projectId` (app.json) — não
 *    existe token. Aqui a tela de Alertas avisa, em linguagem simples, que os
 *    alertas chegam com o app aberto: um cuidador não pode contar com um aviso
 *    que não vem. O detalhe técnico fica no console.
 */
export type MotivoSemPush = 'expo-go' | 'emulador' | 'sem-projeto';

export function pushIndisponivel(): MotivoSemPush | null {
  if (isExpoGo()) return 'expo-go';
  if (!Device.isDevice) return 'emulador';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return 'sem-projeto';
  return null;
}

/**
 * Falha do registro em tempo de execução:
 *  - `permissao`: o cuidador negou as notificações (resolve nos ajustes do sistema);
 *  - `registro`: rede fora ou o banco recusou o token.
 */
export type FalhaPush = 'permissao' | 'registro';

/** Carga útil que a Edge Function e o cron mandam em `data` do push. */
export interface PushPayload {
  kind?: string;
  beneficiary_id?: string;
  escalated?: boolean;
  /** Id do pedido (servidor de 19/10/2026 em diante). */
  help_request_id?: string;
}

export interface PushHandlers {
  /** Falha ao registrar o token (ou `null` quando registrou). O estado é da tela, não do console. */
  onRegisterError?: (falha: FalhaPush | null) => void;
  /**
   * O cuidador TOCOU na notificação (app fechado, em segundo plano ou aberto).
   * Quem trata abre o alerta: seleciona o paciente, recarrega e deixa o
   * AppProvider derivar `pendingAlert` do pedido aberto — o overlay aparece.
   */
  onOpen?: (payload: PushPayload) => void;
}

/** Canal dos socorros e pedidos de ajuda no Android (o push do servidor manda `channelId: 'emergencia'`). */
export const CANAL_EMERGENCIA = 'emergencia';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModuloDeNotificacoes = any;

/** Cria (ou mantém) os canais do Android. Idempotente: o sistema ignora o que o usuário já mudou. */
async function garantirCanais(Notifications: ModuloDeNotificacoes) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL_EMERGENCIA, {
    name: 'Emergência e pedidos de ajuda',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    lightColor: brand.blue,
    sound: 'default',
    // Pedido, não garantia: sem acesso à política de notificações o Android
    // descarta este valor. Quem liga de verdade é o cuidador, nas
    // configurações do canal — a tela de Alertas avisa e leva até lá
    // (`useCanalDeEmergencia`).
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Avisos da sessão',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Tempo máximo para obter o token na hora de sair: sem rede, a Expo não responde e a saída não pode esperar. */
const PRAZO_DO_TOKEN_MS = 4_000;

/**
 * O token Expo Push deste aparelho, obtido agora — ou `null` (Expo Go,
 * emulador, sem projeto, sem permissão, sem rede). Nunca rejeita. Usado ao
 * sair da conta: o token precisa sair do banco mesmo que o registro desta
 * execução tenha falhado (o de uma abertura anterior pode ter dado certo).
 */
export async function obterTokenDoAparelho(): Promise<string | null> {
  if (pushIndisponivel()) return null;
  const Notifications = getNotificationsModule();
  if (!Notifications) return null;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const token = await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }).then((r: { data: string }) => r.data),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), PRAZO_DO_TOKEN_MS);
      }),
    ]).finally(() => clearTimeout(timer));
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}

/** Espera antes da n-ésima nova tentativa de registro: 2 s, 4 s, 8 s… até 5 min. */
export function esperaDoRegistro(n: number): number {
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.max(1, n));
}

/** Registro bem-sucedido há menos que isto não é refeito ao voltar para a frente. */
export const REVALIDAR_REGISTRO_MS = 60 * 60_000;

/**
 * Registra o token Expo Push do cuidador. A Edge Function `desktop-sync` envia
 * notificações de alta prioridade quando o paciente pede ajuda ou socorro.
 * Não faz nada no Expo Go, em emulador ou em build sem projeto EAS.
 *
 * O registro não é de uma vez só: é refeito (idempotente) quando o app volta
 * para a frente — é assim que o cuidador volta dos ajustes do celular depois
 * de ativar as notificações, o caminho que a tela de Alertas indica —, depois
 * de uma falha com espera crescente, e quando o sistema troca o token.
 */
export function usePushNotifications(enabled: boolean, handlers: PushHandlers = {}) {
  const data = useData();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Toque na notificação → abre o alerta. Independente do registro do token:
  // vale também quando a permissão foi dada em outra execução.
  useEffect(() => {
    if (!enabled) return;
    const Notifications = getNotificationsModule();
    if (!Notifications) return;
    const abrir = (response: { notification?: { request?: { content?: { data?: unknown } } } } | null) => {
      const payload = (response?.notification?.request?.content?.data ?? {}) as PushPayload;
      handlersRef.current.onOpen?.(payload);
    };
    // App aberto pelo toque (partida a frio): a resposta fica guardada pelo SO.
    let vivo = true;
    Promise.resolve(Notifications.getLastNotificationResponseAsync?.())
      .then((r) => {
        if (vivo && r) abrir(r);
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(abrir);
    return () => {
      vivo = false;
      sub?.remove?.();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const motivo = pushIndisponivel();
    if (motivo === 'expo-go' || motivo === 'emulador') return;
    if (motivo === 'sem-projeto') {
      // Aviso para quem desenvolve; o cuidador vê só a frase simples em Alertas.
      console.warn(
        '[IrisFlow Cuidador] Push desativado: "extra.eas.projectId" está vazio em app.json. ' +
          'Rode `eas init` no projeto e preencha o id — sem ele os alertas não chegam com o app fechado.',
      );
      return;
    }
    const Notifications = getNotificationsModule();
    if (!Notifications) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string;

    let vivo = true;
    let emAndamento = false;
    let pediuPermissao = false;
    let falhas = 0;
    let registradoEm = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reportar = (falha: FalhaPush | null) => {
      if (vivo) handlersRef.current.onRegisterError?.(falha);
    };

    const registrar = async (devicePushToken?: unknown) => {
      if (!vivo || emAndamento) return;
      if (timer) clearTimeout(timer);
      timer = undefined;
      emAndamento = true;
      try {
        await garantirCanais(Notifications);
        const { status: existing } = await Notifications.getPermissionsAsync();
        let status = existing;
        // O pedido do sistema aparece uma vez por execução: repetir a cada volta
        // para a frente só gastaria as poucas vezes que o Android deixa pedir.
        if (existing !== 'granted' && !pediuPermissao) {
          pediuPermissao = true;
          status = (await Notifications.requestPermissionsAsync()).status;
        }
        if (status !== 'granted') {
          // Depende do cuidador (ajustes do celular): confere de novo quando ele voltar.
          reportar('permissao');
          return;
        }
        // Permissão concedida: o aviso "Notificações desligadas" sai já.
        reportar(null);
        // No ouvinte de troca de token, o token novo vem junto — pedir o do
        // aparelho de novo dispararia o ouvinte outra vez.
        const opcoes = devicePushToken ? { projectId, devicePushToken } : { projectId };
        const token = (await Notifications.getExpoPushTokenAsync(opcoes)).data;
        if (!vivo) return;
        await data.registerPushToken(token);
        falhas = 0;
        registradoEm = Date.now();
        reportar(null);
      } catch (err) {
        // Não derruba o app: sem push ele continua funcionando com a tela
        // aberta. O motivo técnico vai para o console; a tela recebe só o tipo.
        console.warn('[IrisFlow Cuidador] Registro de push não concluído:', err);
        reportar('registro');
        falhas += 1;
        if (vivo) timer = setTimeout(() => void registrar(), esperaDoRegistro(falhas));
      } finally {
        emAndamento = false;
      }
    };

    void registrar();
    const subApp = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return;
      // Voltou para a frente: pode ter ativado as notificações nos ajustes, a
      // rede pode ter voltado. Um registro recente e bem-sucedido não é refeito.
      if (registradoEm && Date.now() - registradoEm < REVALIDAR_REGISTRO_MS) return;
      falhas = 0;
      void registrar();
    });
    // O FCM/APNs trocou o token com o app aberto: o antigo deixa de valer.
    const subToken = Notifications.addPushTokenListener?.((novo: unknown) => {
      registradoEm = 0;
      void registrar(novo);
    });
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      subApp.remove();
      subToken?.remove?.();
    };
  }, [enabled, data]);
}

/**
 * Canal de emergência no Android: o socorro fura o "Não perturbe"?
 *
 * O app pede `bypassDnd` ao criar o canal, mas o Android só honra esse pedido
 * para apps com acesso à política de notificações — que o app não tem. Quem
 * liga é o cuidador, nas configurações do canal. Aqui se lê o estado real do
 * canal (ao abrir e sempre que o app volta para a frente, que é quando o
 * cuidador volta das configurações). `null` = não se aplica ou não deu para ler.
 */
export function useCanalDeEmergencia(): { furaNaoPerturbe: boolean | null; abrirAjustesDoCanal: () => Promise<void> } {
  const [furaNaoPerturbe, setFura] = useState<boolean | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'android' || pushIndisponivel()) return;
    const Notifications = getNotificationsModule();
    if (!Notifications?.getNotificationChannelAsync) return;
    let vivo = true;
    const ler = async () => {
      try {
        await garantirCanais(Notifications);
        const canal = await Notifications.getNotificationChannelAsync(CANAL_EMERGENCIA);
        if (vivo) setFura(canal ? Boolean(canal.bypassDnd) : null);
      } catch {
        if (vivo) setFura(null);
      }
    };
    void ler();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void ler();
    });
    return () => {
      vivo = false;
      sub.remove();
    };
  }, []);
  return { furaNaoPerturbe, abrirAjustesDoCanal };
}

/**
 * Abre as configurações do canal de emergência (onde fica "Substituir Não
 * perturbe"); se o aparelho não abrir essa tela, as configurações do app.
 */
export async function abrirAjustesDoCanal(): Promise<void> {
  const pacote = Constants.expoConfig?.android?.package;
  try {
    if (Platform.OS !== 'android' || !pacote) throw new Error('sem tela do canal');
    await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: pacote },
      { key: 'android.provider.extra.CHANNEL_ID', value: CANAL_EMERGENCIA },
    ]);
  } catch {
    await Linking.openSettings().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Alarme local: o som do pedido urgente que chegou com o app aberto
// ---------------------------------------------------------------------------
//
// O som do celular vinha só do push. Quando o pedido chega pelo realtime e o
// push não vem (FCM ainda não configurado, push recusado, conta sem token
// registrado), o alerta aparecia na tela em silêncio, só vibrando — e um
// cuidador com o celular na mesa, do outro lado do quarto, não percebia.
//
// Uma notificação LOCAL no canal de emergência toca o som do canal (e fura o
// "Não perturbe" se o cuidador tiver ligado isso no canal). Sem módulo nativo
// novo: vai por atualização OTA.
//
// Revisão de UX de 19/10/2026 (achado 11): o alarme tocava UMA vez por pedido
// — um toque curto, que não se repetia enquanto ninguém confirmava nem quando
// o servidor escalava. É justamente o caso em que ele é o único som do celular
// (push quebrado): quem não ouviu o primeiro toque não ouvia mais nada. Agora
// cada pedido urgente sem confirmação tem uma "série": toca, repete a cada
// `REPETIR_ALARME_MS` até a confirmação ou a resolução (por no máximo
// `TETO_DO_ALARME_MS`) e recomeça quando o servidor escala. Quem decide quais
// pedidos tocam é o AppProvider (`sincronizarAlarmesLocais`).

/** Entre um toque e outro do alarme local, enquanto ninguém confirma o pedido. */
export const REPETIR_ALARME_MS = 25_000;

/**
 * Por quanto tempo, no máximo, o alarme repete sozinho, contado do último
 * disparo: a chegada do pedido a este celular, ou o escalonamento do servidor
 * (que recomeça a contagem). Depois disso o alerta continua na tela e na
 * lista, mas o celular para de tocar — um pedido atendido pessoalmente, sem
 * ninguém tocar no app, não pode tocar a noite inteira.
 */
export const TETO_DO_ALARME_MS = 10 * 60_000;

/** Identificador das notificações do alarme: `<prefixo><pedido>:<início da série>:<n>`. */
const PREFIXO_DO_ALARME = 'irisflow-alarme:';

/** O que o alarme precisa saber de um pedido urgente (socorro ou ajuda) ainda sem confirmação. */
export interface PedidoDoAlarme {
  id: string;
  titulo: string;
  corpo: string;
  /** `escalated_at` do pedido: quando o servidor escala, o alarme toca de novo na hora e a série recomeça. */
  escalado?: string | null;
  /** Paciente do pedido: tocar na notificação abre o paciente certo. */
  beneficiaryId?: string;
}

interface SerieDoAlarme {
  pedido: PedidoDoAlarme;
  /** O módulo de notificações (pego uma vez: cada `getNotificationsModule()` refaz o handler). */
  N: ModuloDeNotificacoes;
  /** O `escalado` com que a série começou: outro valor recomeça a série. */
  fase: string;
  /** Início da série (Date.now()): o teto conta daqui. */
  inicio: number;
  /** Quando cai o próximo toque. */
  proximo: number;
  /** Contador dos toques (parte do identificador de cada notificação). */
  n: number;
  /** A notificação deste pedido que está na bandeja: sai quando a seguinte entra. */
  naBandeja: string | null;
  /** Próximo toque com o app na frente. */
  timer: ReturnType<typeof setTimeout> | null;
  /** Toques entregues ao agendador do sistema enquanto o app está em segundo plano. */
  noSistema: string[];
  /** Entrega ao sistema em andamento (quem cancela espera ela terminar). */
  entregando: Promise<void> | null;
  /** Falsa quando a série para: um passo assíncrono em andamento não toca mais. */
  ativa: boolean;
  /** Uma falha vai para o console uma vez por série, não a cada toque. */
  avisou: boolean;
}

/** Séries em andamento, por pedido. */
const series = new Map<string, SerieDoAlarme>();
/** O estado do app visto pelo alarme ('active', 'background'…); null = ainda não acompanhado. */
let estadoDoApp: string | null = null;
let ouvinteDoApp: { remove: () => void } | null = null;

const prefixoDoPedido = (id: string) => `${PREFIXO_DO_ALARME}${id}:`;
const prefixoDaSerie = (s: SerieDoAlarme) => `${prefixoDoPedido(s.pedido.id)}${s.inicio}:`;
const fimDaSerie = (s: SerieDoAlarme) => s.inicio + TETO_DO_ALARME_MS;

function avisar(s: SerieDoAlarme, e: unknown) {
  if (s.avisou) return;
  s.avisou = true;
  console.warn('[IrisFlow Cuidador] alarme local não tocou', e);
}

const cancelar = (N: ModuloDeNotificacoes, id: string) => Promise.resolve(N.cancelScheduledNotificationAsync?.(id)).catch(() => undefined);
const dispensar = (N: ModuloDeNotificacoes, id: string) => Promise.resolve(N.dismissNotificationAsync?.(id)).catch(() => undefined);
/** Tira do sistema um toque: o agendamento (se ainda não tocou) e a notificação da bandeja (se já). */
const apagar = (N: ModuloDeNotificacoes, ids: string[]) => Promise.all(ids.map((id) => Promise.all([cancelar(N, id), dispensar(N, id)]))).then(() => undefined);

function lerEstadoDoApp(): string {
  // No teste (mock do RN) `currentState` nem é texto: vale como na frente.
  const atual = (AppState as unknown as { currentState?: unknown }).currentState;
  return typeof atual === 'string' ? atual : 'active';
}

/** Com o app em segundo plano os timers do JS param (no Android, até ele voltar): o toque precisa ir para o sistema. */
const appNaFrente = () => (estadoDoApp ?? lerEstadoDoApp()) !== 'background';

function acompanharEstadoDoApp(): void {
  if (ouvinteDoApp) return;
  estadoDoApp = lerEstadoDoApp();
  ouvinteDoApp = AppState.addEventListener('change', (estado) => {
    const estava = estadoDoApp;
    estadoDoApp = estado;
    if (estava !== 'background' && estado === 'background') irParaSegundoPlano();
    else if (estava === 'background' && estado !== 'background') void voltarParaAFrente();
  });
}

function conteudoDoAlarme(N: ModuloDeNotificacoes, p: PedidoDoAlarme) {
  return {
    title: p.titulo,
    body: p.corpo,
    sound: 'default',
    priority: N.AndroidNotificationPriority?.MAX ?? 'max',
    data: { help_request_id: p.id, ...(p.beneficiaryId ? { beneficiary_id: p.beneficiaryId } : {}), local: true },
  };
}

/**
 * O push do SERVIDOR deste pedido já está na bandeja, ou foi ele que abriu o
 * app? Então o primeiro toque da série seria um segundo som no mesmo instante
 * (o servidor manda `help_request_id` desde 19/10/2026). As repetições tocam
 * de qualquer jeito. No escalonamento só conta o push do escalonamento.
 */
async function pushJaAvisou(N: ModuloDeNotificacoes, id: string, escalado: boolean): Promise<boolean> {
  type Aviso = { request?: { content?: { data?: { help_request_id?: string; escalated?: boolean; local?: boolean } } } } | null | undefined;
  const doServidor = (n: Aviso) => {
    const d = n?.request?.content?.data;
    return Boolean(d && !d.local && d.help_request_id === id && (!escalado || d.escalated === true));
  };
  const presentes: Aviso[] = (await N.getPresentedNotificationsAsync?.()) ?? [];
  if (presentes.some(doServidor)) return true;
  const ultima = await N.getLastNotificationResponseAsync?.();
  return doServidor(ultima?.notification);
}

/** Um toque agora: a notificação nova entra e a anterior deste pedido sai da bandeja. */
async function tocar(s: SerieDoAlarme): Promise<boolean> {
  const anterior = s.naBandeja;
  s.n += 1;
  const identifier = `${prefixoDaSerie(s)}${s.n}`;
  s.naBandeja = identifier;
  if (anterior) await dispensar(s.N, anterior);
  if (!s.ativa) return false;
  await s.N.scheduleNotificationAsync({
    identifier,
    content: conteudoDoAlarme(s.N, s.pedido),
    trigger: Platform.OS === 'android' ? { channelId: CANAL_EMERGENCIA } : null,
  });
  // Confirmado (ou resolvido) enquanto o sistema agendava: sai da bandeja já.
  if (!s.ativa) {
    await dispensar(s.N, identifier);
    return false;
  }
  return true;
}

/** Marca o próximo toque: pelo timer, com o app na frente; pelo sistema, em segundo plano. */
function seguir(s: SerieDoAlarme): void {
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  if (!s.ativa) return;
  s.proximo = Date.now() + REPETIR_ALARME_MS;
  if (s.proximo > fimDaSerie(s)) return; // teto: o alerta segue na tela, o celular para de tocar sozinho
  if (!appNaFrente()) {
    entregar(s);
    return;
  }
  s.timer = setTimeout(() => void repetir(s), REPETIR_ALARME_MS);
}

async function repetir(s: SerieDoAlarme): Promise<void> {
  s.timer = null;
  if (!s.ativa) return;
  try {
    await tocar(s);
  } catch (e) {
    avisar(s, e);
  }
  seguir(s);
}

/**
 * App em segundo plano: os toques que faltam até o teto vão para o agendador
 * do sistema, que toca mesmo com a tela apagada. Voltando para a frente, saem
 * de lá e o timer retoma (`voltarParaAFrente`). No Android sem "alarme exato"
 * o sistema pode atrasar e juntar esses toques — é o melhor que dá sem módulo
 * nativo novo.
 */
function entregar(s: SerieDoAlarme): void {
  if (s.entregando || s.noSistema.length > 0) return;
  const p: Promise<void> = entregarAoSistema(s).finally(() => {
    if (s.entregando === p) s.entregando = null;
  });
  s.entregando = p;
}

async function entregarAoSistema(s: SerieDoAlarme): Promise<void> {
  if (!s.ativa) return;
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  const agora = Date.now();
  const tipo = s.N.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? 'timeInterval';
  const conteudo = conteudoDoAlarme(s.N, s.pedido);
  const pedidos: Promise<unknown>[] = [];
  for (let quando = Math.max(s.proximo, agora + 1_000); quando <= fimDaSerie(s); quando += REPETIR_ALARME_MS) {
    s.n += 1;
    const identifier = `${prefixoDaSerie(s)}${s.n}`;
    s.noSistema.push(identifier);
    const seconds = Math.max(1, Math.round((quando - agora) / 1000));
    pedidos.push(
      s.N.scheduleNotificationAsync({
        identifier,
        content: conteudo,
        trigger: { type: tipo, seconds, ...(Platform.OS === 'android' ? { channelId: CANAL_EMERGENCIA } : {}) },
      }),
    );
  }
  const falha = (await Promise.allSettled(pedidos)).find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (falha) avisar(s, falha.reason);
}

function irParaSegundoPlano(): void {
  for (const s of series.values()) {
    // Sem timer pendente: ou esgotou o teto, ou está no meio de um toque — e
    // aí `seguir` já manda o próximo para o sistema.
    if (!s.ativa || !s.timer) continue;
    clearTimeout(s.timer);
    s.timer = null;
    entregar(s);
  }
}

async function voltarParaAFrente(): Promise<void> {
  await Promise.all(
    [...series.values()].map(async (s) => {
      if (s.entregando) await s.entregando;
      // Os toques que ficaram com o sistema (e os que já tocaram, na bandeja) saem: o alerta está na tela.
      await apagar(s.N, s.noSistema.splice(0));
      seguir(s);
    }),
  );
}

async function pararSerie(s: SerieDoAlarme): Promise<void> {
  s.ativa = false;
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  if (series.get(s.pedido.id) === s) series.delete(s.pedido.id);
  if (s.entregando) await s.entregando;
  const ids = s.noSistema.splice(0);
  if (s.naBandeja) ids.push(s.naBandeja);
  s.naBandeja = null;
  await apagar(s.N, ids);
}

/**
 * Tira do sistema o que o alarme deixou e não é de uma série ativa: toques
 * agendados por uma execução anterior (o app foi fechado no meio de uma
 * série) e notificações de pedidos que já não tocam. Sem isto, um socorro
 * confirmado com o app fechado seguia tocando pelos agendamentos antigos.
 */
async function apagarRestos(N: ModuloDeNotificacoes): Promise<void> {
  const [agendadas, mostradas] = await Promise.all([
    Promise.resolve(N.getAllScheduledNotificationsAsync?.()).catch(() => []),
    Promise.resolve(N.getPresentedNotificationsAsync?.()).catch(() => []),
  ]);
  const ativas = [...series.values()].filter((s) => s.ativa).map(prefixoDaSerie);
  const resto = (id: unknown): id is string => typeof id === 'string' && id.startsWith(PREFIXO_DO_ALARME) && !ativas.some((p) => id.startsWith(p));
  const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
  const daAgenda = lista(agendadas).map((r) => (r as { identifier?: unknown } | null)?.identifier).filter(resto);
  const daBandeja = lista(mostradas).map((n) => (n as { request?: { identifier?: unknown } } | null)?.request?.identifier).filter(resto);
  await Promise.all([...daAgenda.map((id) => cancelar(N, id)), ...daBandeja.map((id) => dispensar(N, id))]);
}

/**
 * Começa a série do alarme deste pedido — ou a recomeça, se o servidor o
 * escalou depois que ela começou. Toca na hora (a não ser que o push deste
 * pedido já esteja na bandeja ou tenha aberto o app), e repete. O mesmo
 * pedido na mesma fase não toca outra vez. Devolve se tocou agora. Nunca lança.
 */
export async function tocarAlarmeLocal(pedido: PedidoDoAlarme): Promise<boolean> {
  const fase = pedido.escalado ?? '';
  const atual = series.get(pedido.id);
  if (atual && atual.fase === fase) {
    atual.pedido = pedido; // título e texto novos valem para os próximos toques
    return false;
  }
  if (isExpoGo()) return false;
  const N = getNotificationsModule();
  if (!N) return false;
  const s: SerieDoAlarme = { pedido, N, fase, inicio: Date.now(), proximo: 0, n: 0, naBandeja: null, timer: null, noSistema: [], entregando: null, ativa: true, avisou: false };
  series.set(pedido.id, s);
  acompanharEstadoDoApp();
  // Escalonamento: a série anterior para (e sai da bandeja); esta recomeça a contagem.
  if (atual) await pararSerie(atual);
  try {
    const { status } = await N.getPermissionsAsync();
    if (!s.ativa) return false;
    if (status !== 'granted') {
      // Sem permissão o sistema não toca nada; a aba Alertas já avisa o cuidador.
      await pararSerie(s);
      return false;
    }
    const avisado = await pushJaAvisou(N, pedido.id, Boolean(pedido.escalado));
    if (!s.ativa) return false;
    await garantirCanais(N);
    const tocou = avisado ? false : await tocar(s);
    seguir(s);
    return tocou;
  } catch (e) {
    avisar(s, e);
    seguir(s);
    return false;
  }
}

/**
 * Deixa o alarme local igual à lista de pedidos que devem tocar — quem monta a
 * lista é o AppProvider (`pedidosQueTocam`): socorro e ajuda abertos, sem
 * confirmação, dentro da janela do alerta. Pedido que saiu da lista
 * (confirmado aqui ou em outro celular, resolvido, ou a conta saiu) para de
 * tocar e sai da bandeja; pedido novo começa a tocar; pedido que o servidor
 * escalou toca de novo na hora. Nunca lança.
 */
export async function sincronizarAlarmesLocais(pedidos: PedidoDoAlarme[]): Promise<void> {
  try {
    const ids = new Set(pedidos.map((p) => p.id));
    const paradas = [...series.values()].filter((s) => !ids.has(s.pedido.id)).map((s) => pararSerie(s));
    await Promise.all([...paradas, ...pedidos.map((p) => tocarAlarmeLocal(p))]);
    const N = isExpoGo() ? null : getNotificationsModule();
    if (N) await apagarRestos(N);
  } catch (e) {
    console.warn('[IrisFlow Cuidador] alarme local não atualizou', e);
  }
}

/** Só para testes: para tudo (sem tocar no sistema) e esquece o estado do módulo. */
export function _esquecerAlarmesLocais(): void {
  for (const s of series.values()) {
    s.ativa = false;
    if (s.timer) clearTimeout(s.timer);
  }
  series.clear();
  ouvinteDoApp?.remove();
  ouvinteDoApp = null;
  estadoDoApp = null;
}

