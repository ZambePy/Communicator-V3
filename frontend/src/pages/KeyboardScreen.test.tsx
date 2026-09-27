import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { KeyboardScreen } from './KeyboardScreen';
import { SettingsProvider } from '../context/SettingsContext';
import { BrowserRouter } from 'react-router-dom';

// Mock do i18next translation hook
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock do speech synthesis do browser
if (typeof window !== 'undefined') {
  window.speechSynthesis = {
    cancel: vi.fn(),
    speak: vi.fn(),
  } as any;
}

// Mock do hook useGaze para evitar loops de vídeo reais em ambiente de testes.
//
// `isDwelling` mudou de contexto: agora vem de `useIsDwelling()`, um
// provider separado. A separação existe porque o campo alterna várias vezes
// por segundo no teclado ocular, e enquanto ele estava nas deps do contexto
// principal cada alternância re-renderizava os onze consumidores — sendo esta
// tela (507 linhas) a mais cara delas.
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({
    subscribe: vi.fn(() => vi.fn()),
    isComposing: false,
    setIsComposing: vi.fn(),
  }),
  useIsDwelling: () => false,
}));

describe('KeyboardScreen — Varredura Hierárquica 2x3', () => {
  it('deve alternar para o layout hierárquico 2x3, navegar pelos subgrupos e digitar', () => {
    render(
      <BrowserRouter>
        <SettingsProvider>
          <KeyboardScreen />
        </SettingsProvider>
      </BrowserRouter>
    );

    // 1. Validar que o Top Level (6 blocos gigantes) foi renderizado
    const groupAE = screen.getByText('A B C'); // the top part of the label
    const groupZ = screen.getByText('Y Z');
    expect(groupAE).toBeInTheDocument();
    expect(groupZ).toBeInTheDocument();

    // 2. Clicar no grupo A - F para entrar nas letras
    fireEvent.click(groupAE);

    // 3. Validar que as letras do subgrupo A - F e o botão Voltar estão visíveis.
    //    Na barra superior em tela cheia o voltar é só a seta, identificada
    //    pelo aria-label — não há mais o rótulo textual "Voltar".
    const letterC = screen.getByText('C');
    const btnVoltar = screen.getByLabelText('Voltar');
    expect(letterC).toBeInTheDocument();
    expect(btnVoltar).toBeInTheDocument();

    // 4. Clicar na letra C para digitar e validar que retorna ao Top Level
    fireEvent.click(letterC);

    // A saída de texto deve exibir 'C' no display superior
    const outputContainer = screen.getAllByText('C')[0];
    expect(outputContainer).toBeInTheDocument();

    // O menu deve ter voltado para o Top Level (A B C deve estar visível novamente)
    expect(screen.getByText('A B C')).toBeInTheDocument();

    // 5. Entrar no grupo Y Z ␣ para ações
    fireEvent.click(screen.getByText('Y Z'));

    const btnApagar = screen.getByText('Apagar');
    expect(btnApagar).toBeInTheDocument();

    // Entra em apagar
    fireEvent.click(btnApagar);

    // Permanece no mesmo grupo (conforme regra)
    expect(screen.getByText('Apagar')).toBeInTheDocument();
  });
});

describe('KeyboardScreen — rascunho que sobrevive a sair e voltar (FE-6)', () => {
  beforeEach(() => sessionStorage.clear());

  const montar = () =>
    render(
      <BrowserRouter>
        <SettingsProvider>
          <KeyboardScreen />
        </SettingsProvider>
      </BrowserRouter>
    );

  it('o que foi escrito volta quando a tela reabre na mesma sessão', () => {
    const primeira = montar();
    fireEvent.click(screen.getByText('A B C'));
    fireEvent.click(screen.getByText('C'));
    expect(sessionStorage.getItem('irisflow.rascunhoDoTeclado')).toBe('C');
    primeira.unmount();

    montar();
    expect(screen.getAllByText('C').length).toBeGreaterThan(0);
    expect(sessionStorage.getItem('irisflow.rascunhoDoTeclado')).toBe('C');
  });
});

