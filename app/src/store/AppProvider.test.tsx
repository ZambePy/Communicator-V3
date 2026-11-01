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
 *
 * E o que a revisão de UX de 19/10/2026 achou (achados 6 e 11): um socorro
 * novo ficava escondido atrás de um "Chamar atenção" aberto ou minimizado, e o
 * alarme local só tocava para o alerta da tela.
 */
import React from 'react';
import { Text, AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  AppProvider,
  ajustesMaisRecentes,
  chaveDoAlerta,
  comNovasTentativas,
  confirmarMensagem,
  mesclarComProvisorias,
  derivePendingAlert,
  escolherAlerta,
  escolherSessao,
  esperaDaTentativa,
  inserirMensagem,
  JANELA_DO_ALERTA_MS,
  planoPermite,
  SEM_CONTA,
  useApp,
} from './AppProvider';
import { ConflitoDeAjustes, type AuthUser, type Beneficiary, type Device, type HelpRequest, type Message, type PatientSettings, type RealtimeHandlers, type Session } from '@/data/types';
import { sincronizarAlarmesLocais, type PedidoDoAlarme } from '@/hooks/usePushNotifications';

jest.mock('@/hooks/usePushNotifications', () => ({
  obterTokenDoAparelho: jest.fn(async () => null),
  sincronizarAlarmesLocais: jest.fn(async () => undefined),
}));
const mockSincronizarAlarmes = sincronizarAlarmesLocais as jest.Mock;
/** Os pedidos que o alarme local deve estar tocando agora (a última sincronização). */
const tocando = (): PedidoDoAlarme[] => (mockSincronizarAlarmes.mock.calls.at(-1)?.[0] as PedidoDoAlarme[] | undefined) ?? [];

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
  reconectarTempoReal: jest.fn(),
  signUp: jest.fn(),
  confirmarCodigo: jest.fn(),
  completarCadastro: jest.fn(async () => undefined),
  atualizarPerfil: jest.fn(),
  atualizarPaciente: jest.fn(),
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
  mockSincronizarAlarmes.mockClear();
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

// ---------- revisão de UX de 19/10/2026 ----------
function pedido(id: string, kind: HelpRequest['kind'], extra: Partial<HelpRequest> = {}): HelpRequest {
  return { id, beneficiary_id: 'b1', session_id: null, kind, message: '', created_at: new Date().toISOString(), acknowledged_at: null, escalated_at: null, resolved_at: null, ...extra };
}
/** O "Chamar atenção" da tela Sim · Não do computador. */
const chamarAtencao = () => pedido('hr-ajuda', 'ajuda', { message: 'Está chamando você (tela Sim · Não)' });
const socorroNovo = (id = 'hr-socorro') => pedido(id, 'emergencia', { message: 'FALTA DE AR' });

