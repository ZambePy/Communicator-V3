import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useData } from '@/data/DataContext';
import { brand } from '@/theme';

function isExpoGoClient(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  );
}

function getNotificationsModule() {
  if (Platform.OS === 'android' && isExpoGoClient()) return null;
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
 * Registra o token Expo Push do cuidador. A Edge Function `desktop-sync` envia
 * notificações de alta prioridade quando o paciente pede ajuda ou socorro.
 * 
 * No Expo Go no Android (SDK 53+), notificações push remotas foram removidas pela equipe do Expo.
 * O app funciona em modo seguro sem quebrar, e em builds standalone/desenvolvimento
 * o push funciona normalmente.
 *
 * Requisito: `extra.eas.projectId` preenchido em app.json (`eas init`). Sem ele o registro
 * nem é tentado. O console recebe o aviso; quem precisa dizer isso ao usuário é a tela,
 * usando `pushIndisponivel()` abaixo.
 */
/**
 * Por que o push NÃO vai funcionar neste build, em uma frase — ou `null` se
 * ele estiver de pé.
 *
 * Existe porque o app promete, no onboarding e na tela de alertas, avisar o
 * cuidador no celular. Quando essa promessa não se sustenta, o lugar de dizer
 * isso é a tela: um `console.warn` não é visto por quem depende do alerta.
 *
 * As três causas cobertas são exatamente as que fazem o registro de token ser
 * abandonado em `usePushNotifications`, e o motivo é sempre de configuração ou
 * de ambiente — nunca um erro em tempo de execução.
 */
export function pushIndisponivel(): string | null {
  if (Platform.OS === 'android' && isExpoGoClient()) {
    return 'aberto pelo Expo Go no Android, onde o Expo removeu o push remoto a partir do SDK 53';
  }
  if (!Device.isDevice) {
    return 'rodando em emulador ou simulador, que não recebe notificação push';
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    return 'este build não tem projeto EAS configurado (o campo extra.eas.projectId em app.json está vazio) e sem ele não existe token de push';
  }
  return null;
}

export function usePushNotifications(enabled: boolean) {
  const data = useData();

  useEffect(() => {
    // No Expo Go no Android, notificações push remotas foram descontinuadas pelo Expo.
    if (Platform.OS === 'android' && isExpoGoClient()) {
      return;
    }

    if (!enabled || data.kind === 'mock' || !Device.isDevice) return;

    // Sem projeto EAS não existe token de push: `getExpoPushTokenAsync` falha em build
    // standalone. Não inventamos um id — avisamos e seguimos sem push.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      console.warn(
        '[IrisFlow Cuidador] Push desativado: "extra.eas.projectId" está vazio em app.json. ' +
          'Rode `eas init` no projeto e preencha o id — sem ele os alertas de emergência não chegam ao celular.',
      );
      return;
    }

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
        if (status !== 'granted') return;

        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (isMounted) {
          await data.registerPushToken(token);
        }
      } catch (err) {
        // Não derruba o app: sem push ele continua funcionando com a tela
        // aberta. Mas registrar o motivo, em vez de engolir: as causas que a
        // tela sabe explicar sozinha estão em `pushIndisponivel()`; o que cai
        // aqui é o resto (permissão negada, rede fora ao pedir o token).
        console.warn('[IrisFlow Cuidador] Registro de push não concluído:', err);
      }
    })().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [enabled, data]);
}
