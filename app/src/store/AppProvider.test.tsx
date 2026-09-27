/**
 * O estado global do app do cuidador. O que se prova aqui é o que a auditoria
 * de 27/09 achou quebrado:
 *
 *  - APP-2: uma falha de rede na abertura deixava o app sem tempo real e sem
 *    nova tentativa, e as telas diziam "Tudo tranquilo" (a única marca de
 *    "dados não verificados" era a string de erro, que o cuidador apaga);
 *    ações sem paciente carregado "davam certo" sem fazer nada.
 *  - APP-7: ajustes gravados a partir de um estado velho sobrescreviam o que
 *    outro celular tinha acabado de gravar; toques rápidos gravavam em paralelo.
 *  - APP-9/APP-10: evento de uma sessão antiga trocava a sessão ao vivo; a
 *    mensagem atrasada ia para o fim da conversa.
 *  - APP-12: o erro da conta anterior aparecia na tela de login.
 *  - APP-1: o alerta minimizado volta sozinho quando o servidor o reenvia.
 */
import React from 'react';
import { Text, AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  AppProvider,
  ajustesMaisRecentes,
  chaveDoAlerta,
  comNovasTentativas,
  escolherSessao,
  esperaDaTentativa,
  inserirMensagem,
  planoPermite,
  SEM_CONTA,
  useApp,
} from './AppProvider';
import { ConflitoDeAjustes, type AuthUser, type Beneficiary, type Device, type HelpRequest, type Message, type PatientSettings, type RealtimeHandlers, type Session } from '@/data/types';

jest.mock('@/hooks/usePushNotifications', () => ({ obterTokenDoAparelho: jest.fn(async () => null) }));

// ---------- camada de dados falsa ----------
const USUARIO: AuthUser = { id: 'user-1', email: 'familia@exemplo.com' };
const PACIENTE: Beneficiary = { id: 'b1', profile_id: 'user-1', user_name: 'Carlos Souza', relation: 'pai-mae', condition: 'ela', os: 'windows', prescriber_name: null, prescriber_role: null };

function ajustes(extra: Partial<PatientSettings> = {}): PatientSettings {
  return {
    beneficiary_id: 'b1',
    dwell_ms: 1500,
    filter_preset: 'balanceado',
    keyboard_layout: 'frequencia',
    sensitivity: 5,
    voice: 'pt-BR padrão',
    emergency_timeout_s: 45,
    emergency_contacts: [{ name: 'Lucas (filho)', phone: '11911111111' }],
    updated_at: '2026-09-27T10:00:00.000000+00:00',
    ...extra,
  };
}

let ouvinteDoAuth: ((u: AuthUser | null) => void) | null = null;
let handlersDoTempoReal: RealtimeHandlers | null = null;

const mockData = {
  getUser: jest.fn(async () => USUARIO as AuthUser | null),
  onAuthChange: jest.fn((cb: (u: AuthUser | null) => void) => {
    ouvinteDoAuth = cb;
    return () => undefined;
  }),
  concluirSaidaPendente: jest.fn(async () => true),
  garantirSessao: jest.fn(async () => undefined),
  listBeneficiaries: jest.fn(async () => [PACIENTE]),
  getProfile: jest.fn(async () => ({ id: 'user-1', buyer_name: 'Maria', email: USUARIO.email, phone: null })),
  getLicense: jest.fn(async () => ({ allowed: true, reason: 'ativa', plan_id: 'completo', features: { relatorios: true, multiplos_dispositivos: true, assistente: true, voz: false, lazer: true } })),
  getSubscription: jest.fn(async () => null),
  listDevices: jest.fn(async () => [] as Device[]),
  getCurrentSession: jest.fn(async () => null as Session | null),
  listHelpRequests: jest.fn(async () => [] as HelpRequest[]),
  listMessages: jest.fn(async () => [] as Message[]),
  getSettings: jest.fn(async () => ajustes() as PatientSettings | null),
  subscribe: jest.fn((_id: string, h: RealtimeHandlers) => {
    handlersDoTempoReal = h;
    return () => undefined;
  }),
  signIn: jest.fn(),
  signOut: jest.fn(async () => undefined),
  requestPasswordReset: jest.fn(),
  sendMessage: jest.fn(),
  markMessagesRead: jest.fn(async () => []),
  acknowledgeHelpRequest: jest.fn(async () => undefined),
  resolveHelpRequest: jest.fn(async () => undefined),
  updateSettings: jest.fn(),
  revokeDevice: jest.fn(async () => undefined),
};
jest.mock('@/data/DataContext', () => ({ useData: () => mockData }));

