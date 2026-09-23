import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import i18n from '../../i18n';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MeditationScreen } from './MeditationScreen';

vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()) }),
  useIsDwelling: () => false,
}));

const renderizar = () =>
  render(
    <BrowserRouter>
      <MeditationScreen />
    </BrowserRouter>
  );

// Os rótulos vêm do i18n: sem idioma carregado, `t()` devolveria a chave.
beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('MeditationScreen — Meditação Visual', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('começa parada e é iniciada por um alvo de fixação', () => {
    renderizar();
    expect(screen.getByText('Pronto')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Iniciar a sessão de respiração'));
    expect(screen.getByText('Inale')).toBeInTheDocument();
    expect(screen.getByLabelText('Pausar a sessão de respiração')).toBeInTheDocument();
  });

  it('percorre o ciclo 4-4-4 e conta os ciclos completos', () => {
    renderizar();
    fireEvent.click(screen.getByLabelText('Iniciar a sessão de respiração'));

    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.getByText('Segure')).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.getByText('Exale')).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.getByText('Inale')).toBeInTheDocument();
    expect(screen.getByRole('status').getAttribute('aria-label')).toContain('Ciclos completos: 1');
  });

  it('para de avançar quando pausada — nada roda sozinho depois disso', () => {
    renderizar();
    fireEvent.click(screen.getByLabelText('Iniciar a sessão de respiração'));
    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.getByText('Segure')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Pausar a sessão de respiração'));
    act(() => void vi.advanceTimersByTime(30_000));
    // Pausada: a fase não pode ter andado.
    expect(screen.getByLabelText('Iniciar a sessão de respiração')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Iniciar a sessão de respiração'));
    expect(screen.getByText('Segure')).toBeInTheDocument();
  });

  it('mantém uma saída para o menu durante a sessão', () => {
    renderizar();
    fireEvent.click(screen.getByLabelText('Iniciar a sessão de respiração'));
    expect(screen.getByLabelText('Voltar para Lazer e bem-estar')).toBeInTheDocument();
  });

  it('termina sozinha na duração escolhida e avisa', () => {
    renderizar();
    // Padrão: 2 minutos = 30 fases de 4 s.
    expect(screen.getByLabelText('Sessão de 2 minutos')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByLabelText('Iniciar a sessão de respiração'));
    act(() => void vi.advanceTimersByTime(30 * 4000));
    expect(screen.getByText('Fim')).toBeInTheDocument();
    expect(screen.getByText(/Sessão de 2 minutos concluída/)).toBeInTheDocument();
    // Parou de verdade: nada roda sozinho depois do fim.
    expect(screen.getByLabelText('Iniciar a sessão de respiração')).toBeInTheDocument();
  });

  it('a duração de 5 minutos é escolhida por um alvo de olhar', () => {
    renderizar();
    const cinco = screen.getByLabelText('Sessão de 5 minutos');
    expect(cinco.className).toContain('gaze-button');
    fireEvent.click(cinco);
    expect(cinco).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByLabelText('Iniciar a sessão de respiração'));
    act(() => void vi.advanceTimersByTime(30 * 4000));
    // Aos 2 minutos ainda não acabou.
    expect(screen.queryByText('Fim')).toBeNull();
    act(() => void vi.advanceTimersByTime(45 * 4000));
    expect(screen.getByText('Fim')).toBeInTheDocument();
  });
});
