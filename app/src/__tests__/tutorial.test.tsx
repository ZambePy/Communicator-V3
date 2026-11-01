/**
 * Tutorial da primeira abertura (31/10/2026): três telas, "Pular" vai para a
 * última, a última leva a criar conta ou entrar, e depois de visto ele não
 * volta — sem conta, a abertura cai no login.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Onboarding from '../../app/onboarding';
import Index from '../../app/index';
import { _esquecerTutorial, CHAVE_DO_TUTORIAL, marcarTutorialVisto, tutorialJaVisto } from '@/lib/tutorial';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Redirect: ({ href }: { href: string }) => {
    const { Text: T } = require('react-native');
    return <T testID="redirect">{href}</T>;
  },
}));
const mockApp = { ready: true, user: null as null | { id: string } };
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

beforeEach(async () => {
  mockPush.mockClear();
  mockApp.user = null;
  _esquecerTutorial();
  await AsyncStorage.clear();
});

describe('Tutorial', () => {
  it('começa na mensagem chegando, com Continuar e Pular', async () => {
    await render(<Onboarding />);
    expect(screen.getByText('O que a pessoa escreve com o olhar chega aqui.')).toBeTruthy();
    expect(screen.getByText('Continuar')).toBeTruthy();
    expect(screen.getByText('Pular')).toBeTruthy();
    expect(screen.getByLabelText('Tela 1 de 3')).toBeTruthy();
  });

  it('a tela do meio mostra as respostas de um toque sendo faladas no computador', async () => {
    await render(<Onboarding />);
    await fireEvent.press(screen.getByText('Continuar'));
    expect(screen.getByLabelText('Tela 2 de 3')).toBeTruthy();
    expect(screen.getByText('Um toque para responder.')).toBeTruthy();
    expect(screen.getAllByText('Falado na tela').length).toBeGreaterThan(0);
  });

  it('"Pular" vai para a última tela, com Criar minha conta e Já tenho conta', async () => {
    await render(<Onboarding />);
    await fireEvent.press(screen.getByText('Pular'));
    expect(screen.getByLabelText('Tela 3 de 3')).toBeTruthy();
    expect(screen.getByText('Criar minha conta')).toBeTruthy();
    expect(screen.getByText('Já tenho conta')).toBeTruthy();
    expect(screen.queryByText('Pular')).toBeNull();
  });

  it('"Criar minha conta" abre o cadastro no app e marca o tutorial como visto', async () => {
    await render(<Onboarding />);
    await fireEvent.press(screen.getByText('Pular'));
    await fireEvent.press(screen.getByText('Criar minha conta'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/criar-conta');
    await waitFor(async () => expect(await AsyncStorage.getItem(CHAVE_DO_TUTORIAL)).toBe('1'));
  });

  it('"Já tenho conta" abre o login', async () => {
    await render(<Onboarding />);
    await fireEvent.press(screen.getByText('Pular'));
    await fireEvent.press(screen.getByText('Já tenho conta'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login');
  });
});

describe('o tutorial aparece uma vez só', () => {
  it('primeira abertura sem conta: tutorial', async () => {
    await render(<Index />);
    await waitFor(() => expect(screen.getByTestId('redirect').props.children).toBe('/onboarding'));
  });

  it('depois de visto: a abertura sem conta vai direto ao login', async () => {
    await marcarTutorialVisto();
    _esquecerTutorial(); // como numa nova abertura do app: lê do armazenamento
    expect(await tutorialJaVisto()).toBe(true);
    await render(<Index />);
    await waitFor(() => expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/login'));
  });

  it('com conta, o início', async () => {
    mockApp.user = { id: 'u1' };
    await render(<Index />);
    await act(async () => undefined);
    expect(screen.getByTestId('redirect').props.children).toBe('/(tabs)');
  });
});

