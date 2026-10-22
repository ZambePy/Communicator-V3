/**
 * Tela `irisflow://parear?t=…` (19/10/2026): o celular entra na conta pelo
 * código QR do computador — só depois do toque, nunca sozinho; e um celular
 * que já está numa conta não troca de conta por aqui.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';
import Parear, { ESPERA_ANTES_DO_INICIO_MS } from '../../app/parear';
import { MENSAGENS } from '@/lib/pareamento';

const CODIGO = 'Qx7_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB';

const mockApp = {
  ready: true,
  user: null as { id: string; email: string } | null,
  patient: null as { user_name: string } | null,
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

const mockRouter = { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) };
const mockParams: { t?: string | string[] } = {};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));

const mockSb = {
  functions: { invoke: jest.fn() },
  auth: { verifyOtp: jest.fn() },
  rpc: jest.fn(),
};
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockSb }));

beforeEach(() => {
  Object.assign(mockApp, { ready: true, user: null, patient: null });
  mockParams.t = CODIGO;
  Object.values(mockRouter).forEach((f) => f.mockClear());
  mockRouter.canGoBack.mockImplementation(() => true);
  mockSb.functions.invoke.mockReset().mockResolvedValue({
    data: { ok: true, token_hash: 'hash-do-link', tipo: 'magiclink', pareamento_id: 'par-1', paciente: 'Maria' },
    error: null,
  });
  mockSb.auth.verifyOtp.mockReset().mockImplementation(async () => {
    // O que o AppProvider faria ao receber o SIGNED_IN do supabase-js.
    mockApp.user = { id: 'u1', email: 'familia@exemplo.com' };
    return { data: { session: {} }, error: null };
  });
  mockSb.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

describe('Parear', () => {
  it('não usa o código sozinho: pergunta antes', async () => {
    await render(<Parear />);
    expect(screen.getByText('Conectar este celular?')).toBeTruthy();
    expect(screen.getByText(/Continue só se foi você quem apontou a câmera/)).toBeTruthy();
    expect(mockSb.functions.invoke).not.toHaveBeenCalled();
  });

  it('"Conectar este celular": entra, avisa o computador e segue para o início', async () => {
    jest.useFakeTimers();
    try {
      await render(<Parear />);
      await act(async () => {
        fireEvent.press(screen.getByText('Conectar este celular'));
      });
      expect(mockSb.functions.invoke).toHaveBeenCalledWith('parear-celular', { body: { codigo: CODIGO } });
      expect(mockSb.auth.verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash-do-link' });
      expect(mockSb.rpc).toHaveBeenCalledWith('confirmar_celular_conectado', { p_pareamento: 'par-1' });
      expect(screen.getByText('Pronto, este celular está conectado')).toBeTruthy();
      expect(screen.getByText(/Agora ele recebe os avisos de Maria/)).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(ESPERA_ANTES_DO_INICIO_MS + 10);
      });
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    } finally {
      jest.useRealTimers();
    }
  });

  it('código que não vale mais: diz para gerar outro e continua sem conta', async () => {
    mockSb.functions.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError({ status: 400, json: async () => ({ error: 'codigo_invalido' }) }),
    });
    await render(<Parear />);
    await act(async () => {
      fireEvent.press(screen.getByText('Conectar este celular'));
    });
    expect(screen.getByTestId('parear-erro')).toBeTruthy();
    expect(screen.getByText(MENSAGENS.codigo)).toBeTruthy();
    expect(mockSb.auth.verifyOtp).not.toHaveBeenCalled();
    expect(mockApp.user).toBeNull();
    // Dá para tentar de novo (com um código novo) sem sair da tela.
    expect(screen.getByText('Conectar este celular')).toBeTruthy();
  });

  it('celular que já está numa conta não troca de conta por aqui', async () => {
    mockApp.user = { id: 'outra', email: 'x@exemplo.com' };
    mockApp.patient = { user_name: 'João' };
    await render(<Parear />);
    expect(screen.getByText('Este celular já está conectado')).toBeTruthy();
    expect(screen.getByText(/Ele já recebe os avisos de João\. Para entrar em outra conta, saia em Ajustes/)).toBeTruthy();
    expect(screen.queryByText('Conectar este celular')).toBeNull();
    expect(mockSb.functions.invoke).not.toHaveBeenCalled();
  });

  it('link sem código válido: explica onde gerar o código e oferece o login', async () => {
    mockParams.t = 'nao-e-um-codigo';
    await render(<Parear />);
    expect(screen.getByText('Este link não tem um código válido')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Entrar com e-mail e senha'));
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login');
    expect(mockSb.functions.invoke).not.toHaveBeenCalled();
  });

  it('"Agora não" volta sem usar o código', async () => {
    await render(<Parear />);
    await act(async () => {
      fireEvent.press(screen.getByText('Agora não'));
    });
    expect(mockRouter.back).toHaveBeenCalled();
    mockRouter.canGoBack.mockImplementation(() => false);
    await act(async () => {
      fireEvent.press(screen.getByText('Agora não'));
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockSb.functions.invoke).not.toHaveBeenCalled();
  });

  it('enquanto a sessão guardada é lida, espera em vez de decidir', async () => {
    mockApp.ready = false;
    await render(<Parear />);
    expect(screen.getByText('Abrindo…')).toBeTruthy();
    expect(screen.queryByText('Conectar este celular')).toBeNull();
  });
});
