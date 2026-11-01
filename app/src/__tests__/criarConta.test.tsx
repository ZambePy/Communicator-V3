/**
 * Criar conta no app (31/10/2026): os três passos, com o provedor falso.
 *  1. nome, e-mail e senha (com a validação na tela e o e-mail que já tem conta);
 *  2. os 4 números do e-mail (código errado, bloqueio, reenviar com contagem);
 *  3. para quem é (beta fechada).
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CriarConta from '../../app/(auth)/criar-conta';
import { CadastroFechado, CodigoBloqueado, CodigoIncorreto, EmailJaCadastrado } from '@/data/types';
import { ESPERA_DO_REENVIO_S, relogio } from '@/utils/cadastro';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn(), canGoBack: () => true }) }));

const mockApp = {
  cadastrar: jest.fn(async (_n: unknown) => 'confirmar' as 'confirmar' | 'sessao'),
  confirmarCodigo: jest.fn(async (_e: string, _c: string, _s?: string) => undefined),
  reenviarCodigo: jest.fn(async (_e: string) => undefined),
  completarCadastro: jest.fn(async (_d: unknown) => undefined),
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

beforeEach(() => {
  for (const f of Object.values(mockApp)) f.mockClear();
  mockApp.cadastrar.mockImplementation(async () => 'confirmar');
  mockReplace.mockClear();
});

async function preencherPasso1(email = 'ana.souza@gmail.com', senha = 'segredo123') {
  await fireEvent.changeText(screen.getByLabelText('Seu nome'), 'Ana Souza');
  await fireEvent.changeText(screen.getByLabelText('E-mail'), email);
  await fireEvent.changeText(screen.getByLabelText('Senha'), senha);
  await fireEvent.press(screen.getByText('Continuar'));
}

describe('Criar conta, passo 1', () => {
  it('mostra o passo, os campos e os termos com links', async () => {
    await render(<CriarConta />);
    expect(screen.getByText('Passo 1 de 3')).toBeTruthy();
    expect(screen.getByText('Crie sua conta')).toBeTruthy();
    expect(screen.getByText('Termos')).toBeTruthy();
    expect(screen.getByText('Política de privacidade')).toBeTruthy();
  });

  it('não envia com campos inválidos e diz o que corrigir', async () => {
    await render(<CriarConta />);
    await preencherPasso1('ana@', '123');
    expect(mockApp.cadastrar).not.toHaveBeenCalled();
    expect(screen.getByText('Confira o e-mail.')).toBeTruthy();
    expect(screen.getByText('Use pelo menos 8 caracteres.')).toBeTruthy();
  });

  it('e-mail que já tem conta: avisa e leva ao login com ele', async () => {
    mockApp.cadastrar.mockRejectedValueOnce(new EmailJaCadastrado());
    await render(<CriarConta />);
    await preencherPasso1();
    await waitFor(() => expect(screen.getByText('Este e-mail já tem conta.')).toBeTruthy());
    await fireEvent.press(screen.getByText('Entrar com este e-mail'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/login', params: { email: 'ana.souza@gmail.com' } });
  });

  it('sem internet: frase em português, sem texto técnico', async () => {
    mockApp.cadastrar.mockRejectedValueOnce(new Error('TypeError: Network request failed'));
    await render(<CriarConta />);
    await preencherPasso1();
    await waitFor(() => expect(screen.getByText('Sem internet no momento. Confira a conexão e tente de novo.')).toBeTruthy());
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });
});

describe('Criar conta, passo 2 (código)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('código certo abre o passo 3; a senha do passo 1 vai junto', async () => {
    await render(<CriarConta />);
    await preencherPasso1();
    await waitFor(() => expect(screen.getByText('Confira seu e-mail')).toBeTruthy());
    expect(screen.getByText('Passo 2 de 3')).toBeTruthy();
    expect(screen.getByText(/ana\.souza@gmail\.com/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('campo-do-codigo'), '4821');
    await waitFor(() => expect(mockApp.confirmarCodigo).toHaveBeenCalledWith('ana.souza@gmail.com', '4821', 'segredo123'));
    await waitFor(() => expect(screen.getByText('Para quem é o IrisFlow?')).toBeTruthy());
    expect(screen.getByText('Passo 3 de 3')).toBeTruthy();
  });

  it('código errado: limpa e explica; dá para tentar de novo', async () => {
    mockApp.confirmarCodigo.mockRejectedValueOnce(new CodigoIncorreto());
    await render(<CriarConta />);
    await preencherPasso1();
    await fireEvent.changeText(screen.getByTestId('campo-do-codigo'), '0000');
    await waitFor(() => expect(screen.getByTestId('erro-do-codigo').props.children).toBe('Código errado. Confira os 4 números no e-mail.'));
    expect(screen.getByTestId('campo-do-codigo').props.value).toBe('');
    expect(screen.getByTestId('campo-do-codigo').props.editable).toBe(true);
  });

  it('muitas tentativas (P0429): bloqueia o campo', async () => {
    mockApp.confirmarCodigo.mockRejectedValueOnce(new CodigoBloqueado());
    await render(<CriarConta />);
    await preencherPasso1();
    await fireEvent.changeText(screen.getByTestId('campo-do-codigo'), '1111');
    await waitFor(() => expect(screen.getByText(/Muitas tentativas com o código errado/)).toBeTruthy());
    expect(screen.getByTestId('campo-do-codigo').props.editable).toBe(false);
  });

  it('mandar de novo só depois da contagem', async () => {
    expect(relogio(42)).toBe('0:42');
    await render(<CriarConta />);
    await preencherPasso1();
    await waitFor(() => expect(screen.getByText(`mande de novo em ${relogio(ESPERA_DO_REENVIO_S)}`)).toBeTruthy());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText(`mande de novo em ${relogio(ESPERA_DO_REENVIO_S - 1)}`)).toBeTruthy();
    for (let i = 0; i < ESPERA_DO_REENVIO_S; i++) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1_000);
      });
    }
    await fireEvent.press(screen.getByText('mande de novo'));
    await waitFor(() => expect(mockApp.reenviarCodigo).toHaveBeenCalledWith('ana.souza@gmail.com'));
    expect(screen.getByText('Mandamos de novo.')).toBeTruthy();
  });
});

describe('Criar conta, passo 3 (a pessoa)', () => {
  async function irAoPasso3() {
    mockApp.cadastrar.mockResolvedValueOnce('sessao');
    await render(<CriarConta />);
    await preencherPasso1();
    await waitFor(() => expect(screen.getByText('Para quem é o IrisFlow?')).toBeTruthy());
  }

  it('grava nome, relação e condição e leva ao início', async () => {
    await irAoPasso3();
    await fireEvent.changeText(screen.getByLabelText('Como você chama essa pessoa'), 'Carlos');
    await fireEvent.press(screen.getByLabelText('Cônjuge'));
    await fireEvent.press(screen.getByLabelText('ELA'));
    await fireEvent.press(screen.getByText('Pronto, entrar no app'));
    await waitFor(() => expect(mockApp.completarCadastro).toHaveBeenCalledWith({ userName: 'Carlos', relation: 'conjuge', condition: 'ela' }));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('condição é opcional (tocar de novo desmarca); relação é obrigatória', async () => {
    await irAoPasso3();
    await fireEvent.changeText(screen.getByLabelText('Como você chama essa pessoa'), 'Vó');
    await fireEvent.press(screen.getByLabelText('AVC'));
    await fireEvent.press(screen.getByLabelText('AVC'));
    await fireEvent.press(screen.getByText('Pronto, entrar no app'));
    expect(mockApp.completarCadastro).not.toHaveBeenCalled();
    expect(screen.getByText('Escolha uma opção.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mãe ou pai'));
    await fireEvent.press(screen.getByText('Pronto, entrar no app'));
    await waitFor(() => expect(mockApp.completarCadastro).toHaveBeenCalledWith({ userName: 'Vó', relation: 'pai-mae', condition: null }));
  });

  it('beta fechada: mostra a frase do servidor e não sai da tela', async () => {
    mockApp.completarCadastro.mockRejectedValueOnce(new CadastroFechado('As inscrições da beta estão fechadas no momento.'));
    await irAoPasso3();
    await fireEvent.changeText(screen.getByLabelText('Como você chama essa pessoa'), 'Carlos');
    await fireEvent.press(screen.getByLabelText('Outro'));
    await fireEvent.press(screen.getByText('Pronto, entrar no app'));
    await waitFor(() => expect(screen.getByText('As inscrições da beta estão fechadas no momento.')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
