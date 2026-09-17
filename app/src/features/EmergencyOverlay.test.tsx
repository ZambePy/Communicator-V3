/**
 * O overlay é a peça de segurança do app: o que ele diz sobre o prazo e sobre
 * o que foi (ou não) registrado precisa ser verdade. Três coisas são cobertas:
 *
 * 1. Com `escalated_at` vindo do servidor, mostra o horário do escalonamento —
 *    e não o cronômetro local, que é só uma estimativa.
 * 2. Sem `escalated_at`, mostra a contagem regressiva a partir de `created_at`.
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

// O overlay importa o barril `@/components`, que traz o IrisLogo, e ele faz
// `require` de `assets/images/symbol.png` e `symbol-white.png` — arquivos que
// NÃO estão no repositório (só icon/splash/adaptive-icon/favicon). O overlay
// não usa o logo; em vez de brigar com isso aqui, o componente vira nulo e a
// ausência dos PNGs fica registrada no README como pendência.
jest.mock('@/components/IrisLogo', () => ({ IrisLogo: () => null }));

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
    // Escalado às 15:00 UTC; o rótulo usa o fuso local, então o esperado é calculado do mesmo jeito.
    const escaladoEm = new Date(AGORA).toISOString();
    const horario = new Date(escaladoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    mockApp.pendingAlert = alerta({ escalated_at: escaladoEm });

    await render(<EmergencyOverlay />);

    const prazo = screen.getByTestId('prazo');
    expect(prazo).toHaveTextContent(`Escalado às ${horario}`, { exact: false });
    expect(prazo).toHaveTextContent(/reenviou o alerta/);
    expect(prazo).not.toHaveTextContent(/Prazo para alguém confirmar/);
    // O contato aparece já no escalonamento, antes do "Estou indo!": ligar é a ação real.
    expect(screen.getByText('Mariana (esposa)')).toBeTruthy();
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

  it('quando o cronômetro local zera e o servidor ainda não escalou, diz que ele vai reenviar', async () => {
    mockApp.pendingAlert = alerta({ created_at: new Date(AGORA - 60_000).toISOString() });

    await render(<EmergencyOverlay />);

    const prazo = screen.getByTestId('prazo');
    expect(prazo).toHaveTextContent(/Passaram-se 45 s sem confirmação/);
    expect(prazo).toHaveTextContent(/vai reenviar o alerta em até um minuto/);
    expect(screen.getByText('Mariana (esposa)')).toBeTruthy();
  });

  it('falha no acknowledgeAlert: mostra o erro e o botão vira "Tentar de novo"', async () => {
    mockApp.pendingAlert = alerta();
    mockApp.acknowledgeAlert.mockRejectedValueOnce(new Error('Sem conexão.'));

    await render(<EmergencyOverlay />);

    await fireEvent.press(screen.getByText('Estou indo!'));

    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeTruthy());
    expect(mockApp.acknowledgeAlert).toHaveBeenCalledWith('hr-1');
    expect(screen.getByText(/Não deu para registrar: Sem conexão\./)).toBeTruthy();
    expect(screen.getByText(/NÃO recebeu a confirmação/)).toBeTruthy();

    // Segunda tentativa, agora com sucesso: o erro some.
    mockApp.acknowledgeAlert.mockResolvedValueOnce(undefined);
    await fireEvent.press(screen.getByText('Tentar de novo'));
    await waitFor(() => expect(screen.queryByText(/Não deu para registrar/)).toBeNull());
    expect(mockApp.acknowledgeAlert).toHaveBeenCalledTimes(2);
  });
});
