import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Teclado lateral (modo só horizontal, pedido de 21/10/2026).

const falarDoPaciente = vi.fn(async () => ({ origem: 'sistema' as const }));
vi.mock('../../services/voz/falaDoPaciente', () => ({
  falarDoPaciente: (...a: unknown[]) => falarDoPaciente(...(a as [])),
}));
const emitirFalaDoPaciente = vi.fn();
vi.mock('../../cloud/eventos', () => ({ emitirFalaDoPaciente: (...a: unknown[]) => emitirFalaDoPaciente(...a) }));
const logSentence = vi.fn();
vi.mock('../../utils/clinicalLogger', () => ({ logSentence: (...a: unknown[]) => logSentence(...a) }));
let sugestoes: (texto: string) => string[] = () => ['preciso', 'quero'];
const registrarFalaDoPaciente = vi.fn();
vi.mock('../../services/assistente', () => ({
  sugerirPalavras: (texto: string) => sugestoes(texto),
  registrarFalaDoPaciente: (...a: unknown[]) => registrarFalaDoPaciente(...a),
}));
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children, titulo }: { children: React.ReactNode; titulo?: string }) => <div><h1>{titulo}</h1>{children}</div>,
}));
const setIsComposing = vi.fn();
vi.mock('../../context/GazeContext', () => ({ useGaze: () => ({ setIsComposing }) }));

const { TecladoLateral } = await import('./TecladoLateral');
const { marcarTelaLateral, telaLateralDeOrigem, _reiniciarTelaLateralParaTestes } = await import('../../services/telaLateral');

const montar = () => render(<MemoryRouter><TecladoLateral /></MemoryRouter>);
const lado = (qual: 'esquerda' | 'direita') => document.querySelector<HTMLButtonElement>(`[data-lado="${qual}"]`)!;
const escolher = (...caminho: Array<'e' | 'd'>) => {
  for (const passo of caminho) fireEvent.click(lado(passo === 'e' ? 'esquerda' : 'direita'));
};
const texto = () => screen.getByTestId('texto-do-teclado-lateral').textContent;

// Caminhos na ordem alfabética (A–O | P–Z, espaço, apagar, falar).
const A = ['e', 'e', 'e', 'e', 'e'] as const;
const Q = ['d', 'e', 'e', 'e', 'd'] as const;
const FALAR = ['d', 'd', 'd', 'd'] as const;
const APAGAR = ['d', 'd', 'd', 'e', 'd'] as const;

describe('Teclado lateral', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sugestoes = () => ['preciso', 'quero'];
    for (const f of [falarDoPaciente, emitirFalaDoPaciente, logSentence, registrarFalaDoPaciente, setIsComposing]) f.mockClear();
  });
  afterEach(() => sessionStorage.clear());

  // Revisão de 21/10/2026 (Important 1): a saída da tela de socorro volta
  // para a tela lateral de onde o paciente veio.
  it('abrir o teclado lateral o marca como a tela lateral de origem', () => {
    _reiniciarTelaLateralParaTestes();
    marcarTelaLateral('/sim-nao');
    montar();
    expect(telaLateralDeOrigem()).toBe('/teclado-lateral');
    _reiniciarTelaLateralParaTestes();
  });

  it('os dois lados são zonas laterais; o começo divide o alfabeto ao meio', () => {
    montar();
    expect(lado('esquerda').getAttribute('data-dwell-eixo')).toBe('x');
    expect(lado('direita').getAttribute('data-dwell-eixo')).toBe('x');
    expect(lado('esquerda').getAttribute('aria-label')).toBe('Letras de A a O');
    expect(lado('direita').getAttribute('aria-label')).toBe('Letras de P a Z, espaço, apagar e falar');
  });

  it('cada escolha é uma metade: cinco vezes a esquerda escreve "A", e o teclado volta ao começo', () => {
    montar();
    escolher(...A);
    expect(texto()).toBe('A');
    expect(lado('esquerda').getAttribute('aria-label')).toBe('Letras de A a O');
  });

  it('estreitar só navega (rearma pela permanência); escrever não', () => {
    montar();
    expect(lado('esquerda').dataset.rearmePermanencia).toBe('true');
    escolher('e', 'e', 'e', 'e');
    // Sobraram "A" e "B": cada lado é uma letra, e escolher escreve.
    expect(lado('esquerda').getAttribute('aria-label')).toBe('Escrever A');
    expect(lado('esquerda').dataset.rearmePermanencia).toBeUndefined();
  });

  it('falar fala a frase pela voz do paciente, manda ao cuidador uma vez e limpa a linha', () => {
    montar();
    escolher(...A);
    escolher(...A);
    escolher(...FALAR);
    expect(falarDoPaciente).toHaveBeenCalledTimes(1);
    expect(falarDoPaciente).toHaveBeenCalledWith('AA', expect.anything());
    expect(emitirFalaDoPaciente).toHaveBeenCalledTimes(1);
    expect(emitirFalaDoPaciente).toHaveBeenCalledWith('AA', 'texto');
    expect(logSentence).toHaveBeenCalledWith('AA');
    expect(registrarFalaDoPaciente).toHaveBeenCalledWith('AA');
    expect(texto()).toBe('');
    expect(screen.getByText(/Você falou: AA/)).toBeInTheDocument();
  });

  it('falar com a linha vazia não fala nada', () => {
    montar();
    escolher(...FALAR);
    expect(falarDoPaciente).not.toHaveBeenCalled();
    expect(emitirFalaDoPaciente).not.toHaveBeenCalled();
  });

  it('o lado que fala tem o dwell mais longo, como o "Falar" do teclado', () => {
    montar();
    escolher('d', 'd', 'd');
    expect(lado('direita').getAttribute('aria-label')).toBe('Falar');
    expect(lado('direita').dataset.dwellMs).toBe('2000');
    expect(lado('direita').dataset.dwellMult).toBe('1.3');
  });

  it('apagar tira a última letra', () => {
    montar();
    escolher(...A);
    escolher(...Q);
    expect(texto()).toBe('AQ');
    escolher(...APAGAR);
    expect(texto()).toBe('A');
  });

  it('com uma palavra começada, a previsão é um dos lados; escolher completa a palavra', () => {
    sugestoes = (t) => (t.endsWith('Q') ? ['quero'] : ['preciso']);
    montar();
    escolher(...Q);
    expect(lado('esquerda').getAttribute('aria-label')).toBe('Completar: QUERO');
    expect(lado('direita').getAttribute('aria-label')).toBe('Letras e comandos');
    fireEvent.click(lado('esquerda'));
    expect(texto()).toBe('QUERO ');
    // Depois do espaço não há palavra começada: sem previsão, a reserva do assistente não vira lado.
    expect(lado('esquerda').getAttribute('aria-label')).toBe('Letras de A a O');
  });

  it('o rascunho sobrevive a sair da tela e voltar', () => {
    const { unmount } = montar();
    escolher(...A);
    unmount();
    montar();
    expect(texto()).toBe('A');
  });
});