describe('AppProvider — socorro não fica atrás de outro pedido (achado 6)', () => {
  it('socorro novo com o "Chamar atenção" na tela: o socorro toma a tela', async () => {
    mockData.listHelpRequests.mockResolvedValue([chamarAtencao()]);
    await montar();
    await esperar(0);
    expect(app.pendingAlert?.id).toBe('hr-ajuda');

    await act(async () => handlersDoTempoReal?.onHelpRequest?.(socorroNovo()));
    expect(app.pendingAlert?.id).toBe('hr-socorro');
  });

  it('com o "Chamar atenção" minimizado: o socorro entra em tela cheia, não escondido na faixa', async () => {
    mockData.listHelpRequests.mockResolvedValue([chamarAtencao()]);
    await montar();
    await esperar(0);
    await act(async () => app.minimizePendingAlert());
    expect(app.pendingAlertMinimized).toBe(true);

    await act(async () => handlersDoTempoReal?.onHelpRequest?.(socorroNovo()));
    expect(app.pendingAlert?.id).toBe('hr-socorro');
    expect(app.pendingAlertMinimized).toBe(false);
  });

  it('"Estou indo!" confirma o socorro; o "Chamar atenção" que esperava volta em tela cheia', async () => {
    mockData.listHelpRequests.mockResolvedValue([chamarAtencao()]);
    await montar();
    await esperar(0);
    await act(async () => app.minimizePendingAlert());
    await act(async () => handlersDoTempoReal?.onHelpRequest?.(socorroNovo()));

    await act(async () => app.acknowledgeAlert('hr-socorro'));
    expect(mockData.acknowledgeHelpRequest).toHaveBeenCalledWith('hr-socorro');
    expect(app.pendingAlert?.id).toBe('hr-ajuda');
    expect(app.pendingAlertMinimized).toBe(false);
  });

  it('pedido de ajuda novo não cobre um socorro sem resposta', async () => {
    mockData.listHelpRequests.mockResolvedValue([socorroNovo()]);
    await montar();
    await esperar(0);
    await act(async () => handlersDoTempoReal?.onHelpRequest?.(chamarAtencao()));
    expect(app.pendingAlert?.id).toBe('hr-socorro');
  });

  it('ao abrir o app, o socorro sem resposta vem antes do pedido de ajuda mais recente', () => {
    const agora = Date.parse('2026-10-19T03:00:00Z');
    const socorro = pedido('hr-socorro', 'emergencia', { created_at: new Date(agora - 60_000).toISOString() });
    const ajuda = pedido('hr-ajuda', 'ajuda', { created_at: new Date(agora - 10_000).toISOString() });
    expect(derivePendingAlert([ajuda, socorro], agora)?.id).toBe('hr-socorro');
    expect(escolherAlerta(ajuda, socorro)?.id).toBe('hr-socorro');
    expect(escolherAlerta(socorro, ajuda)?.id).toBe('hr-socorro');
  });
});

describe('AppProvider — alarme local para todo pedido urgente sem confirmação (achados 6 e 11)', () => {
  it('toca para cada socorro e ajuda sem confirmação — não para aviso, nem confirmado, nem resolvido', async () => {
    const agora = new Date().toISOString();
    mockData.listHelpRequests.mockResolvedValue([
      chamarAtencao(),
      pedido('hr-postura', 'postura', { message: 'Desvio postural lento.' }),
      pedido('hr-visto', 'emergencia', { acknowledged_at: agora }),
      pedido('hr-feito', 'emergencia', { acknowledged_at: agora, resolved_at: agora }),
    ]);
    await montar();
    await esperar(0);
    expect(tocando().map((p) => p.id)).toEqual(['hr-ajuda']);
    expect(tocando()[0]).toMatchObject({ titulo: 'Pedido de ajuda — Carlos', corpo: 'Está chamando você (tela Sim · Não)', beneficiaryId: 'b1' });
  });

  it('o socorro que chega com outro na tela também toca — não só o alerta da tela', async () => {
    mockData.listHelpRequests.mockResolvedValue([socorroNovo('hr-1')]);
    await montar();
    await esperar(0);
    // Mesmo peso: o da tela fica (o alerta não troca debaixo do dedo)…
    await act(async () => handlersDoTempoReal?.onHelpRequest?.(socorroNovo('hr-2')));
    expect(app.pendingAlert?.id).toBe('hr-1');
    // …mas o celular toca pelos dois.
    expect(tocando().map((p) => p.id).sort()).toEqual(['hr-1', 'hr-2']);
  });

  it('para ao confirmar e ao resolver', async () => {
    mockData.listHelpRequests.mockResolvedValue([socorroNovo('hr-1'), socorroNovo('hr-2')]);
    await montar();
    await esperar(0);
    expect(tocando()).toHaveLength(2);

    await act(async () => app.acknowledgeAlert('hr-1'));
    expect(tocando().map((p) => p.id)).toEqual(['hr-2']);
    await act(async () => app.resolveAlert('hr-2'));
    expect(tocando()).toEqual([]);
  });

  it('confirmado em OUTRO celular (tempo real): para de tocar aqui também', async () => {
    mockData.listHelpRequests.mockResolvedValue([socorroNovo()]);
    await montar();
    await esperar(0);
    await act(async () => handlersDoTempoReal?.onHelpRequest?.({ ...socorroNovo(), acknowledged_at: new Date().toISOString() }));
    expect(tocando()).toEqual([]);
  });

  it('o escalonamento do servidor chega ao alarme (que então toca de novo)', async () => {
    mockData.listHelpRequests.mockResolvedValue([socorroNovo()]);
    await montar();
    await esperar(0);
    expect(tocando()[0].escalado ?? null).toBeNull();

    const escaladoEm = new Date().toISOString();
    await act(async () => handlersDoTempoReal?.onHelpRequest?.({ ...socorroNovo(), escalated_at: escaladoEm }));
    expect(tocando()).toEqual([expect.objectContaining({ id: 'hr-socorro', escalado: escaladoEm, titulo: 'Pedido de socorro sem resposta — Carlos' })]);
  });

  it('para ao sair da conta', async () => {
    mockData.listHelpRequests.mockResolvedValue([socorroNovo()]);
    await montar();
    await esperar(0);
    expect(tocando()).toHaveLength(1);

    await act(async () => {
      await app.signOut();
    });
    expect(tocando()).toEqual([]);
  });

  it('pedido de antes da janela do alerta (horas atrás) não toca', async () => {
    const antigo = new Date(Date.now() - JANELA_DO_ALERTA_MS - 60_000).toISOString();
    mockData.listHelpRequests.mockResolvedValue([pedido('hr-velho', 'emergencia', { created_at: antigo, received_at: antigo })]);
    await montar();
    await esperar(0);
    expect(tocando()).toEqual([]);
  });
});

