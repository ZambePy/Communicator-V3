/**
 * O overlay é a peça de segurança do app: o que ele diz sobre o prazo e sobre
 * o que foi (ou não) registrado precisa ser verdade. Três coisas são cobertas:
 *
 * 1. Com `escalated_at` vindo do servidor, mostra o horário do escalonamento —
 *    e não o cronômetro local, que é só uma estimativa.
 * 2. Sem `escalated_at`, mostra a contagem regressiva a partir de quando o
 *    servidor recebeu o pedido (`received_at`; sem a coluna, `created_at`) —
 *    e, se o pedido esperou na fila offline do computador, as duas horas.
 * 3. Quando `acknowledgeAlert` rejeita, a falha aparece e o botão vira
 *    "Tentar de novo" — em vez de fingir que o computador do paciente foi avisado.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { HelpRequest, PatientSettings } from '@/data/types';
import { EmergencyOverlay } from './EmergencyOverlay';

// `useApp` é a única entrada do overlay. Substituir o hook (e não o provider
// inteiro) mantém o teste sobre o componente, sem rede, sem realtime e sem os
// efeitos de carga do AppProvider.
const mockApp = {
  pendingAlert: null as HelpRequest | null,
  settings: null as PatientSettings | null,
  patient: { user_name: 'Carlos Souza' },
  acknowledgeAlert: jest.fn(),
  resolveAlert: jest.fn(),
  dismissPendingAlert: jest.fn(),
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

const AGORA = new Date('2026-09-10T15:00:00.000Z').getTime();

function alerta(extra: Partial<HelpRequest> = {}): HelpRequest {
  return {
    id: 'hr-1',
    beneficiary_id: 'b1',
    session_id: 's1',
    kind: 'emergencia',
    message: 'Carlos acionou o pedido de socorro na tela.',
    created_at: new Date(AGORA - 10_000).toISOString(), // apareceu há 10 s
    acknowledged_at: null,
    escalated_at: null,
    resolved_at: null,
    ...extra,
  };
}

function ajustes(extra: Partial<PatientSettings> = {}): PatientSettings {
  return {
    beneficiary_id: 'b1',
    dwell_ms: 1500,
    filter_preset: 'balanceado',
    keyboard_layout: 'frequencia',
    sensitivity: 5,
    voice: 'pt-BR padrão',
    emergency_timeout_s: 45,
    emergency_contacts: [{ name: 'Mariana (esposa)', phone: '11987654321' }],
    updated_at: new Date(AGORA).toISOString(),
    ...extra,
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: AGORA });
  mockApp.acknowledgeAlert.mockReset();
  mockApp.resolveAlert.mockReset();
  mockApp.dismissPendingAlert.mockReset();
  mockApp.settings = ajustes();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('EmergencyOverlay', () => {
  it('não renderiza nada sem alerta pendente', async () => {
    mockApp.pendingAlert = null;
    await render(<EmergencyOverlay />);
    expect(screen.queryByText(/Pedido de socorro/)).toBeNull();
  });

  it('com escalated_at mostra o horário do escalonamento do servidor, não o cronômetro', async () => {
    // Reenviado às 15:00 UTC; o rótulo usa o fuso local, então o esperado é calculado do mesmo jeito.
    const escaladoEm = new Date(AGORA).toISOString();
    const horario = new Date(escaladoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    mockApp.pendingAlert = alerta({ escalated_at: escaladoEm });

    await render(<EmergencyOverlay />);

    const prazo = screen.getByTestId('prazo');
    expect(prazo).toHaveTextContent(`Reenviado às ${horario}`, { exact: false });
    expect(prazo).toHaveTextContent(/a todos os celulares desta conta: ninguém confirmou em 45 s/);
    expect(prazo).not.toHaveTextContent(/Prazo para alguém confirmar/);
    // O contato aparece já no escalonamento, antes do "Estou indo!": ligar é a ação real.
    expect(screen.getByText('Mariana (esposa)')).toBeTruthy();
    expect(screen.getByLabelText('Ligar para Mariana (esposa)')).toBeTruthy();
  });

  it('sem escalated_at mostra a contagem regressiva a partir de created_at', async () => {
    mockApp.pendingAlert = alerta();

    await render(<EmergencyOverlay />);

    // 45 s de prazo, alerta criado há 10 s → 35 s restantes.
    expect(screen.getByTestId('prazo')).toHaveTextContent(/Prazo para alguém confirmar: 35 s/);
    expect(screen.queryByText(/Escalado às/)).toBeNull();
    // Antes de estourar, o contato ainda não aparece (só depois de confirmar ou escalar).
    expect(screen.queryByText('Mariana (esposa)')).toBeNull();

    await act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('prazo')).toHaveTextContent(/Prazo para alguém confirmar: 30 s/);
  });

  it('pedido que esperou na fila offline: o prazo conta da chegada ao servidor e o overlay diz as duas horas', async () => {
    const pedidoEm = new Date(AGORA - 3 * 3600_000).toISOString(); // pedido há 3 h, sem internet no PC
    const chegouEm = new Date(AGORA - 10_000).toISOString(); // chegou ao servidor há 10 s
    const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    mockApp.pendingAlert = alerta({ created_at: pedidoEm, received_at: chegouEm });

    await render(<EmergencyOverlay />);

    // Mesmo prazo que o servidor usa: 45 s a partir da chegada, não do pedido.
    expect(screen.getByTestId('prazo')).toHaveTextContent(/Prazo para alguém confirmar: 35 s/);
    expect(screen.getByTestId('atraso')).toHaveTextContent(
      `Pedido feito às ${hora(pedidoEm)} no computador do paciente; chegou às ${hora(chegouEm)}.`,
    );
    // O topo mostra a hora do pedido.
    expect(screen.getByText(new RegExp(`Emergência · ${hora(pedidoEm)}`))).toBeTruthy();
  });

  it('chegada logo depois do pedido não ganha nota de atraso', async () => {
    mockApp.pendingAlert = alerta({
      created_at: new Date(AGORA - 40_000).toISOString(),
      received_at: new Date(AGORA - 10_000).toISOString(),
    });

    await render(<EmergencyOverlay />);

    expect(screen.queryByTestId('atraso')).toBeNull();
    expect(screen.getByTestId('prazo')).toHaveTextContent(/Prazo para alguém confirmar: 35 s/);
  });

  it('quando o cronômetro local zera e o servidor ainda não escalou, diz que ele vai reenviar', async () => {
    mockApp.pendingAlert = alerta({ created_at: new Date(AGORA - 60_000).toISOString() });

    await render(<EmergencyOverlay />);

    const prazo = screen.getByTestId('prazo');
    expect(prazo).toHaveTextContent(/Passaram-se 45 s sem confirmação/);
    expect(prazo).toHaveTextContent(/será reenviado a todos os celulares em até um minuto/);
    expect(screen.getByText('Mariana (esposa)')).toBeTruthy();
  });

  it('falha no acknowledgeAlert: mostra o erro e o botão vira "Tentar de novo"', async () => {
    mockApp.pendingAlert = alerta();
    mockApp.acknowledgeAlert.mockRejectedValueOnce(new Error('Sem conexão.'));

    await render(<EmergencyOverlay />);

    await fireEvent.press(screen.getByText('Estou indo!'));

    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeTruthy());
    expect(mockApp.acknowledgeAlert).toHaveBeenCalledWith('hr-1');
    // O motivo chega em linguagem de gente, não o texto técnico do erro.
    expect(screen.getByText(/Não deu para registrar: Sem internet no momento/)).toBeTruthy();
    // A copy diz o que é verdade: nada foi gravado, e por isso o paciente não foi avisado.
    expect(screen.getByText(/A confirmação NÃO foi gravada/)).toBeTruthy();
    expect(screen.getByText(/o paciente não foi avisado/)).toBeTruthy();

    // Segunda tentativa, agora com sucesso: o erro some.
    mockApp.acknowledgeAlert.mockResolvedValueOnce(undefined);
    await fireEvent.press(screen.getByText('Tentar de novo'));
    await waitFor(() => expect(screen.queryByText(/Não deu para registrar/)).toBeNull());
    expect(mockApp.acknowledgeAlert).toHaveBeenCalledTimes(2);
  });

  it('socorro se reconhece com UM toque em "Estou indo!"', async () => {
    mockApp.pendingAlert = alerta();
    mockApp.acknowledgeAlert.mockResolvedValueOnce(undefined);

    await render(<EmergencyOverlay />);
    expect(screen.getByText('Carlos precisa de você agora.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Estou indo!'));

    await waitFor(() => expect(mockApp.acknowledgeAlert).toHaveBeenCalledTimes(1));
    expect(mockApp.acknowledgeAlert).toHaveBeenCalledWith('hr-1');
  });

  it('aviso da sessão (postura) não tem prazo de socorro e se confirma com "Entendi"', async () => {
    mockApp.pendingAlert = alerta({ kind: 'postura', message: 'Desvio postural lento (64 px).' });

    await render(<EmergencyOverlay />);

    expect(screen.getByText('Aviso de postura')).toBeTruthy();
    expect(screen.queryByTestId('prazo')).toBeNull();
    expect(screen.queryByText('Estou indo!')).toBeNull();
    expect(screen.getByText('Entendi')).toBeTruthy();
  });

  it('depois de confirmado, diz o que a confirmação fez (visto no servidor; a tela do paciente avisa com internet)', async () => {
    const confirmadoEm = new Date(AGORA - 5_000).toISOString();
    const horario = new Date(confirmadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    mockApp.pendingAlert = alerta({ acknowledged_at: confirmadoEm });

    await render(<EmergencyOverlay />);

    const nota = screen.getByTestId('confirmado');
    expect(nota).toHaveTextContent(`Confirmado às ${horario}`, { exact: false });
    expect(nota).toHaveTextContent(/tela do paciente avisa que você viu quando está com internet/);
    // Sem contagem regressiva nem "Estou indo!": o próximo passo é "Resolvido".
    expect(screen.queryByTestId('prazo')).toBeNull();
    expect(screen.getByText('Resolvido')).toBeTruthy();
  });
});
