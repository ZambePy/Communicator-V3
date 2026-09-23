/**
 * Tela de Ajustes: nenhum controle pode fingir que muda o computador do
 * paciente. Fixação e suavização o desktop aplica (e continuam gravando);
 * teclado e sensibilidade ainda não — aparecem desligados, com "Em breve",
 * e tocar neles não grava nada.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Ajustes from '../../app/(tabs)/ajustes';
import type { PatientSettings } from '@/data/types';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockApp = {
  settings: null as PatientSettings | null,
  updateSettings: jest.fn(async (_p: Partial<PatientSettings>) => undefined),
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
});