describe('KeyboardScreen — acentos, ç, números e pontuação (FE-19)', () => {
  beforeEach(() => sessionStorage.clear());

  const montar = () =>
    render(
      <BrowserRouter>
        <SettingsProvider>
          <KeyboardScreen />
        </SettingsProvider>
      </BrowserRouter>
    );
  const rascunho = () => sessionStorage.getItem('irisflow.rascunhoDoTeclado') ?? '';

  it('a troca de camada fica no lugar do Voltar e mostra os grupos de símbolos', () => {
    montar();
    const troca = screen.getByLabelText('Acentos, números e pontuação');
    expect(troca).toHaveAttribute('data-testid', 'kb-nav-2');
    fireEvent.click(troca);
    expect(screen.getByText('Á Â Ã')).toBeInTheDocument();
    expect(screen.getByText('Õ Ú Ç')).toBeInTheDocument();
    expect(screen.getByText('. , ?')).toBeInTheDocument();
    expect(screen.getByText('1 2 3')).toBeInTheDocument();
    expect(screen.getByText('7 8 9 0')).toBeInTheDocument();
    // Nos símbolos a mesma tecla volta às letras.
    fireEvent.click(screen.getByLabelText('Voltar às letras'));
    expect(screen.getByText('A B C')).toBeInTheDocument();
  });

  it('escreve "NÃO?" — acento e pontuação voltam às letras sozinhos', () => {
    montar();
    fireEvent.click(screen.getByText('M N O'));
    fireEvent.click(screen.getByText('N'));
    fireEvent.click(screen.getByLabelText('Acentos, números e pontuação'));
    fireEvent.click(screen.getByText('Á Â Ã'));
    fireEvent.click(screen.getByText('Ã'));
    // Voltou às letras depois do acento.
    expect(screen.getByText('M N O')).toBeInTheDocument();
    fireEvent.click(screen.getByText('M N O'));
    fireEvent.click(screen.getByText('O'));
    fireEvent.click(screen.getByLabelText('Acentos, números e pontuação'));
    fireEvent.click(screen.getByText('. , ?'));
    fireEvent.click(screen.getByText('?'));
    expect(rascunho()).toBe('NÃO?');
    expect(screen.getByText('A B C')).toBeInTheDocument();
  });

  it('números continuam na camada de símbolos até o espaço', () => {
    montar();
    fireEvent.click(screen.getByLabelText('Acentos, números e pontuação'));
    fireEvent.click(screen.getByText('1 2 3'));
    fireEvent.click(screen.getByText('1'));
    // Continua nos símbolos: dá para escrever o segundo dígito direto.
    expect(screen.getByText('7 8 9 0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('7 8 9 0'));
    fireEvent.click(screen.getByText('0'));
    fireEvent.click(screen.getByText('7 8 9 0'));
    fireEvent.click(screen.getByText('Espaço'));
    expect(rascunho()).toBe('10 ');
    // O espaço devolve às letras.
    expect(screen.getByText('A B C')).toBeInTheDocument();
  });

  it('Apagar na camada de símbolos apaga e continua no grupo', () => {
    montar();
    fireEvent.click(screen.getByLabelText('Acentos, números e pontuação'));
    fireEvent.click(screen.getByText('Í Ó Ô'));
    fireEvent.click(screen.getByText('Ç'));
    expect(rascunho()).toBe('Ç');
    fireEvent.click(screen.getByLabelText('Acentos, números e pontuação'));
    fireEvent.click(screen.getByText('7 8 9 0'));
    fireEvent.click(screen.getByText('Apagar'));
    expect(rascunho()).toBe('');
    expect(screen.getByText('Apagar')).toBeInTheDocument();
    // No nível 2 o segundo lugar da barra é o Voltar.
    expect(screen.getByLabelText('Voltar')).toHaveAttribute('data-testid', 'kb-nav-2');
  });
});
