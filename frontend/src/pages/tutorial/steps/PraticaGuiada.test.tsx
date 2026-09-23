import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import i18n from '../../../i18n';
import { PraticaGuiada, ALVOS_DA_PRATICA, vereditoDoTempo } from './PraticaGuiada';

// -----------------------------------------------------------------------------
// A prática NUNCA reprova. Sem tempo esgotado, sem "errou", sem pontuação.
//
// Quem está aqui está aprendendo a usar os próprios olhos como ponteiro, e
// muitas vezes com uma doença que piora. Um tutorial que diz "tente de novo"
// nessa situação é uma barreira — e o paciente não tem como discordar dele.
//
// O clique vem do `GazeContext`, que já sintetiza o clique após o dwell
// configurado. Reimplementar a contagem aqui criaria um segundo dwell que
// divergiria do real no primeiro ajuste, e a prática ensinaria um tempo que
// não é o do app. O veredito só mede do INÍCIO do dwell (a classe `gaze-hover`
// que o contexto põe no alvo) até o clique — nunca o tempo de leitura.
// -----------------------------------------------------------------------------

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

const montar = (props: Partial<React.ComponentProps<typeof PraticaGuiada>> = {}) =>
  render(<PraticaGuiada dwellMs={1500} aoSugerirAjuste={vi.fn()} {...props} />);

const alvo = () => screen.getByRole('button', { name: /alvo/i });

describe('vereditoDoTempo — a heurística do retorno', () => {
  it('bem abaixo do dwell configurado: disparou cedo', () => {
    expect(vereditoDoTempo(600, 1500)).toBe('rapido');
  });

  it('perto do dwell: está bom', () => {
    expect(vereditoDoTempo(1600, 1500)).toBe('bom');
  });

  it('muito acima do dwell: segurou além do necessário', () => {
    expect(vereditoDoTempo(4200, 1500)).toBe('lento');
  });

  it('tempo de clique de mouse não vira veredito de dwell', () => {
    // O cuidador testando com o mouse produz ~0 ms. Dizer "disparou rápido
    // demais, aumente o tempo" a partir disso seria conselho inventado.
    expect(vereditoDoTempo(20, 1500)).toBe('indeterminado');
  });
});

describe('nunca reprova', () => {
  it('não existe tempo esgotado', () => {
    // Verifica o ESTADO, não as palavras: o texto de apoio contém a frase
    // "nem tempo esgotado" justamente para prometer que isso não acontece, e
    // procurar por ela casaria a promessa em vez do defeito.
    vi.useFakeTimers();
    montar();
    const antes = alvo().textContent;

    act(() => {
      vi.advanceTimersByTime(120_000);
    });

    // Dois minutos parado e o alvo continua lá, esperando, sem nada em
    // `role="alert"` — que é como um estado de erro apareceria.
    expect(alvo().textContent).toBe(antes);
    expect(screen.queryByRole('alert')).toBeNull();
    vi.useRealTimers();
  });

  it('nenhum alvo pode ser errado — só há um por vez', () => {
    montar();
    expect(screen.getAllByRole('button', { name: /alvo/i })).toHaveLength(1);
  });

  it('não mostra pontuação nem contagem de acertos', () => {
    montar();
    expect(screen.queryByText(/pontos|acertos|erros|\d+\s*\/\s*\d+/i)).toBeNull();
  });
});

describe('o progresso pela prática', () => {
  it('avança para o próximo alvo a cada acerto', () => {
    montar();
    const primeiro = alvo().textContent;
    fireEvent.click(alvo());
    expect(alvo().textContent).not.toBe(primeiro);
  });

  it('depois do último alvo, diz que terminou', () => {
    montar();
    for (let i = 0; i < ALVOS_DA_PRATICA; i++) {
      fireEvent.click(alvo());
    }
    expect(screen.getByText(/pronto|terminou|conclu/i)).toBeInTheDocument();
  });
});

describe('a sugestão de ajuste', () => {
  it('é sugestão: não muda o tempo sozinha', () => {
    // Mexer no dwell sem o cuidador pedir mudaria o app debaixo do paciente
    // no meio do aprendizado.
    const aoSugerirAjuste = vi.fn();
    montar({ aoSugerirAjuste });
    fireEvent.click(alvo());
    expect(aoSugerirAjuste).not.toHaveBeenCalled();
  });
});

describe('o veredito mede o dwell, não a leitura', () => {
  afterEach(() => vi.useRealTimers());

  it('clique sem o olhar ter pousado (mouse, ou leitura longa) não vira "segurou demais"', () => {
    vi.useFakeTimers();
    montar();
    // Dois minutos lendo a instrução antes de olhar para o alvo.
    act(() => void vi.advanceTimersByTime(120_000));
    fireEvent.click(alvo());
    expect(screen.queryByText(/segurou mais/i)).toBeNull();
    expect(screen.getByText('Registrado.')).toBeInTheDocument();
  });

  it('conta do instante em que o olhar pousa no alvo', async () => {
    vi.useFakeTimers();
    montar({ dwellMs: 1000 });
    act(() => void vi.advanceTimersByTime(60_000)); // leitura: não conta
    // O GazeContext põe `gaze-hover` quando o olhar entra no alvo.
    act(() => alvo().classList.add('gaze-hover'));
    // O MutationObserver entrega em microtask.
    await act(async () => {
      await Promise.resolve();
    });
    act(() => void vi.advanceTimersByTime(1100));
    fireEvent.click(alvo());
    expect(screen.getByText(/Bom\./)).toBeInTheDocument();
  });

  it('"Ajustar o tempo" é um alvo de olhar de 76 px', async () => {
    vi.useFakeTimers();
    const aoSugerirAjuste = vi.fn();
    montar({ dwellMs: 1000, aoSugerirAjuste });
    act(() => alvo().classList.add('gaze-hover'));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => void vi.advanceTimersByTime(5000)); // 5× o dwell: lento
    fireEvent.click(alvo());
    const ajustar = screen.getByRole('button', { name: /ajustar o tempo/i });
    expect(ajustar.className).toContain('gaze-button');
    expect(ajustar.style.height).toBe('76px');
    fireEvent.click(ajustar);
    expect(aoSugerirAjuste).toHaveBeenCalled();
  });
});
