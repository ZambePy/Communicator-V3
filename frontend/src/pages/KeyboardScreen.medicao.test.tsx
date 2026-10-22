import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { KeyboardScreen } from './KeyboardScreen';
import { SettingsProvider } from '../context/SettingsContext';

// A velocidade de escrita da evolução semanal sai daqui (21/10/2026): o
// teclado do olhar avisa o medidor a cada letra que entra, e só a ela. Os
// números e as regras estão em `registroDeUso` e `useMedidorDeDigitacao`; este
// teste só confere que a tela está LIGADA a eles.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()), isComposing: false, setIsComposing: vi.fn() }),
  useIsDwelling: () => false,
}));

// Uma frase curta e pronta, como as que o assistente mais oferece: 17 caracteres
// em um toque. Rodada 1 da revisão: ela NÃO pode contar como digitação.
vi.mock('../services/assistente', async (original) => ({
  ...(await original<typeof import('../services/assistente')>()),
  sugerirFrases: () => [{ texto: 'Preciso de ajuda', origem: 'frequente' as const }],
}));

const registrarDigitacao = vi.fn();
vi.mock('../services/evolucao/registroDeUso', () => ({
  registrarDigitacao: (...a: unknown[]) => registrarDigitacao(...a),
}));

describe('KeyboardScreen alimenta o medidor de digitação', () => {
  beforeEach(() => {
    sessionStorage.clear();
    registrarDigitacao.mockClear();
  });

  const montar = () =>
    render(
      <BrowserRouter>
        <SettingsProvider>
          <KeyboardScreen />
        </SettingsProvider>
      </BrowserRouter>,
    );

  it('uma letra digitada conta 1 caractere; abrir a tela e apagar não contam', () => {
    montar();
    expect(registrarDigitacao).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('A B C'));
    fireEvent.click(screen.getByText('C'));
    expect(registrarDigitacao).toHaveBeenCalledTimes(1);
    expect(registrarDigitacao).toHaveBeenCalledWith(1, expect.any(Number));

    fireEvent.click(screen.getByText('Y Z'));
    fireEvent.click(screen.getByText('Apagar'));
    expect(registrarDigitacao).toHaveBeenCalledTimes(1);
  });

  it('uma frase pronta CURTA tocada na sugestão não é digitação; a palavra sugerida e a letra seguinte são', () => {
    montar();
    // Abre o grupo de sugestões (a prévia diz que há uma frase lá dentro) e toca nela.
    fireEvent.click(screen.getByText('+ 1 frase'));
    expect(screen.getByText('frase inteira')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Preciso de ajuda'));
    expect(registrarDigitacao).not.toHaveBeenCalled();

    // A frase entrou no texto (o teclado voltou ao primeiro nível): uma letra conta.
    fireEvent.click(screen.getByText('A B C'));
    fireEvent.click(screen.getByText('C'));
    expect(registrarDigitacao).toHaveBeenCalledTimes(1);
    expect(registrarDigitacao).toHaveBeenCalledWith(1, expect.any(Number));
  });

  it('uma palavra sugerida (digitação com atalho) conta pelo que acrescentou', () => {
    montar();
    fireEvent.click(screen.getByText('+ 1 frase'));
    // `SIM` é uma das palavras padrão: entra com o espaço depois dela.
    fireEvent.click(screen.getByText('SIM'));
    expect(registrarDigitacao).toHaveBeenCalledTimes(1);
    expect(registrarDigitacao).toHaveBeenCalledWith('SIM '.length, expect.any(Number));
  });

  it('o rascunho da sessão que a tela recupera ao abrir não é digitação', () => {
    sessionStorage.setItem('irisflow.rascunhoDoTeclado', 'Bom dia');
    montar();
    expect(registrarDigitacao).not.toHaveBeenCalled();
  });
});
