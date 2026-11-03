/**
 * Tela de login sem nenhum resquício de modo demonstração:
 *  - em desenvolvimento (`__DEV__`, Expo Go / dev client) os campos já vêm com
 *    a conta de teste REAL da beta (`CONTA_DE_TESTE`) — sem aviso nem botão extra;
 *  - em build de produção, vazios;
 *  - "Entrar" passa pelo login de verdade (AppProvider → Supabase).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Login from '../../app/(auth)/login';
import { CONTA_DE_TESTE } from '@/lib/config';

const mockApp = {
  signIn: jest.fn(async (_e: string, _s: string) => undefined),
  requestPasswordReset: jest.fn(async (_e: string) => undefined),
  error: null as string | null,
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));

const devOriginal = (global as unknown as { __DEV__: boolean }).__DEV__;
function definirDev(v: boolean) {
  (global as unknown as { __DEV__: boolean }).__DEV__ = v;
}

beforeEach(() => {
  mockParams = {};
  mockPush.mockClear();
  mockApp.signIn.mockClear();
  mockApp.requestPasswordReset.mockClear();
  mockApp.error = null;
});

afterAll(() => definirDev(devOriginal));

describe('Login', () => {
  it('em desenvolvimento vem preenchido com a conta de teste real', async () => {
    definirDev(true);
    await render(<Login />);
    expect(screen.getByDisplayValue(CONTA_DE_TESTE.email)).toBeTruthy();
    expect(screen.getByDisplayValue(CONTA_DE_TESTE.senha)).toBeTruthy();
    // Vem do ambiente (em `jest.setup.js`, valores falsos), nunca do código.
    expect(CONTA_DE_TESTE).toEqual({ email: 'conta.de.teste@exemplo.com', senha: 'senha-falsa-de-teste' });
  });

  it('em produção os campos ficam vazios', async () => {
    definirDev(false);
    await render(<Login />);
    expect(screen.queryByDisplayValue(CONTA_DE_TESTE.email)).toBeNull();
    expect(screen.queryByDisplayValue(CONTA_DE_TESTE.senha)).toBeNull();
  });

  it('não tem texto de demonstração nem botão de "modo teste"', async () => {
    definirDev(true);
    await render(<Login />);
    expect(screen.queryByText(/demonstra|modo teste|dados de exemplo|simulad/i)).toBeNull();
  });

  it('"Entrar" chama o login de verdade com o que está nos campos', async () => {
    definirDev(true);
    await render(<Login />);
    await fireEvent.press(screen.getByText('Entrar'));
    await waitFor(() => expect(mockApp.signIn).toHaveBeenCalledWith(CONTA_DE_TESTE.email, CONTA_DE_TESTE.senha));
  });

  it('erro do login aparece em linguagem de gente', async () => {
    definirDev(true);
    mockApp.signIn.mockRejectedValueOnce(new Error('TypeError: Network request failed'));
    await render(<Login />);
    await fireEvent.press(screen.getByText('Entrar'));
    await waitFor(() => expect(screen.getByText(/Sem internet no momento/)).toBeTruthy());
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  // 31/10/2026: a conta é criada dentro do app, não no site.
  it('"Criar conta" abre o cadastro no app (sem link para o site)', async () => {
    definirDev(false);
    await render(<Login />);
    expect(screen.queryByText(/Inscreva-se na beta/)).toBeNull();
    await fireEvent.press(screen.getByText('Criar conta'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/criar-conta');
  });

  it('vindo do cadastro com e-mail que já tem conta, o e-mail vem preenchido e a senha vazia', async () => {
    definirDev(true);
    mockParams = { email: 'ana@exemplo.com.br' };
    await render(<Login />);
    expect(screen.getByDisplayValue('ana@exemplo.com.br')).toBeTruthy();
    expect(screen.queryByDisplayValue(CONTA_DE_TESTE.senha)).toBeNull();
  });
});
