/**
 * Início: alvos de toque. Revisão de UX de 19/10/2026 (achado 19): a frase do
 * estado do computador é tocável (abre o perfil, ou tenta de novo quando a
 * carga falhou) e tinha 36 dp de altura — abaixo do mínimo de 48 dp do app.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Home from '../../app/(tabs)/index';
import type { Device } from '@/data/types';
import { sizes } from '@/theme';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const computador = {
  id: 'd1',
  beneficiary_id: 'b1',
  name: 'Computador da sala',
  os: 'windows',
  app_version: '',
  last_seen_at: new Date().toISOString(),
  online: true,
  camera_ok: true,
  tracker_ok: true,
  calibrated: true,
  revoked_at: null,
  paired_at: null,
  hostname: null,
} as unknown as Device;

const mockApp = {
  profile: { id: 'u1', buyer_name: 'Maria Souza', email: 'maria@exemplo.com', phone: null },
  patient: { id: 'b1', user_name: 'Carlos Souza' },
  devices: [computador] as Device[],
  session: null,
  helpRequests: [],
  messages: [] as unknown[],
  unreadCount: 0,
  refresh: jest.fn(async () => undefined),
  sendMessage: jest.fn(async () => undefined),
  plan: null,
  subscription: null,
  license: null,
  patientLoaded: true,
  patientVerified: true,
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

const alturaMinima = (rotulo: RegExp) => StyleSheet.flatten(screen.getByLabelText(rotulo).props.style).minHeight as number;

beforeEach(() => {
  mockApp.messages = [];
  mockApp.sendMessage.mockClear();
  mockApp.devices = [computador];
  mockApp.patientVerified = true;
  mockApp.refresh.mockClear();
  mockPush.mockClear();
});

describe('Início', () => {
  it('o estado do computador abre o perfil, com alvo de toque de pelo menos 48 dp', async () => {
    await render(<Home />);
    expect(alturaMinima(/^Computador ligado\. Abrir o perfil de Carlos$/)).toBeGreaterThanOrEqual(sizes.touch);
    await fireEvent.press(screen.getByLabelText(/^Computador ligado\. Abrir o perfil de Carlos$/));
    expect(mockPush).toHaveBeenCalledWith('/paciente');
  });

  it('sem atualização (carga falhou): "Toque para tentar de novo" também tem 48 dp e tenta de novo', async () => {
    mockApp.devices = [];
    mockApp.patientVerified = false;
    await render(<Home />);
    expect(alturaMinima(/^Sem atualização agora\. Toque para tentar de novo$/)).toBeGreaterThanOrEqual(sizes.touch);
    await fireEvent.press(screen.getByLabelText(/^Sem atualização agora\. Toque para tentar de novo$/));
    expect(mockApp.refresh).toHaveBeenCalled();
  });

  // 31/10/2026: "está tudo bem com Carlos?" numa olhada.
  it('a última frase em letra grande, com as respostas de um toque que enviam na hora', async () => {
    mockApp.messages = [
      { id: 'm1', beneficiary_id: 'b1', sender: 'paciente', kind: 'texto', text: 'Quero ver o jogo hoje.', created_at: new Date(Date.now() - 60 * 60_000).toISOString(), read_at: null, spoken: true },
      { id: 'm2', beneficiary_id: 'b1', sender: 'paciente', kind: 'texto', text: 'Estou com sede.', created_at: new Date().toISOString(), read_at: null, spoken: true },
    ];
    await render(<Home />);
    expect(screen.getByTestId('ultima-frase').props.children).toBe('Estou com sede.');
    expect(screen.getByText('Mais cedo')).toBeTruthy();
    expect(screen.getByText('Quero ver o jogo hoje.')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy(); // frases hoje
    await fireEvent.press(screen.getByLabelText('Responder “Já estou indo” para Carlos'));
    expect(mockApp.sendMessage).toHaveBeenCalledWith('Já estou indo', 'frase');
    expect(screen.getByTestId('estado-da-resposta').props.children).toBe('Enviado para Carlos.');
  });

  it('relatórios saíram da barra: o Início leva até eles; o ícone do topo abre Meu perfil', async () => {
    await render(<Home />);
    await fireEvent.press(screen.getByLabelText('Ver relatórios'));
    expect(mockPush).toHaveBeenCalledWith('/relatorios');
    await fireEvent.press(screen.getByLabelText('Meu perfil'));
    expect(mockPush).toHaveBeenCalledWith('/perfil');
  });

  it('sem números técnicos (px, erro de calibração) no resumo', async () => {
    await render(<Home />);
    expect(screen.queryByText(/\bpx\b/)).toBeNull();
    expect(screen.queryByText(/calibra/i)).toBeNull();
    expect(screen.getByText('Pedidos de ajuda hoje')).toBeTruthy();
    expect(screen.getByText('Nenhum')).toBeTruthy();
  });
});