// ---------- 31/10/2026: mensagens mais rápidas ----------
const doCuidador = (id: string, text: string, extra: Partial<Message> = {}): Message => ({ id, beneficiary_id: 'b1', sender: 'cuidador', kind: 'texto', text, created_at: new Date().toISOString(), read_at: null, spoken: false, ...extra });

describe('envio otimista', () => {
  it('a mensagem aparece NA HORA com "enviando", antes de o banco responder; depois vira a gravada com a mesma chave', async () => {
    await montar();
    await esperar(0);
    let soltar: (m: Message) => void = () => undefined;
    mockData.sendMessage.mockImplementationOnce(() => new Promise<Message>((r) => (soltar = r)));

    let envio: Promise<void> = Promise.resolve();
    await act(async () => {
      envio = app.sendMessage('Já levo a água.');
      await Promise.resolve();
    });
    const provisoria = app.messages.at(-1)!;
    expect(provisoria).toMatchObject({ text: 'Já levo a água.', sender: 'cuidador', envio: 'enviando' });
    expect(provisoria.clientId).toBe(provisoria.id);

    await act(async () => {
      soltar(doCuidador('srv-1', 'Já levo a água.'));
      await envio;
    });
    expect(app.messages.filter((m) => m.text === 'Já levo a água.')).toHaveLength(1);
    expect(app.messages.at(-1)).toMatchObject({ id: 'srv-1', clientId: provisoria.id });
    expect(app.messages.at(-1)?.envio).toBeUndefined();
  });

  it('falhou: fica "falhou" na conversa, e tentar de novo envia a mesma mensagem', async () => {
    await montar();
    await esperar(0);
    mockData.sendMessage.mockRejectedValueOnce(falhaDeRede());
    await act(async () => {
      await app.sendMessage('Oi').catch(() => undefined);
    });
    const falhou = app.messages.at(-1)!;
    expect(falhou.envio).toBe('falhou');

    mockData.sendMessage.mockResolvedValueOnce(doCuidador('srv-2', 'Oi'));
    await act(async () => {
      await app.reenviarMensagem(falhou.id);
    });
    expect(mockData.sendMessage).toHaveBeenLastCalledWith('b1', 'Oi', 'texto');
    expect(app.messages.filter((m) => m.text === 'Oi')).toEqual([expect.objectContaining({ id: 'srv-2', clientId: falhou.id })]);
  });

  it('o evento do tempo real chega antes da resposta do insert: não duplica', async () => {
    await montar();
    await esperar(0);
    let soltar: (m: Message) => void = () => undefined;
    mockData.sendMessage.mockImplementationOnce(() => new Promise<Message>((r) => (soltar = r)));
    let envio: Promise<void> = Promise.resolve();
    await act(async () => {
      envio = app.sendMessage('Sim', 'simnao');
      await Promise.resolve();
    });
    const gravada = doCuidador('srv-3', 'Sim', { kind: 'simnao' });
    await act(async () => handlersDoTempoReal?.onMessage?.(gravada));
    expect(app.messages.filter((m) => m.text === 'Sim')).toHaveLength(1);
    await act(async () => {
      soltar(gravada);
      await envio;
    });
    expect(app.messages.filter((m) => m.text === 'Sim')).toHaveLength(1);
    // "Falado na tela" chega como UPDATE da mesma linha.
    await act(async () => handlersDoTempoReal?.onMessage?.({ ...gravada, spoken: true }));
    expect(app.messages.find((m) => m.id === 'srv-3')?.spoken).toBe(true);
  });

  it('uma recarga não apaga a mensagem que está sendo enviada', () => {
    const provisoria = doCuidador('local-1', 'Já vou', { envio: 'enviando', clientId: 'local-1' });
    expect(mesclarComProvisorias([], [provisoria])).toEqual([provisoria]);
    const gravada = doCuidador('srv-9', 'Já vou');
    expect(mesclarComProvisorias([gravada], [provisoria])).toEqual([{ ...gravada, clientId: 'local-1' }]);
    expect(confirmarMensagem([provisoria], gravada, 'local-1')).toEqual([expect.objectContaining({ id: 'srv-9', clientId: 'local-1' })]);
  });
});

