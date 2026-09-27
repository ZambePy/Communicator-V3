/**
 * Tela de Ajustes: nenhum controle pode fingir que muda o computador do
 * paciente. Fixação e suavização o desktop aplica (e continuam gravando);
 * teclado e sensibilidade ainda não — aparecem desligados, com "Em breve",
 * e tocar neles não grava nada.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Ajustes from '../../app/(tabs)/ajustes';
import type { PatientSettings } from '@/data/types';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

type Mudanca = Partial<PatientSettings> | ((atual: PatientSettings | null) => Partial<PatientSettings>);
const mockApp = {
  settings: null as PatientSettings | null,
  updateSettings: jest.fn(async (_p: Mudanca) => undefined),
  license: null,
  profile: { id: 'u1', buyer_name: 'Maria Souza', email: 'maria@exemplo.com', phone: null },
  patient: { id: 'b1', user_name: 'Carlos Souza' },
  plan: null,
  subscription: null,
  signOut: jest.fn(async () => undefined),
  devices: [],
  patientLoaded: true,
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

function ajustes(extra: Partial<PatientSettings> = {}): PatientSettings {
  return {
    beneficiary_id: 'b1',
    dwell_ms: 1500,
    filter_preset: 'balanceado',
    keyboard_layout: null,
    sensitivity: null,
    voice: 'pt-BR padrão',
    emergency_timeout_s: 45,
    emergency_contacts: [],
    updated_at: '2026-09-23T12:00:00Z',
    ...extra,
  };
}

beforeEach(() => {
  mockApp.settings = ajustes();
  mockApp.updateSettings.mockClear();
});

describe('Ajustes', () => {
  it('teclado e sensibilidade aparecem "Em breve", desligados, e tocar não grava nada', async () => {
    mockApp.settings = ajustes({ keyboard_layout: 'qwerty', sensitivity: 7 });
    await render(<Ajustes />);

    expect(screen.getAllByText('Em breve')).toHaveLength(2);
    expect(screen.getAllByText(/O computador ainda não aplica este ajuste/)).toHaveLength(2);

    const qwerty = screen.getByLabelText('QWERTY');
    expect(qwerty).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true, selected: false }));
    await fireEvent.press(qwerty);

    const nivel7 = screen.getByLabelText('Nível 7 de 10');
    expect(nivel7).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true, selected: false }));
    await fireEvent.press(nivel7);

    expect(mockApp.updateSettings).not.toHaveBeenCalled();
    // O valor antigo gravado por versões anteriores não aparece como se valesse.
    expect(screen.queryByText(/Nível 7 de 10\./)).toBeNull();
  });

  it('tempo de fixação e suavização continuam gravando', async () => {
    await render(<Ajustes />);

    await fireEvent.press(screen.getByLabelText('800 milissegundos, rápido'));
    await waitFor(() => expect(mockApp.updateSettings).toHaveBeenCalledWith({ dwell_ms: 800 }));

    await fireEvent.press(screen.getByLabelText('Estável'));
    await waitFor(() => expect(mockApp.updateSettings).toHaveBeenCalledWith({ filter_preset: 'estavel' }));
  });

  it('"Ainda não sincronizado" olha só para o que o computador aplica (fixação e suavização)', async () => {
    // Linha com teclado e sensibilidade gravados (app antigo), sem fixação nem suavização.
    mockApp.settings = ajustes({ dwell_ms: null, filter_preset: null, keyboard_layout: 'qwerty', sensitivity: 7 });
    const { unmount } = await render(<Ajustes />);
    expect(screen.getByText('Ainda não sincronizado')).toBeTruthy();
    await unmount();

    mockApp.settings = ajustes({ dwell_ms: 800, filter_preset: null });
    await render(<Ajustes />);
    expect(screen.queryByText('Ainda não sincronizado')).toBeNull();
  });

  // APP-7: a lista era montada a partir da DESTA tela e gravada inteira; um
  // contato que outro celular tinha acabado de cadastrar sumia.
  describe('contatos de emergência sem apagar o do outro celular', () => {
    const lucas = { name: 'Lucas (filho)', phone: '11911111111' };
    const joao = { name: 'João (vizinho)', phone: '11922222222' };
    const marta = { name: 'Marta (irmã)', phone: '11933333333' };

    it('adicionar grava uma MUDANÇA sobre a lista do servidor, não a lista da tela', async () => {
      mockApp.settings = ajustes({ emergency_contacts: [lucas] });
      await render(<Ajustes />);

      await fireEvent.press(screen.getByText('Adicionar contato'));
      await fireEvent.changeText(screen.getByPlaceholderText('Ex.: Lucas, filho'), marta.name);
      await fireEvent.changeText(screen.getByPlaceholderText('Ex.: 11 91234-5678'), '11 93333-3333');
      await fireEvent.press(screen.getByText('Salvar'));

      await waitFor(() => expect(mockApp.updateSettings).toHaveBeenCalledTimes(1));
      const mudanca = mockApp.updateSettings.mock.calls[0][0];
      expect(typeof mudanca).toBe('function');
      // Aplicada sobre o que o servidor tem agora (outro celular pôs o João):
      const noServidor = ajustes({ emergency_contacts: [lucas, joao] });
      expect((mudanca as (a: PatientSettings) => Partial<PatientSettings>)(noServidor).emergency_contacts).toEqual([lucas, joao, marta]);
    });

    it('remover tira só aquele contato da lista do servidor', async () => {
      mockApp.settings = ajustes({ emergency_contacts: [lucas, marta] });
      const alerta = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, botoes) => {
        botoes?.find((b) => b.style === 'destructive')?.onPress?.();
      });
      try {
        await render(<Ajustes />);
        await fireEvent.press(screen.getByLabelText('Remover Lucas (filho) dos contatos de emergência'));

        await waitFor(() => expect(mockApp.updateSettings).toHaveBeenCalledTimes(1));
        const mudanca = mockApp.updateSettings.mock.calls[0][0] as (a: PatientSettings) => Partial<PatientSettings>;
        expect(mudanca(ajustes({ emergency_contacts: [joao, lucas, marta] })).emergency_contacts).toEqual([joao, marta]);
      } finally {
        alerta.mockRestore();
      }
    });
  });

  it('prazo: enquanto uma gravação não volta, "+" e "−" esperam (o próximo passo parte do valor confirmado)', async () => {
    let soltar: () => void = () => undefined;
    mockApp.updateSettings.mockImplementationOnce(() => new Promise<undefined>((r) => (soltar = () => r(undefined))));
    await render(<Ajustes />);

    await fireEvent.press(screen.getByLabelText('Aumentar prazo, agora 45 segundos'));
    expect(mockApp.updateSettings).toHaveBeenCalledWith({ emergency_timeout_s: 60 });
    expect(screen.getByLabelText('Aumentar prazo, agora 45 segundos')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByLabelText('Aumentar prazo, agora 45 segundos'));
    expect(mockApp.updateSettings).toHaveBeenCalledTimes(1);

    await act(async () => soltar());
    await waitFor(() => expect(screen.getByLabelText('Aumentar prazo, agora 45 segundos')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: false })));
  });
});
