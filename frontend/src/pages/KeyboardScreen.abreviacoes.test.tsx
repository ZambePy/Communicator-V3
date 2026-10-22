import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Abreviações no teclado (roadmap 2, rodada 3, 21/10/2026): "OBG" vira um CHIP
// "OBRIGADO" na previsão de palavras — nunca uma troca automática. O paciente
// escolhe com o olhar, como escolhe qualquer palavra sugerida.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()), isComposing: false, setIsComposing: vi.fn() }),
  useIsDwelling: () => false,
}));
const fala = vi.hoisted(() => ({ falarDoPaciente: vi.fn(async () => null) }));
vi.mock('../services/voz/falaDoPaciente', () => ({
  falarDoPaciente: fala.falarDoPaciente,
  falaSaiu: () => true,
  falaFalhou: () => false,
}));

import { KeyboardScreen } from './KeyboardScreen';
import { SettingsProvider } from '../context/SettingsContext';
import { _limparOuvintes, ouvir, type EventoDoPaciente } from '../cloud/eventos';
import { definirAssistenteDesligado } from '../services/assistente';
import { reiniciarParaTeste } from '../services/assistente/armazenamento';
import { MAX_SIGNIFICADO, dicionarioDasAbreviacoes, salvarAbreviacao } from '../services/abreviacoes';

if (typeof window !== 'undefined') {
  window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn() } as unknown as SpeechSynthesis;
}

const RASCUNHO = 'irisflow.rascunhoDoTeclado';

function montar() {
  return render(
    <BrowserRouter>
      <SettingsProvider>
        <KeyboardScreen />
      </SettingsProvider>
    </BrowserRouter>,
  );
}

/** A tecla pelo texto que ela mostra. */
const tecla = (texto: string) => screen.getByText(texto).closest('button') as HTMLButtonElement;
/** Escreve uma letra: abre o grupo dela e toca nela (volta ao nível 1). */
const escrever = (grupo: string, letra: string) => {
  fireEvent.click(tecla(grupo));
  fireEvent.click(tecla(letra));
};
const escreverOBG = () => {
  escrever('M N O', 'O');
  escrever('A B C', 'B');
  escrever('G H I', 'G');
};
const previaDasPalavras = (c: HTMLElement) => c.querySelector('.kb-key--words') as HTMLElement;
const abrirPalavras = (c: HTMLElement) => fireEvent.click(previaDasPalavras(c));
const itensDasPalavras = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.kb-key--sugestao'));

let recebidos: EventoDoPaciente[] = [];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  reiniciarParaTeste();
  fala.falarDoPaciente.mockClear();
  _limparOuvintes();
  recebidos = [];
  ouvir((e) => recebidos.push(e));
});

