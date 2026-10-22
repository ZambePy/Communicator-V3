/**
 * Pedido de 18/10/2026: a barra de navegação do Android aparecia o tempo todo
 * por cima das abas. Ela tem que ficar escondida (o Android a mostra quando a
 * pessoa arrasta a borda de baixo), com os ícones na cor certa para o fundo.
 */
import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

const mockBarraDeNavegacao = jest.fn();
const mockBarraDeStatus = jest.fn();
jest.mock('expo-navigation-bar', () => ({
  NavigationBar: (props: Record<string, unknown>) => {
    mockBarraDeNavegacao(props);
    return null;
  },
}));
jest.mock('expo-status-bar', () => ({
  StatusBar: (props: Record<string, unknown>) => {
    mockBarraDeStatus(props);
    return null;
  },
}));

import { BarrasDoSistema } from './BarrasDoSistema';

describe('BarrasDoSistema', () => {
  const plataforma = Platform.OS;
  afterEach(() => {
    Platform.OS = plataforma;
    mockBarraDeNavegacao.mockClear();
    mockBarraDeStatus.mockClear();
  });

  it('no Android, esconde a barra de navegação', async () => {
    Platform.OS = 'android';
    await render(<BarrasDoSistema fundoEscuro={false} />);
    expect(mockBarraDeNavegacao).toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
  });

  it('ícones claros sobre fundo escuro e escuros sobre fundo claro, nas duas barras', async () => {
    Platform.OS = 'android';
    await render(<BarrasDoSistema fundoEscuro />);
    expect(mockBarraDeNavegacao).toHaveBeenLastCalledWith(expect.objectContaining({ style: 'light' }));
    expect(mockBarraDeStatus).toHaveBeenLastCalledWith(expect.objectContaining({ style: 'light' }));

    await render(<BarrasDoSistema fundoEscuro={false} />);
    expect(mockBarraDeNavegacao).toHaveBeenLastCalledWith(expect.objectContaining({ style: 'dark' }));
    expect(mockBarraDeStatus).toHaveBeenLastCalledWith(expect.objectContaining({ style: 'dark' }));
  });

  it('fora do Android não monta a barra de navegação', async () => {
    Platform.OS = 'ios';
    await render(<BarrasDoSistema fundoEscuro={false} />);
    expect(mockBarraDeNavegacao).not.toHaveBeenCalled();
    expect(mockBarraDeStatus).toHaveBeenCalled();
  });
});
