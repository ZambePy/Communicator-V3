/**
 * Tela de Alertas: o que ela afirma precisa ser verdade.
 *  - "Tudo tranquilo" só quando a lista carregou e está vazia; se a carga
 *    falhou, a tela diz que não deu para verificar e oferece tentar de novo.
 *  - Reconhecer e resolver chamam as ações de verdade, e a falha aparece.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Alertas from '../../app/(tabs)/alertas';
import type { HelpRequest } from '@/data/types';
import { TRAVA_DO_BOTAO_MS } from '@/hooks/useTravaDosBotoes';

const mockApp = {
  helpRequests: [] as HelpRequest[],
  acknowledgeAlert: jest.fn(async (_id: string) => undefined),
  resolveAlert: jest.fn(async (_id: string) => undefined),
  refresh: jest.fn(async () => undefined),
  settings: null,
  patient: { user_name: 'Paciente IrisFlow' },
  patientLoaded: true,
  patientVerified: true,
  pushError: null as null | 'permissao' | 'registro',
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

function alerta(extra: Partial<HelpRequest> = {}): HelpRequest {
  return { id: 'hr-1', beneficiary_id: 'b1', session_id: null, kind: 'postura', message: 'Desvio postural lento.', created_at: new Date().toISOString(), acknowledged_at: null, escalated_at: null, resolved_at: null, ...extra };
}

beforeEach(() => {
  mockApp.helpRequests = [];
  mockApp.patientVerified = true;
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
    mockApp.patientVerified = false;
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

  // APP-2: a decisão era pela string de erro — fechar o aviso bastava para a
  // tela passar a dizer "Tudo tranquilo" sem nada verificado.
  it('sem verificação, "Tudo tranquilo" não aparece nem depois de o aviso de erro ser fechado', async () => {
    mockApp.patientVerified = false; // o aviso global pode estar fechado: não importa
    await render(<Alertas />);
    expect(screen.queryByText('Tudo tranquilo por aqui')).toBeNull();
    expect(screen.getByText('Não deu para verificar os alertas')).toBeTruthy();
  });

  it('com alertas na tela mas a atualização falhando: avisa que podem faltar os mais novos', async () => {
    mockApp.patientVerified = false;
    mockApp.helpRequests = [alerta()];
    await render(<Alertas />);
    expect(screen.getByTestId('alertas-desatualizados')).toBeTruthy();
    expect(screen.getByText('Estou ciente')).toBeTruthy();
  });

  // Revisão de UX de 19/10/2026 (achado 12): depois de "Estou ciente", o botão
  // "Resolvido" ocupa o lugar dele — um toque duplo resolvia o socorro. O alerta
  // em tela cheia já tinha a trava; a lista não.
  describe('toque duplo', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('o segundo toque de "Estou ciente" não resolve o socorro: "Resolvido" espera um instante', async () => {
      const socorro = alerta({ kind: 'emergencia', message: 'FALTA DE AR' });
      mockApp.helpRequests = [socorro];
      const tela = await render(<Alertas />);

      await fireEvent.press(screen.getByText('Estou ciente'));
      await waitFor(() => expect(mockApp.acknowledgeAlert).toHaveBeenCalledWith('hr-1'));
      // O banco confirmou: "Estou ciente" sai e "Resolvido" ocupa a linha toda.
      mockApp.helpRequests = [{ ...socorro, acknowledged_at: new Date().toISOString() }];
      await tela.rerender(<Alertas />);
      expect(screen.queryByText('Estou ciente')).toBeNull();

      await fireEvent.press(screen.getByText('Resolvido'));
      expect(mockApp.resolveAlert).not.toHaveBeenCalled();

      await act(() => {
        jest.advanceTimersByTime(TRAVA_DO_BOTAO_MS);
      });
      await fireEvent.press(screen.getByText('Resolvido'));
      await waitFor(() => expect(mockApp.resolveAlert).toHaveBeenCalledWith('hr-1'));
    });

    it('confirmado em outro celular enquanto a lista está aberta: a mesma trava', async () => {
      const socorro = alerta({ kind: 'emergencia' });
      mockApp.helpRequests = [socorro];
      const tela = await render(<Alertas />);
      mockApp.helpRequests = [{ ...socorro, acknowledged_at: new Date().toISOString() }];
      await tela.rerender(<Alertas />);
      await fireEvent.press(screen.getByText('Resolvido'));
      expect(mockApp.resolveAlert).not.toHaveBeenCalled();
    });

    it('pedido que já aparece confirmado: "Resolvido" responde na hora', async () => {
      mockApp.helpRequests = [alerta({ kind: 'emergencia', acknowledged_at: new Date().toISOString() })];
      await render(<Alertas />);
      await fireEvent.press(screen.getByText('Resolvido'));
      await waitFor(() => expect(mockApp.resolveAlert).toHaveBeenCalledWith('hr-1'));
    });
  });
});
