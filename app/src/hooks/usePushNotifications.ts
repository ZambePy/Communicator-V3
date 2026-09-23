import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
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

/**
 * Registra o token Expo Push do cuidador. A Edge Function `desktop-sync` envia
 * notificações de alta prioridade quando o paciente pede ajuda ou socorro.
 * Não faz nada no Expo Go, em emulador ou em build sem projeto EAS.
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
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string;

    let isMounted = true;

    (async () => {
      try {
        const Notifications = getNotificationsModule();
        if (!Notifications) return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('emergencia', {
            name: 'Emergência e pedidos de ajuda',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 400, 200, 400, 200, 400],
            lightColor: brand.blue,
            sound: 'default',
            bypassDnd: true,
          });
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Avisos da sessão',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const { status: existing } = await Notifications.getPermissionsAsync();
        let status = existing;
        if (existing !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') {
          if (isMounted) handlersRef.current.onRegisterError?.('permissao');
          return;
        }

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (isMounted) {
          await data.registerPushToken(token);
          handlersRef.current.onRegisterError?.(null);
        }
      } catch (err) {
        // Não derruba o app: sem push ele continua funcionando com a tela
        // aberta. O motivo técnico vai para o console; a tela recebe só o tipo.
        console.warn('[IrisFlow Cuidador] Registro de push não concluído:', err);
        if (isMounted) handlersRef.current.onRegisterError?.('registro');
      }
    })().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [enabled, data]);
}