describe('abertura e volta para a frente', () => {
  it('a primeira inscrição logo depois da carga só busca mensagens e pedidos (antes: as 5 consultas de novo)', async () => {
    await montar();
    await esperar(0);
    expect(mockData.listDevices).toHaveBeenCalledTimes(1);
    expect(mockData.listMessages).toHaveBeenCalledTimes(1);

    await act(async () => handlersDoTempoReal?.onSubscribed?.());
    await esperar(0);
    expect(mockData.listMessages).toHaveBeenCalledTimes(2);
    expect(mockData.listHelpRequests).toHaveBeenCalledTimes(2);
    // Sem recarregar o resto:
    expect(mockData.listDevices).toHaveBeenCalledTimes(1);
    expect(mockData.getCurrentSession).toHaveBeenCalledTimes(1);
    expect(mockData.getSettings).toHaveBeenCalledTimes(1);

    // Uma reinscrição depois (a conexão caiu e voltou) recarrega tudo.
    await act(async () => handlersDoTempoReal?.onSubscribed?.());
    await esperar(0);
    expect(mockData.listDevices).toHaveBeenCalledTimes(2);
  });

  it('mensagem que chega pelo tempo real enquanto a carga volta não é apagada por ela', async () => {
    let soltar: (l: Message[]) => void = () => undefined;
    mockData.listMessages.mockImplementationOnce(() => new Promise<Message[]>((r) => (soltar = r)));
    await montar();
    await esperar(0);
    const nova: Message = { id: 'p-durante', beneficiary_id: 'b1', sender: 'paciente', kind: 'texto', text: 'Chegou agora', created_at: new Date().toISOString(), read_at: null, spoken: true };
    await act(async () => handlersDoTempoReal?.onMessage?.(nova));
    // A carga começou antes e volta sem ela:
    await act(async () => soltar([]));
    await esperar(0);
    expect(app.messages.map((m) => m.id)).toEqual(['p-durante']);
    expect(app.unreadCount).toBe(1);
  });

  it('a recuperação do intervalo espera a carga de abertura voltar e grava depois dela', async () => {
    let soltar: (l: Message[]) => void = () => undefined;
    mockData.listMessages.mockImplementationOnce(() => new Promise<Message[]>((r) => (soltar = r)));
    await montar();
    await esperar(0);
    const noIntervalo: Message = { id: 'p-gap', beneficiary_id: 'b1', sender: 'paciente', kind: 'texto', text: 'No intervalo', created_at: new Date().toISOString(), read_at: null, spoken: true };
    mockData.listMessages.mockResolvedValueOnce([noIntervalo]);
    await act(async () => handlersDoTempoReal?.onSubscribed?.());
    await esperar(0);
    // Ainda esperando a carga de abertura: nada da recuperação foi pedido.
    expect(mockData.listMessages).toHaveBeenCalledTimes(1);
    await act(async () => soltar([]));
    await esperar(0);
    expect(mockData.listMessages).toHaveBeenCalledTimes(2);
    expect(app.messages.map((m) => m.id)).toEqual(['p-gap']);
  });

  it('o canal do tempo real abre assim que a lista de pacientes chega, sem esperar perfil, licença e assinatura', async () => {
    let soltarPerfil: () => void = () => undefined;
    mockData.getProfile.mockImplementationOnce(() => new Promise((r) => (soltarPerfil = () => r({ id: 'user-1', buyer_name: 'Maria', email: USUARIO.email, phone: null }))));
    await montar();
    await esperar(0);
    expect(mockData.subscribe).toHaveBeenCalledWith('b1', expect.any(Object));
    await act(async () => soltarPerfil());
  });

  it('de volta para a frente com o canal caído: reabre o WebSocket e refaz a inscrição', async () => {
    await montar();
    await esperar(0);
    const ouvintes = () => (AppState.addEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'change').map((c) => c[1] as (e: string) => void);
    await act(async () => handlersDoTempoReal?.onStatus?.('CHANNEL_ERROR'));
    const inscricoes = mockData.subscribe.mock.calls.length;
    await act(async () => {
      ouvintes().forEach((f) => f('active'));
    });
    await esperar(0);
    expect(mockData.reconectarTempoReal).toHaveBeenCalled();
    expect(mockData.subscribe.mock.calls.length).toBe(inscricoes + 1);
  });

  it('mensagem nova do paciente pelo tempo real vibra uma vez só, mesmo se chegar de novo', async () => {
    const Haptics = require('expo-haptics');
    await montar();
    await esperar(0);
    (Haptics.notificationAsync as jest.Mock).mockClear();
    const m: Message = { id: 'p-1', beneficiary_id: 'b1', sender: 'paciente', kind: 'texto', text: 'Estou com sede.', created_at: new Date().toISOString(), read_at: null, spoken: true };
    await act(async () => handlersDoTempoReal?.onMessage?.(m));
    await act(async () => handlersDoTempoReal?.onMessage?.(m));
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(app.unreadCount).toBe(1);
  });
});

describe('cadastro e perfil', () => {
  it('completar o cadastro recarrega a conta (as abas aparecem com a pessoa)', async () => {
    mockData.listBeneficiaries.mockResolvedValueOnce([]);
    await montar();
    await esperar(0);
    expect(app.beneficiaries).toEqual([]);
    await act(async () => {
      await app.completarCadastro({ userName: 'Carlos', relation: 'conjuge', condition: 'ela' });
    });
    expect(mockData.completarCadastro).toHaveBeenCalledWith({ userName: 'Carlos', relation: 'conjuge', condition: 'ela' });
    expect(app.patient?.id).toBe('b1');
  });

  it('editar a pessoa troca o nome na tela', async () => {
    await montar();
    await esperar(0);
    mockData.atualizarPaciente.mockResolvedValueOnce({ ...PACIENTE, user_name: 'Carlão' });
    await act(async () => {
      await app.atualizarPaciente({ user_name: 'Carlão' });
    });
    expect(mockData.atualizarPaciente).toHaveBeenCalledWith('b1', { user_name: 'Carlão' });
    expect(app.patient?.user_name).toBe('Carlão');
    expect(app.beneficiaries[0].user_name).toBe('Carlão');
  });
});