let app: ReturnType<typeof useApp>;
function Sonda() {
  app = useApp();
  return <Text>{app.patientVerified ? 'verificado' : 'sem verificar'}</Text>;
}

async function montar() {
  await render(
    <AppProvider>
      <Sonda />
    </AppProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

/** Deixa as promessas pendentes andarem (e os timers vencidos dispararem). */
async function esperar(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

const falhaDeRede = () => new Error('TypeError: Failed to fetch');

beforeEach(() => {
  jest.useFakeTimers();
  ouvinteDoAuth = null;
  handlersDoTempoReal = null;
  for (const f of Object.values(mockData)) f.mockClear();
  mockData.getUser.mockImplementation(async () => USUARIO);
  mockData.garantirSessao.mockImplementation(async () => undefined);
  mockData.listBeneficiaries.mockImplementation(async () => [PACIENTE]);
  mockData.getSettings.mockImplementation(async () => ajustes());
  mockData.listHelpRequests.mockImplementation(async () => []);
  mockData.updateSettings.mockReset();
  mockData.sendMessage.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------- funções puras ----------
describe('escolherSessao (APP-9)', () => {
  const agora = Date.parse('2026-09-27T12:00:00Z');
  const pc: Device = { id: 'd1', beneficiary_id: 'b1', name: 'PC', os: 'windows', app_version: '', last_seen_at: new Date(agora - 10_000).toISOString(), online: true, camera_ok: true, tracker_ok: true, calibrated: true, revoked_at: null, paired_at: null, hostname: null };
  const sessao = (id: string, inicio: string, extra: Partial<Session> = {}) => ({ id, beneficiary_id: 'b1', device_id: 'd1', status: 'active', started_at: inicio, ended_at: null, ...extra }) as Session;
  const atual = sessao('s-atual', '2026-09-27T11:20:00Z');

  it('atualização da sessão atual substitui; encerrada, sai', () => {
    const nova = { ...atual, utterances: 30 } as Session;
    expect(escolherSessao(atual, nova, [pc], agora)).toBe(nova);
    expect(escolherSessao(atual, { ...atual, status: 'ended' } as Session, [pc], agora)).toBeNull();
  });

  it('heartbeat de uma sessão ANTERIOR (sobrou de um travamento) não troca a sessão ao vivo', () => {
    const velha = sessao('s-velha', '2026-09-27T09:00:00Z');
    expect(escolherSessao(atual, velha, [pc], agora)).toBe(atual);
  });

  it('session.end atrasado de outra sessão não derruba a atual', () => {
    const velha = sessao('s-velha', '2026-09-27T09:00:00Z', { status: 'ended' });
    expect(escolherSessao(atual, velha, [pc], agora)).toBe(atual);
  });

  it('uma sessão MAIS NOVA e viva assume', () => {
    const nova = sessao('s-nova', '2026-09-27T11:50:00Z');
    expect(escolherSessao(atual, nova, [pc], agora)).toBe(nova);
    expect(escolherSessao(null, nova, [pc], agora)).toBe(nova);
  });
});

describe('inserirMensagem (APP-10)', () => {
  const msg = (id: string, created_at: string): Message => ({ id, beneficiary_id: 'b1', sender: 'paciente', kind: 'texto', text: id, created_at, read_at: null, spoken: false });

  it('mensagem atrasada da fila offline entra na ordem certa, não no fim', () => {
    const lista = [msg('ontem-22h', '2026-09-26T22:00:00Z'), msg('hoje-1', '2026-09-27T09:00:00Z'), msg('hoje-2', '2026-09-27T09:05:00Z')];
    const r = inserirMensagem(lista, msg('atrasada', '2026-09-26T23:50:00Z'));
    expect(r.map((m) => m.id)).toEqual(['ontem-22h', 'atrasada', 'hoje-1', 'hoje-2']);
  });

  it('a mesma mensagem (resposta do insert + evento do tempo real) não duplica', () => {
    const lista = [msg('a', '2026-09-27T09:00:00Z')];
    const r = inserirMensagem(lista, { ...msg('a', '2026-09-27T09:00:00Z'), spoken: true });
    expect(r).toHaveLength(1);
    expect(r[0].spoken).toBe(true);
  });
});

describe('ajustesMaisRecentes', () => {
  it('a versão mais recente pelo updated_at do banco vence; um evento atrasado não volta a tela', () => {
    const v1 = ajustes({ updated_at: '2026-09-27T10:00:00Z' });
    const v2 = ajustes({ updated_at: '2026-09-27T10:05:00Z', emergency_timeout_s: 90 });
    expect(ajustesMaisRecentes(v1, v2)).toBe(v2);
    expect(ajustesMaisRecentes(v2, v1)).toBe(v2);
    expect(ajustesMaisRecentes(null, v1)).toBe(v1);
  });
});

describe('planoPermite (só enquanto a licença do servidor não carregou)', () => {
  it('relatórios no Completo, Voz e Beta; voz só no Voz e Beta; nada sem plano', () => {
    expect(planoPermite('essencial', 'relatorios')).toBe(false);
    expect(planoPermite('completo', 'relatorios')).toBe(true);
    expect(planoPermite('completo', 'voz')).toBe(false);
    expect(planoPermite('beta', 'voz')).toBe(true);
    expect(planoPermite(null, 'relatorios')).toBe(false);
  });
});

describe('comNovasTentativas', () => {
  const ouvintesDoAppState = () => (AppState.addEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'change').map((c) => c[1] as (e: string) => void);

  it('tenta de novo com espera crescente até dar certo', async () => {
    const carregar = jest.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('rede')).mockResolvedValue(true);
    const parar = comNovasTentativas(carregar);
    await jest.advanceTimersByTimeAsync(0);
    expect(carregar).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(esperaDaTentativa(1));
    expect(carregar).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(esperaDaTentativa(2));
    expect(carregar).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(carregar).toHaveBeenCalledTimes(3);
    parar();
  });

  it('voltar para a frente com falha pendente tenta na hora; sem falha, só com `sempreAoVoltar`', async () => {
    (AppState.addEventListener as jest.Mock).mockClear();
    const falhando = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const parar = comNovasTentativas(falhando);
    await jest.advanceTimersByTimeAsync(0);
    ouvintesDoAppState().forEach((f) => f('active'));
    await jest.advanceTimersByTimeAsync(0);
    expect(falhando).toHaveBeenCalledTimes(2);
    // Já deu certo: voltar para a frente não recarrega à toa.
    ouvintesDoAppState().forEach((f) => f('active'));
    await jest.advanceTimersByTimeAsync(0);
    expect(falhando).toHaveBeenCalledTimes(2);
    parar();

    (AppState.addEventListener as jest.Mock).mockClear();
    const sempre = jest.fn().mockResolvedValue(true);
    const parar2 = comNovasTentativas(sempre, { sempreAoVoltar: true });
    await jest.advanceTimersByTimeAsync(0);
    ouvintesDoAppState().forEach((f) => f('active'));
    await jest.advanceTimersByTimeAsync(0);
    expect(sempre).toHaveBeenCalledTimes(2);
    parar2();
  });

  it('depois da limpeza, nada mais roda', async () => {
    const carregar = jest.fn().mockResolvedValue(false);
    const parar = comNovasTentativas(carregar);
    await jest.advanceTimersByTimeAsync(0);
    parar();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(carregar).toHaveBeenCalledTimes(1);
  });
});

// ---------- o provider inteiro ----------
describe('AppProvider — abertura com a rede instável (APP-2)', () => {
  it('a carga da conta que falhou tenta de novo sozinha, e o tempo real entra quando ela dá certo', async () => {
    mockData.garantirSessao.mockRejectedValueOnce(falhaDeRede());

    await montar();
    expect(app.error).toMatch(/Failed to fetch/);
    expect(app.patientVerified).toBe(false);
    expect(mockData.subscribe).not.toHaveBeenCalled();

    await esperar(esperaDaTentativa(1));

    expect(app.patient?.id).toBe('b1');
    expect(mockData.subscribe).toHaveBeenCalledWith('b1', expect.any(Object));
    expect(app.patientVerified).toBe(true);
    expect(app.error).toBeNull();
  });

  it('fechar o aviso não transforma "não verificado" em "tudo tranquilo"', async () => {
    mockData.listHelpRequests.mockRejectedValue(falhaDeRede());

    await montar();
    expect(app.patientLoaded).toBe(true);
    expect(app.patientVerified).toBe(false);
    await act(async () => app.clearError());
    expect(app.error).toBeNull();
    // As telas decidem por `patientVerified`, que continua falso.
    expect(app.patientVerified).toBe(false);

    // A nova tentativa segue sozinha e, quando dá certo, verifica.
    mockData.listHelpRequests.mockResolvedValue([]);
    await esperar(esperaDaTentativa(1));
    expect(app.patientVerified).toBe(true);
  });

  it('renovação do token com a carga falhando (a rede voltou) tenta na hora', async () => {
    mockData.garantirSessao.mockRejectedValueOnce(falhaDeRede());
    await montar();
    expect(mockData.listBeneficiaries).not.toHaveBeenCalled();

    await act(async () => ouvinteDoAuth?.({ ...USUARIO }));
    await esperar(0);

    expect(mockData.listBeneficiaries).toHaveBeenCalledTimes(1);
    expect(app.patient?.id).toBe('b1');
  });

  it('renovação do token sem falha nenhuma não recarrega tudo de novo', async () => {
    await montar();
    await esperar(0);
    const antes = mockData.listBeneficiaries.mock.calls.length;
    await act(async () => ouvinteDoAuth?.({ ...USUARIO }));
    await esperar(0);
    expect(mockData.listBeneficiaries.mock.calls.length).toBe(antes);
  });

  it('sem paciente carregado, enviar e salvar REJEITAM (antes "davam certo" sem fazer nada)', async () => {
    mockData.garantirSessao.mockRejectedValue(falhaDeRede());
    await montar();
    await expect(app.sendMessage('Estou chegando')).rejects.toThrow(SEM_CONTA);
    await expect(app.updateSettings({ emergency_timeout_s: 60 })).rejects.toThrow(SEM_CONTA);
    expect(mockData.sendMessage).not.toHaveBeenCalled();
    expect(mockData.updateSettings).not.toHaveBeenCalled();
  });

  it('sair zera o erro e os dados da conta (o erro velho não aparece no login)', async () => {
    mockData.garantirSessao.mockRejectedValue(falhaDeRede());
    await montar();
    expect(app.error).not.toBeNull();

    await act(async () => {
      await app.signOut();
    });

    expect(app.user).toBeNull();
    expect(app.error).toBeNull();
    expect(app.patient).toBeNull();
  });
});

describe('AppProvider — ajustes sem sobrescrever outro celular (APP-7)', () => {
  it('conflito: recarrega e REAPLICA a mudança sobre a versão nova — o contato do outro celular fica', async () => {
    await montar();
    await esperar(0);
    const doOutroCelular = ajustes({ updated_at: '2026-09-27T10:01:00.000000+00:00', emergency_contacts: [{ name: 'Lucas (filho)', phone: '11911111111' }, { name: 'João (vizinho)', phone: '11922222222' }] });
    mockData.updateSettings.mockRejectedValueOnce(new ConflitoDeAjustes()).mockImplementationOnce(async (_id: string, patch: Partial<PatientSettings>) => ({ ...doOutroCelular, ...patch, updated_at: '2026-09-27T10:02:00.000000+00:00' }));
    mockData.getSettings.mockResolvedValueOnce(doOutroCelular);

    const marta = { name: 'Marta (irmã)', phone: '11933333333' };
    await act(async () => {
      await app.updateSettings((atual) => ({ emergency_contacts: [...(atual?.emergency_contacts ?? []), marta] }));
    });

    // 1ª gravação: sobre o que este celular tinha lido; 2ª: sobre a versão nova.
    expect(mockData.updateSettings).toHaveBeenNthCalledWith(1, 'b1', { emergency_contacts: [ajustes().emergency_contacts[0], marta] }, ajustes().updated_at);
    expect(mockData.updateSettings).toHaveBeenNthCalledWith(2, 'b1', { emergency_contacts: [...doOutroCelular.emergency_contacts, marta] }, doOutroCelular.updated_at);
    expect(app.settings?.emergency_contacts.map((c) => c.name)).toEqual(['Lucas (filho)', 'João (vizinho)', 'Marta (irmã)']);
  });

  it('gravações em fila: a segunda só sai depois da primeira, a partir do que ela gravou', async () => {
    await montar();
    await esperar(0);
    let soltarPrimeira: (v: PatientSettings) => void = () => undefined;
    mockData.updateSettings
      .mockImplementationOnce(() => new Promise<PatientSettings>((r) => (soltarPrimeira = r)))
      .mockImplementationOnce(async (_id: string, patch: Partial<PatientSettings>) => ajustes({ ...patch, updated_at: '2026-09-27T10:03:00Z' }));

    const mais15 = (atual: PatientSettings | null) => ({ emergency_timeout_s: (atual?.emergency_timeout_s ?? 45) + 15 });
    let p1: Promise<void> = Promise.resolve();
    let p2: Promise<void> = Promise.resolve();
    await act(async () => {
      p1 = app.updateSettings(mais15);
      p2 = app.updateSettings(mais15);
      await Promise.resolve();
    });
    expect(mockData.updateSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      soltarPrimeira(ajustes({ emergency_timeout_s: 60, updated_at: '2026-09-27T10:02:00Z' }));
      await p1;
      await p2;
    });

    expect(mockData.updateSettings).toHaveBeenNthCalledWith(2, 'b1', { emergency_timeout_s: 75 }, '2026-09-27T10:02:00Z');
    expect(app.settings?.emergency_timeout_s).toBe(75);
  });

  it('recusa definitiva: a tela volta ao que vale no servidor e o erro sobe', async () => {
    await montar();
    await esperar(0);
    mockData.updateSettings.mockRejectedValueOnce(new Error('permission denied'));
    let erro: unknown;
    await act(async () => {
      erro = await app.updateSettings({ emergency_timeout_s: 120 }).catch((e: unknown) => e);
    });
    expect(erro).toMatchObject({ message: 'permission denied' });
    expect(app.settings?.emergency_timeout_s).toBe(45);
  });
});

describe('AppProvider — alerta minimizado (APP-1)', () => {
  const socorro: HelpRequest = { id: 'hr-1', beneficiary_id: 'b1', session_id: null, kind: 'emergencia', message: 'Socorro', created_at: new Date().toISOString(), acknowledged_at: null, escalated_at: null, resolved_at: null };

  it('minimizar tira da tela cheia; o reenvio pelo servidor (escalonamento) traz de volta', async () => {
    mockData.listHelpRequests.mockResolvedValue([{ ...socorro, created_at: new Date(Date.now()).toISOString() }]);
    await montar();
    await esperar(0);
    expect(app.pendingAlert?.id).toBe('hr-1');

    await act(async () => app.minimizePendingAlert());
    expect(app.pendingAlertMinimized).toBe(true);
    expect(chaveDoAlerta(app.pendingAlert!)).toBe('hr-1:');

    await act(async () => handlersDoTempoReal?.onHelpRequest?.({ ...socorro, escalated_at: new Date().toISOString() }));
    expect(app.pendingAlertMinimized).toBe(false);
  });

  it('"Abrir" na faixa volta para a tela cheia', async () => {
    mockData.listHelpRequests.mockResolvedValue([socorro]);
    await montar();
    await esperar(0);
    await act(async () => app.minimizePendingAlert());
    await act(async () => app.restorePendingAlert());
    expect(app.pendingAlertMinimized).toBe(false);
  });
});
