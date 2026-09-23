/**
 * Push no app do cuidador.
 *
 * `pushIndisponivel()` decide se a tela de Alertas precisa avisar alguma coisa:
 * Expo Go e emulador são ambientes de desenvolvimento (nada na tela); build sem
 * projeto EAS é o único caso em que o cuidador precisa saber que os alertas só
 * chegam com o app aberto. Cada causa é testada isolada das outras.
 *
 * `usePushNotifications` no Expo Go não pode nem carregar `expo-notifications`
 * (no Android isso já registra erro desde o SDK 53): nada de token, nada de erro.
 */
import { Platform } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { isExpoGo, pushIndisponivel, usePushNotifications } from './usePushNotifications';

// Objetos simples e mutáveis: cada teste ajusta só o campo que quer testar e
// devolve o cenário base no `beforeEach`. O hook lê os valores na hora da
// chamada, não na importação.
jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
  default: {
    appOwnership: null,
    executionEnvironment: 'standalone',
    expoConfig: { extra: { eas: { projectId: '' } } },
  },
}));
jest.mock('expo-device', () => ({ isDevice: true }));

// `expo-notifications` falso e observável: o teste do Expo Go confere que ele
// nem é tocado; os outros, o caminho do registro.
const mockNotifications = {
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[teste]' })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 5, DEFAULT: 3 },
};
jest.mock('expo-notifications', () => mockNotifications);

// O hook importa `useData`, que puxaria o cliente Supabase. Aqui basta o
// método que ele chama.
const mockRegisterPushToken = jest.fn(async (_token: string) => undefined);
jest.mock('@/data/DataContext', () => ({ useData: () => ({ registerPushToken: mockRegisterPushToken }) }));

type MutableConstants = {
  appOwnership: string | null;
  executionEnvironment: string;
  expoConfig: { extra: { eas: { projectId: string } } };
};
const constants = Constants as unknown as MutableConstants;
const device = Device as unknown as { isDevice: boolean };
const PROJETO = 'a1b2c3d4-0000-4000-8000-000000000000';
const osOriginal = Platform.OS;

beforeEach(() => {
  Platform.OS = 'ios';
  constants.appOwnership = null;
  constants.executionEnvironment = 'standalone';
  constants.expoConfig.extra.eas.projectId = '';
  device.isDevice = true;
  jest.clearAllMocks();
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore?.();
});

afterAll(() => {
  Platform.OS = osOriginal;
});

describe('pushIndisponivel', () => {
  it('aponta o projeto EAS ausente quando é a única coisa faltando (aparelho real, build do projeto)', () => {
    expect(pushIndisponivel()).toBe('sem-projeto');
  });

  it('devolve null quando o projectId está preenchido e o ambiente é válido', () => {
    constants.expoConfig.extra.eas.projectId = PROJETO;
    expect(pushIndisponivel()).toBeNull();
  });

  it('reconhece o Expo Go pelo appOwnership, mesmo com projectId preenchido', () => {
    Platform.OS = 'android';
    constants.appOwnership = 'expo';
    constants.expoConfig.extra.eas.projectId = PROJETO;
    expect(isExpoGo()).toBe(true);
    expect(pushIndisponivel()).toBe('expo-go');
  });

  it('reconhece o Expo Go também pelo executionEnvironment (StoreClient)', () => {
    Platform.OS = 'android';
    constants.executionEnvironment = 'storeClient';
    expect(pushIndisponivel()).toBe('expo-go');
  });

  it('aponta o emulador antes do projectId', () => {
    device.isDevice = false;
    expect(pushIndisponivel()).toBe('emulador');
  });
});

describe('usePushNotifications', () => {
  it('no Expo Go (Android) não carrega expo-notifications, não registra token e não acusa erro', async () => {
    Platform.OS = 'android';
    constants.executionEnvironment = 'storeClient';
    constants.expoConfig.extra.eas.projectId = PROJETO;
    const onRegisterError = jest.fn();

    await renderHook(() => usePushNotifications(true, { onRegisterError }));
    await new Promise((r) => setTimeout(r, 0));

    expect(mockNotifications.setNotificationHandler).not.toHaveBeenCalled();
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockNotifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    expect(onRegisterError).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('em build do projeto, registra o token no servidor e limpa o erro', async () => {
    constants.expoConfig.extra.eas.projectId = PROJETO;
    const onRegisterError = jest.fn();

    await renderHook(() => usePushNotifications(true, { onRegisterError }));

    await waitFor(() => expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[teste]'));
    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: PROJETO });
    await waitFor(() => expect(onRegisterError).toHaveBeenLastCalledWith(null));
  });

  it('permissão negada vira "permissao" (a tela oferece abrir os ajustes do celular)', async () => {
    constants.expoConfig.extra.eas.projectId = PROJETO;
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const onRegisterError = jest.fn();

    await renderHook(() => usePushNotifications(true, { onRegisterError }));

    await waitFor(() => expect(onRegisterError).toHaveBeenCalledWith('permissao'));
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('falha no servidor vira "registro", sem texto técnico para a tela', async () => {
    constants.expoConfig.extra.eas.projectId = PROJETO;
    mockRegisterPushToken.mockRejectedValueOnce(new Error('new row violates row-level security policy'));
    const onRegisterError = jest.fn();

    await renderHook(() => usePushNotifications(true, { onRegisterError }));

    await waitFor(() => expect(onRegisterError).toHaveBeenCalledWith('registro'));
  });

  it('sem login não faz nada', async () => {
    constants.expoConfig.extra.eas.projectId = PROJETO;
    await renderHook(() => usePushNotifications(false));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
  });
});
