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
import { AppState, Platform } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  _esquecerAlarmesLocais,
  esperaDoRegistro,
  isExpoGo,
  obterTokenDoAparelho,
  pushIndisponivel,
  REPETIR_ALARME_MS,
  sincronizarAlarmesLocais,
  TETO_DO_ALARME_MS,
  tocarAlarmeLocal,
  usePushNotifications,
} from './usePushNotifications';

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
  addPushTokenListener: jest.fn((_cb: (t: unknown) => void) => ({ remove: jest.fn() })),
  getPresentedNotificationsAsync: jest.fn(async (): Promise<unknown[]> => []),
  scheduleNotificationAsync: jest.fn(async (_c: unknown) => 'id-local'),
  dismissNotificationAsync: jest.fn(async (_id: string) => undefined),
  cancelScheduledNotificationAsync: jest.fn(async (_id: string) => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async (): Promise<unknown[]> => []),
  AndroidImportance: { MAX: 5, DEFAULT: 3 },
  AndroidNotificationPriority: { MAX: 'max' },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
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
  mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[teste]' });
  mockRegisterPushToken.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** O app volta para a frente (o cuidador voltou dos ajustes do celular, desbloqueou a tela). */
async function voltarParaAFrente() {
  const ouvintes = (AppState.addEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'change').map((c) => c[1] as (e: string) => void);
  await act(async () => {
    ouvintes.forEach((f) => f('active'));
    await Promise.resolve();
  });
}

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

  // APP-4: o registro era feito uma vez por execução. Quem negava a permissão e
  // depois a ativava nos ajustes do celular (o caminho que o app indica) ficava
  // sem push — e com o aviso "Notificações desligadas" — até reabrir o app.
  describe('registro que se refaz', () => {
    it('permissão ativada nos ajustes: ao voltar para o app, registra e o aviso some', async () => {
      constants.expoConfig.extra.eas.projectId = PROJETO;
      mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
      mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
      const onRegisterError = jest.fn();

      await renderHook(() => usePushNotifications(true, { onRegisterError }));
      await waitFor(() => expect(onRegisterError).toHaveBeenCalledWith('permissao'));

      mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
      await voltarParaAFrente();

      await waitFor(() => expect(mockRegisterPushToken).toHaveBeenCalledWith('ExponentPushToken[teste]'));
      expect(onRegisterError).toHaveBeenLastCalledWith(null);
      // O pedido do sistema aparece uma vez só por execução.
      expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('falha de rede no registro: tenta de novo sozinho, com espera crescente', async () => {
      jest.useFakeTimers();
      try {
        constants.expoConfig.extra.eas.projectId = PROJETO;
        mockRegisterPushToken.mockRejectedValueOnce(new Error('Network request failed'));
        const onRegisterError = jest.fn();

        await renderHook(() => usePushNotifications(true, { onRegisterError }));
        await act(async () => {
          await jest.advanceTimersByTimeAsync(0);
        });
        expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
        expect(onRegisterError).toHaveBeenLastCalledWith('registro');

        await act(async () => {
          await jest.advanceTimersByTimeAsync(esperaDoRegistro(1));
        });
        expect(mockRegisterPushToken).toHaveBeenCalledTimes(2);
        expect(onRegisterError).toHaveBeenLastCalledWith(null);
      } finally {
        jest.useRealTimers();
      }
    });

    it('registro recente e bem-sucedido não é refeito a cada volta para a frente', async () => {
      constants.expoConfig.extra.eas.projectId = PROJETO;
      await renderHook(() => usePushNotifications(true));
      await waitFor(() => expect(mockRegisterPushToken).toHaveBeenCalledTimes(1));
      await voltarParaAFrente();
      expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
    });

    it('o sistema trocou o token com o app aberto: o novo é registrado', async () => {
      constants.expoConfig.extra.eas.projectId = PROJETO;
      await renderHook(() => usePushNotifications(true));
      await waitFor(() => expect(mockRegisterPushToken).toHaveBeenCalledTimes(1));

      const ouvinte = mockNotifications.addPushTokenListener.mock.calls[0][0];
      mockNotifications.getExpoPushTokenAsync.mockResolvedValueOnce({ data: 'ExponentPushToken[novo]' });
      await act(async () => {
        ouvinte({ type: 'fcm', data: 'fcm-novo' });
        await Promise.resolve();
      });

      await waitFor(() => expect(mockRegisterPushToken).toHaveBeenLastCalledWith('ExponentPushToken[novo]'));
      expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith({ projectId: PROJETO, devicePushToken: { type: 'fcm', data: 'fcm-novo' } });
    });
  });

  describe('obterTokenDoAparelho (ao sair da conta)', () => {
    it('com permissão: o token de agora; sem permissão ou sem projeto: null', async () => {
      constants.expoConfig.extra.eas.projectId = PROJETO;
      await expect(obterTokenDoAparelho()).resolves.toBe('ExponentPushToken[teste]');
      mockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
      await expect(obterTokenDoAparelho()).resolves.toBeNull();
      constants.expoConfig.extra.eas.projectId = '';
      await expect(obterTokenDoAparelho()).resolves.toBeNull();
    });

    it('sem rede a Expo não responde: desiste no prazo, sem prender a saída', async () => {
      jest.useFakeTimers();
      try {
        constants.expoConfig.extra.eas.projectId = PROJETO;
        mockNotifications.getExpoPushTokenAsync.mockReturnValueOnce(new Promise(() => undefined));
        const token = obterTokenDoAparelho();
        await jest.advanceTimersByTimeAsync(4_000);
        await expect(token).resolves.toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe('tocarAlarmeLocal (pedido que chegou com o app aberto)', () => {
  beforeEach(() => {
    _esquecerAlarmesLocais();
    mockNotifications.getPresentedNotificationsAsync.mockResolvedValue([]);
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(null);
  });
  // A série de repetição deixa um timer pendente: cada teste começa do zero.
  afterEach(() => _esquecerAlarmesLocais());

  it('agenda UMA notificação local no canal de emergência (o som do canal toca)', async () => {
    Platform.OS = 'android';
    expect(await tocarAlarmeLocal({ id: 'hr-1', titulo: 'Socorro — Ana', corpo: 'DOR' })).toBe(true);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = mockNotifications.scheduleNotificationAsync.mock.calls[0][0] as { content: { sound: string; data: { help_request_id: string } }; trigger: { channelId: string } };
    expect(arg.trigger).toEqual({ channelId: 'emergencia' });
    expect(arg.content.sound).toBe('default');
    expect(arg.content.data.help_request_id).toBe('hr-1');
    // O mesmo pedido não toca de novo (re-render, minimizar e reabrir).
    expect(await tocarAlarmeLocal({ id: 'hr-1', titulo: 'x', corpo: 'y' })).toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('não duplica o push que já está na bandeja, nem o que abriu o app', async () => {
    mockNotifications.getPresentedNotificationsAsync.mockResolvedValue([{ request: { content: { data: { help_request_id: 'hr-2' } } } }]);
    expect(await tocarAlarmeLocal({ id: 'hr-2', titulo: 'x', corpo: 'y' })).toBe(false);
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue({ notification: { request: { content: { data: { help_request_id: 'hr-3' } } } } } as never);
    expect(await tocarAlarmeLocal({ id: 'hr-3', titulo: 'x', corpo: 'y' })).toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('sem permissão de notificação, não tenta (e não lança)', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    expect(await tocarAlarmeLocal({ id: 'hr-4', titulo: 'x', corpo: 'y' })).toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('erro do sistema ao agendar vira aviso no console, nunca exceção', async () => {
    mockNotifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error('canal ausente'));
    await expect(tocarAlarmeLocal({ id: 'hr-5', titulo: 'x', corpo: 'y' })).resolves.toBe(false);
  });
});

// Revisão de UX de 19/10/2026 (achado 11): o alarme local tocava uma vez só
// por pedido — um toque curto, sem repetir enquanto ninguém confirmava nem
// quando o servidor escalava. Justamente quando ele é o único som (push quebrado).
describe('alarme local que repete até alguém confirmar (achado 11)', () => {
  const socorro = { id: 'hr-1', titulo: 'Pedido de socorro — Ana', corpo: 'Falta de ar', beneficiaryId: 'b1' };
  const agendar = mockNotifications.scheduleNotificationAsync;
  type Agendamento = { identifier: string; content: { sound: string; data: { help_request_id: string } }; trigger: Record<string, unknown> | null };
  const agendamento = (i: number) => agendar.mock.calls[i][0] as Agendamento;
  const ouvinteDoApp = () => {
    const chamadas = (AppState.addEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'change');
    return chamadas[chamadas.length - 1][1] as (estado: string) => void;
  };
  const andar = (ms: number) => jest.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    jest.useFakeTimers();
    _esquecerAlarmesLocais();
    Platform.OS = 'android';
    mockNotifications.getPresentedNotificationsAsync.mockResolvedValue([]);
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(null);
    mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  });
  afterEach(() => {
    _esquecerAlarmesLocais();
    jest.useRealTimers();
  });

  it('repete a cada REPETIR_ALARME_MS enquanto ninguém confirma, e para no teto', async () => {
    expect(await tocarAlarmeLocal(socorro)).toBe(true);
    expect(agendar).toHaveBeenCalledTimes(1);

    await andar(REPETIR_ALARME_MS);
    expect(agendar).toHaveBeenCalledTimes(2);

    await andar(TETO_DO_ALARME_MS);
    const total = 1 + Math.floor(TETO_DO_ALARME_MS / REPETIR_ALARME_MS);
    expect(agendar).toHaveBeenCalledTimes(total);
    await andar(10 * REPETIR_ALARME_MS);
    expect(agendar).toHaveBeenCalledTimes(total);

    // Todo toque vai pelo canal de emergência, com o som do canal.
    for (let i = 0; i < total; i++) {
      expect(agendamento(i).trigger).toEqual({ channelId: 'emergencia' });
      expect(agendamento(i).content.sound).toBe('default');
      expect(agendamento(i).content.data.help_request_id).toBe('hr-1');
    }
  });

  it('cada toque tira o anterior da bandeja: fica uma notificação do pedido, não vinte', async () => {
    await tocarAlarmeLocal(socorro);
    await andar(REPETIR_ALARME_MS);
    expect(mockNotifications.dismissNotificationAsync).toHaveBeenCalledWith(agendamento(0).identifier);
    expect(agendamento(1).identifier).not.toBe(agendamento(0).identifier);
  });

  it('confirmado ou resolvido (sai da lista): para de tocar e sai da bandeja', async () => {
    await sincronizarAlarmesLocais([socorro]);
    expect(agendar).toHaveBeenCalledTimes(1);

    await sincronizarAlarmesLocais([]);
    expect(mockNotifications.dismissNotificationAsync).toHaveBeenCalledWith(agendamento(0).identifier);
    await andar(5 * REPETIR_ALARME_MS);
    expect(agendar).toHaveBeenCalledTimes(1);
  });

  it('o mesmo pedido de novo na lista (outra atualização) não toca outra vez nem recomeça', async () => {
    await sincronizarAlarmesLocais([socorro]);
    await sincronizarAlarmesLocais([{ ...socorro, corpo: 'Falta de ar (atualizado)' }]);
    expect(agendar).toHaveBeenCalledTimes(1);
  });

  it('escalonamento do servidor: toca de novo na hora e recomeça a contagem do teto', async () => {
    await sincronizarAlarmesLocais([socorro]);
    await andar(TETO_DO_ALARME_MS + REPETIR_ALARME_MS);
    const esgotado = agendar.mock.calls.length;
    await andar(5 * REPETIR_ALARME_MS);
    expect(agendar).toHaveBeenCalledTimes(esgotado);

    const escalado = { ...socorro, escalado: new Date().toISOString() };
    await sincronizarAlarmesLocais([escalado]);
    expect(agendar).toHaveBeenCalledTimes(esgotado + 1);
    await andar(REPETIR_ALARME_MS);
    expect(agendar).toHaveBeenCalledTimes(esgotado + 2);
    // A mesma fase de novo não toca outra vez.
    await sincronizarAlarmesLocais([escalado]);
    expect(agendar).toHaveBeenCalledTimes(esgotado + 2);
  });

  it('o push do escalonamento já na bandeja: o primeiro toque não dobra o som, mas a repetição segue', async () => {
    await sincronizarAlarmesLocais([socorro]);
    mockNotifications.getPresentedNotificationsAsync.mockResolvedValue([{ request: { identifier: 'push', content: { data: { help_request_id: 'hr-1', escalated: true } } } }]);
    await sincronizarAlarmesLocais([{ ...socorro, escalado: new Date().toISOString() }]);
    expect(agendar).toHaveBeenCalledTimes(1);
    await andar(REPETIR_ALARME_MS);
    expect(agendar).toHaveBeenCalledTimes(2);
  });

  it('app em segundo plano (os timers do JS param): os toques que faltam vão para o sistema; de volta à frente, saem dele', async () => {
    await tocarAlarmeLocal(socorro);
    expect(agendar).toHaveBeenCalledTimes(1);

    await act(async () => {
      ouvinteDoApp()('background');
      await Promise.resolve();
    });
    await andar(0);
    const noSistema = agendar.mock.calls.slice(1).map(([a]) => a as Agendamento);
    expect(noSistema).toHaveLength(Math.floor(TETO_DO_ALARME_MS / REPETIR_ALARME_MS));
    expect(noSistema[0].trigger).toEqual({ type: 'timeInterval', seconds: REPETIR_ALARME_MS / 1000, channelId: 'emergencia' });
    expect(noSistema[noSistema.length - 1].trigger).toMatchObject({ seconds: TETO_DO_ALARME_MS / 1000 });
    // Com o app em segundo plano o timer do JS não toca por cima do sistema.
    await andar(REPETIR_ALARME_MS);
    expect(agendar).toHaveBeenCalledTimes(1 + noSistema.length);

    await act(async () => {
      ouvinteDoApp()('active');
      await Promise.resolve();
    });
    await andar(0);
    for (const a of noSistema) expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(a.identifier);
    // De volta à frente, a repetição continua pelo timer.
    await andar(REPETIR_ALARME_MS);
    expect(agendar).toHaveBeenCalledTimes(2 + noSistema.length);
  });

  it('confirmado com o app em segundo plano: os toques entregues ao sistema são cancelados', async () => {
    await sincronizarAlarmesLocais([socorro]);
    await act(async () => {
      ouvinteDoApp()('background');
      await Promise.resolve();
    });
    await andar(0);
    const noSistema = agendar.mock.calls.slice(1).map(([a]) => (a as Agendamento).identifier);
    expect(noSistema.length).toBeGreaterThan(0);

    await sincronizarAlarmesLocais([]);
    for (const id of noSistema) expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(id);
  });

  it('toques que uma execução anterior deixou agendados saem na sincronização (o app foi fechado no meio)', async () => {
    await sincronizarAlarmesLocais([socorro]);
    await act(async () => {
      ouvinteDoApp()('background');
      await Promise.resolve();
    });
    await andar(0);
    const deixados = agendar.mock.calls.slice(1).map(([a]) => ({ identifier: (a as Agendamento).identifier }));
    // O app morre aqui. Na próxima execução o sistema ainda guarda os agendamentos.
    _esquecerAlarmesLocais();
    mockNotifications.cancelScheduledNotificationAsync.mockClear();
    mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([...deixados, { identifier: 'lembrete-de-outra-coisa' }]);

    // O socorro foi confirmado nesse meio-tempo: a lista chega vazia.
    await sincronizarAlarmesLocais([]);
    for (const d of deixados) expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(d.identifier);
    expect(mockNotifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('lembrete-de-outra-coisa');
  });

  it('no Expo Go não faz nada (nem carrega o módulo de notificações)', async () => {
    constants.executionEnvironment = 'storeClient';
    await sincronizarAlarmesLocais([socorro]);
    await andar(REPETIR_ALARME_MS);
    expect(agendar).not.toHaveBeenCalled();
    expect(mockNotifications.setNotificationHandler).not.toHaveBeenCalled();
  });
});

