/**
 * Tela de Alertas: o que ela afirma precisa ser verdade.
 *  - "Tudo tranquilo" só quando a lista carregou e está vazia; se a carga
 *    falhou, a tela diz que não deu para verificar e oferece tentar de novo.
 *  - Reconhecer e resolver chamam as ações de verdade, e a falha aparece.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Alertas from '../../app/(tabs)/alertas';
import type { HelpRequest } from '@/data/types';

const mockApp = {
  helpRequests: [] as HelpRequest[],
  acknowledgeAlert: jest.fn(async (_id: string) => undefined),
  resolveAlert: jest.fn(async (_id: string) => undefined),
  refresh: jest.fn(async () => undefined),
  settings: null,
  patient: { user_name: 'Paciente IrisFlow' },
  patientLoaded: true,
  pushError: null as null | 'permissao' | 'registro',
  error: null as string | null,
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

function alerta(extra: Partial<HelpRequest> = {}): HelpRequest {
  return { id: 'hr-1', beneficiary_id: 'b1', session_id: null, kind: 'postura', message: 'Desvio postural lento.', created_at: new Date().toISOString(), acknowledged_at: null, escalated_at: null, resolved_at: null, ...extra };
}

beforeEach(() => {
  mockApp.helpRequests = [];
  mockApp.error = null;
  mockApp.pushError = null;
  mockApp.acknowledgeAlert.mockClear();
  mockApp.resolveAlert.mockClear();
  mockApp.refresh.mockClear();
});

describe('Alertas', () => {
  it('lista vazia e carregada: "Tudo tranquilo", com o nome de quem é cuidado', async () => {
    await render(<Alertas />);
    expect(screen.getByText('Tudo tranquilo por aqui')).toBeTruthy();
    expect(screen.getByText(/se Paciente precisar de você/)).toBeTruthy();
  });

  it('carga com falha: não afirma que está tudo bem e oferece tentar de novo', async () => {
    mockApp.error = 'TypeError: Failed to fetch';
    await render(<Alertas />);
    expect(screen.queryByText('Tudo tranquilo por aqui')).toBeNull();
    expect(screen.getByText('Não deu para verificar os alertas')).toBeTruthy();
    await fireEvent.press(screen.getByText('Tentar de novo'));
    await waitFor(() => expect(mockApp.refresh).toHaveBeenCalled());
  });

  it('"Estou ciente" e "Resolvido" chamam as ações; a falha aparece sem texto técnico', async () => {
    mockApp.helpRequests = [alerta()];
    mockApp.acknowledgeAlert.mockRejectedValueOnce(new Error('new row violates row-level security policy'));
    await render(<Alertas />);

    await fireEvent.press(screen.getByText('Estou ciente'));
    await waitFor(() => expect(screen.getByText('Nada foi registrado')).toBeTruthy());
    expect(mockApp.acknowledgeAlert).toHaveBeenCalledWith('hr-1');
    expect(screen.queryByText(/row-level/)).toBeNull();

    await fireEvent.press(screen.getByText('Resolvido'));
    await waitFor(() => expect(mockApp.resolveAlert).toHaveBeenCalledWith('hr-1'));
  });

  it('permissão de notificação negada: explica e oferece o caminho, sem jargão', async () => {
    mockApp.pushError = 'permissao';
    await render(<Alertas />);
    expect(screen.getByText('Notificações desligadas')).toBeTruthy();
    expect(screen.getByText('Ativar nos ajustes do celular')).toBeTruthy();
  });
});
