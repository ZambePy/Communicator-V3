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
