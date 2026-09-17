/**
 * `pushIndisponivel()` é o que a tela de Alertas e o onboarding mostram quando o
 * push não vai funcionar. O motivo tem de ser o certo: dizer "emulador" a quem
 * está num aparelho real com `projectId` vazio manda a pessoa investigar a coisa
 * errada. Por isso cada causa é testada isolada das outras.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { pushIndisponivel } from './usePushNotifications';

// Objetos simples e mutáveis: cada teste ajusta só o campo que quer testar e
// devolve o cenário base no `beforeEach`. Sem `jest.isolateModules` nem
// re-import — o hook lê os valores na hora da chamada, não na importação.
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

// O hook importa `useData`, que puxa o cliente Supabase (SecureStore, polyfills).
// Nada disso importa para `pushIndisponivel`, que é uma função pura de configuração.
jest.mock('@/data/DataContext', () => ({ useData: () => ({ kind: 'mock' }) }));

type MutableConstants = {
  appOwnership: string | null;
  executionEnvironment: string;
  expoConfig: { extra: { eas: { projectId: string } } };
};
const constants = Constants as unknown as MutableConstants;
const device = Device as unknown as { isDevice: boolean };

describe('pushIndisponivel', () => {
  const osOriginal = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'ios';
    constants.appOwnership = null;
    constants.executionEnvironment = 'standalone';
    constants.expoConfig.extra.eas.projectId = '';
    device.isDevice = true;
  });

  afterAll(() => {
    Platform.OS = osOriginal;
  });

  it('aponta o projectId vazio quando é a única coisa faltando (aparelho real, build standalone)', () => {
    const motivo = pushIndisponivel();
    expect(motivo).not.toBeNull();
    expect(motivo).toMatch(/extra\.eas\.projectId/);
    // Não pode culpar o emulador nem o Expo Go: as duas condições estão satisfeitas aqui.
    expect(motivo).not.toMatch(/emulador|Expo Go/);
  });

  it('devolve null quando o projectId está preenchido e o ambiente é válido', () => {
    constants.expoConfig.extra.eas.projectId = 'a1b2c3d4-0000-4000-8000-000000000000';
    expect(pushIndisponivel()).toBeNull();
  });

  it('prioriza o Expo Go no Android, mesmo com projectId preenchido', () => {
    Platform.OS = 'android';
    constants.appOwnership = 'expo';
    constants.expoConfig.extra.eas.projectId = 'a1b2c3d4-0000-4000-8000-000000000000';
    expect(pushIndisponivel()).toMatch(/Expo Go no Android/);
  });

  it('reconhece o Expo Go também pelo executionEnvironment (StoreClient)', () => {
    Platform.OS = 'android';
    constants.executionEnvironment = 'storeClient';
    expect(pushIndisponivel()).toMatch(/Expo Go no Android/);
  });

  it('não culpa o Expo Go no iOS: lá o push remoto ainda existe', () => {
    Platform.OS = 'ios';
    constants.appOwnership = 'expo';
    constants.expoConfig.extra.eas.projectId = 'a1b2c3d4-0000-4000-8000-000000000000';
    expect(pushIndisponivel()).toBeNull();
  });

  it('aponta o emulador antes do projectId', () => {
    device.isDevice = false;
    expect(pushIndisponivel()).toMatch(/emulador ou simulador/);
  });
});
