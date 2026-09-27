/**
 * Conversa: só marca como lida o que o cuidador está vendo (APP-8), e a
 * mensagem que chega atrasada da fila offline entra na ordem certa, com
 * rótulos de dia que não repetem a chave (APP-10).
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import Conversa from '../../app/(tabs)/conversa';
import type { Message } from '@/data/types';
import { agruparPorDia } from '@/utils/conversa';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    // Aba em foco durante o teste.
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
  };
});

const mockApp = {
  patient: { id: 'b1', user_name: 'Carlos Souza' },
  messages: [] as Message[],
  sendMessage: jest.fn(async () => undefined),
  markRead: jest.fn(async () => undefined),
  session: null,
  devices: [],
  unreadCount: 0,
  patientLoaded: true,
  patientVerified: true,
  refresh: jest.fn(async () => undefined),
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

const msg = (id: string, created_at: string, extra: Partial<Message> = {}): Message => ({ id, beneficiary_id: 'b1', sender: 'paciente', kind: 'texto', text: `texto ${id}`, created_at, read_at: null, spoken: false, ...extra });

const estadoOriginal = AppState.currentState;
function definirEstado(e: string) {
  (AppState as unknown as { currentState: string }).currentState = e;
}
const ouvintes = () => (AppState.addEventListener as jest.Mock).mock.calls.filter((c) => c[0] === 'change').map((c) => c[1] as (e: string) => void);

beforeEach(() => {
  (AppState.addEventListener as jest.Mock).mockClear();
  mockApp.markRead.mockClear();
  mockApp.messages = [];
  mockApp.unreadCount = 0;
  mockApp.patientVerified = true;
  definirEstado('active');
});

afterAll(() => {
  (AppState as unknown as { currentState: unknown }).currentState = estadoOriginal;
});

describe('Conversa — marcar como lida', () => {
  it('aba aberta e app na frente: marca as novas como lidas', async () => {
    mockApp.messages = [msg('m1', new Date().toISOString())];
    mockApp.unreadCount = 1;
    await render(<Conversa />);
    expect(mockApp.markRead).toHaveBeenCalled();
  });

  it('app em segundo plano (celular no bolso): a mensagem nova NÃO vira lida', async () => {
    definirEstado('background');
    mockApp.messages = [msg('m1', new Date().toISOString())];
    mockApp.unreadCount = 1;
    await render(<Conversa />);
    expect(mockApp.markRead).not.toHaveBeenCalled();

    // O cuidador volta para o app com a Conversa aberta: agora sim.
    await act(async () => {
      ouvintes().forEach((f) => f('active'));
    });
    expect(mockApp.markRead).toHaveBeenCalledTimes(1);
  });

  it('sem nada novo, não chama o servidor à toa', async () => {
    await render(<Conversa />);
    expect(mockApp.markRead).not.toHaveBeenCalled();
  });
});

describe('Conversa — carga', () => {
  it('sem verificação, não diz "Nenhuma mensagem ainda"', async () => {
    mockApp.patientVerified = false;
    await render(<Conversa />);
    expect(screen.queryByText('Nenhuma mensagem ainda')).toBeNull();
    expect(screen.getByText('Não deu para carregar a conversa')).toBeTruthy();
  });
});

describe('agruparPorDia', () => {
  it('mensagem atrasada de ontem entra antes das de hoje, e as chaves não se repetem', () => {
    const hoje = new Date('2026-09-27T15:00:00');
    const linhas = agruparPorDia(
      [
        msg('ontem-22h', new Date('2026-09-26T22:00:00').toISOString()),
        msg('hoje-1', new Date('2026-09-27T09:00:00').toISOString()),
        msg('hoje-2', new Date('2026-09-27T09:05:00').toISOString()),
        msg('atrasada', new Date('2026-09-26T23:50:00').toISOString()),
      ],
      hoje,
    );
    expect(linhas.map((l) => (l.type === 'msg' ? l.message.id : `[${l.label}]`))).toEqual(['[' + (linhas[0] as { label: string }).label + ']', 'ontem-22h', 'atrasada', '[Hoje]', 'hoje-1', 'hoje-2']);
    const chaves = linhas.map((l) => l.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