describe('o chip de abreviação no teclado', () => {
  it('escrever OBG põe OBRIGADO na prévia do grupo de palavras, marcado como abreviação', () => {
    const { container } = montar();
    escreverOBG();
    expect(sessionStorage.getItem(RASCUNHO)).toBe('OBG');
    expect(previaDasPalavras(container)).toHaveTextContent('OBRIGADO');
    expect(previaDasPalavras(container)).toHaveTextContent('abreviação');
  });

  it('dentro do grupo de palavras o chip vem primeiro, com a etiqueta "abreviação"', () => {
    const { container } = montar();
    escreverOBG();
    abrirPalavras(container);
    const [primeiro] = itensDasPalavras(container);
    expect(primeiro).toHaveTextContent('OBRIGADO');
    expect(primeiro.querySelector('.kb-key__etiqueta')).toHaveTextContent('abreviação');
  });

  it('escolher o chip troca a palavra por OBRIGADO e um espaço — e não fala nem envia nada', () => {
    const { container } = montar();
    escreverOBG();
    abrirPalavras(container);
    fireEvent.click(itensDasPalavras(container)[0]);

    expect(sessionStorage.getItem(RASCUNHO)).toBe('OBRIGADO ');
    // De volta ao primeiro nível, e sem chip para uma palavra já escrita por extenso.
    expect(screen.getByText('A B C')).toBeInTheDocument();
    expect(previaDasPalavras(container)).not.toHaveTextContent('abreviação');
    expect(fala.falarDoPaciente).not.toHaveBeenCalled();
    expect(recebidos).toEqual([]);
  });

  it('só troca a ÚLTIMA palavra: o que veio antes fica', () => {
    sessionStorage.setItem(RASCUNHO, 'QUERO PFV');
    const { container } = montar();
    expect(previaDasPalavras(container)).toHaveTextContent('POR FAVOR');
    abrirPalavras(container);
    fireEvent.click(itensDasPalavras(container)[0]);
    expect(sessionStorage.getItem(RASCUNHO)).toBe('QUERO POR FAVOR ');
  });

  it('sem escolher o chip nada é trocado: um espaço segue em frente com OBG como foi escrito', () => {
    const { container } = montar();
    escreverOBG();
    // O chip está lá, à espera — e é só isso que ele faz.
    expect(previaDasPalavras(container)).toHaveTextContent('OBRIGADO');
    fireEvent.click(tecla('Y Z'));
    fireEvent.click(tecla('Espaço'));
    expect(sessionStorage.getItem(RASCUNHO)).toBe('OBG ');
    expect(previaDasPalavras(container)).not.toHaveTextContent('OBRIGADO');
  });

  it('uma letra só vale: "N" oferece NÃO uma vez, como abreviação, sem repetir a palavra prevista', () => {
    const { container } = montar();
    escrever('M N O', 'N');
    abrirPalavras(container);
    const iguais = itensDasPalavras(container).filter((i) => /^NÃO/i.test(i.textContent ?? ''));
    expect(iguais).toHaveLength(1);
    expect(iguais[0].querySelector('.kb-key__etiqueta')).toHaveTextContent('abreviação');
  });

  it('a abreviação que a pessoa acrescentou nos ajustes também vira chip', () => {
    salvarAbreviacao('ctz', 'certeza');
    sessionStorage.setItem(RASCUNHO, 'CTZ');
    const { container } = montar();
    expect(previaDasPalavras(container)).toHaveTextContent('CERTEZA');
  });

  it('com as sugestões desligadas nos ajustes não há chip; ligadas, há', () => {
    sessionStorage.setItem(RASCUNHO, 'OBG');
    definirAssistenteDesligado(true);
    const desligado = montar();
    expect(previaDasPalavras(desligado.container)).not.toHaveTextContent('OBRIGADO');
    desligado.unmount();

    definirAssistenteDesligado(false);
    const ligado = montar();
    expect(previaDasPalavras(ligado.container)).toHaveTextContent('OBRIGADO');
  });

  it('texto que não é abreviação não ganha etiqueta nenhuma', () => {
    sessionStorage.setItem(RASCUNHO, 'OBG');
    const com = montar();
    expect(previaDasPalavras(com.container)).toHaveTextContent('abreviação');
    com.unmount();

    sessionStorage.setItem(RASCUNHO, 'CASA');
    const sem = montar();
    expect(previaDasPalavras(sem.container)).not.toHaveTextContent('abreviação');
  });

  it('o significado do tamanho máximo cabe na célula e é oferecido por inteiro, sem corte', () => {
    // 42 letras é o que a célula do teclado comporta (o mesmo limite das frases).
    // Se o limite do dicionário crescer sem a célula crescer junto, este teste
    // avisa: um chip cortado seria um alvo que o paciente escolhe sem saber o quê.
    const significado = 'pode chamar a enfermeira para me ajudar já';
    expect(significado).toHaveLength(MAX_SIGNIFICADO);
    expect(salvarAbreviacao('pce', significado).ok).toBe(true);
    sessionStorage.setItem(RASCUNHO, 'PCE');
    const { container } = montar();
    abrirPalavras(container);
    expect(itensDasPalavras(container)[0]).toHaveTextContent('PODE CHAMAR A ENFERMEIRA PARA ME AJUDAR JÁ');
  });
});

describe('aprender abreviações com o que o paciente fala por extenso', () => {
  it('a mesma frase falada três vezes no teclado vira abreviação; duas ainda não', async () => {
    sessionStorage.setItem(RASCUNHO, 'Estou com dor');
    montar();
    const falar = async () => {
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Falar o texto'));
      });
    };
    await falar();
    await falar();
    expect(dicionarioDasAbreviacoes().ecd).toBeUndefined();
    await falar();
    expect(dicionarioDasAbreviacoes().ecd).toBe('Estou com dor');
    // O próprio ato de falar segue como era: a voz foi chamada nas três vezes.
    expect(fala.falarDoPaciente).toHaveBeenCalledTimes(3);
  });
});
