import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { NewsScreen, CHAVE_DAS_LEITURAS, lerLeituras } from './NewsScreen';

/**
 * Leituras: só o que alguém de verdade guardou para esta pessoa.
 *
 * Sem notícias fixas no código: não há fonte de notícias, e texto inventado
 * apresentado como jornal é desinformação para quem depende do app.
 */
const voz = vi.hoisted(() => ({ falar: vi.fn(() => Promise.resolve({})), pararFala: vi.fn() }));
vi.mock('../../services/voz', () => ({ falar: voz.falar, pararFala: voz.pararFala }));

vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()) }),
  useIsDwelling: () => false,
}));

beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

const renderizar = () =>
  render(
    <BrowserRouter>
      <NewsScreen />
    </BrowserRouter>
  );

const guardar = (leituras: unknown) =>
  localStorage.setItem(CHAVE_DAS_LEITURAS, JSON.stringify(leituras));

describe('NewsScreen — Leituras', () => {
  beforeEach(() => {
    localStorage.clear();
    voz.falar.mockClear();
    voz.pararFala.mockClear();
  });

  it('sem leituras mostra o estado vazio e nada de notícia inventada', () => {
    renderizar();
    expect(screen.getByText('Nenhuma leitura ainda.')).toBeInTheDocument();
    expect(screen.getByText(/Configurações/)).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText(/Avanços na Medicina|Esportes|Clima/)).toBeNull();
  });

  it('lista as leituras guardadas pelo cuidador', () => {
    guardar([
      { id: 'a', titulo: 'Carta da Ana', texto: 'Oi, pai.', criadoEm: '2026-01-01T00:00:00Z' },
      { id: 'b', titulo: 'Capítulo 3', texto: 'Era uma vez.', criadoEm: '2026-01-02T00:00:00Z' },
    ]);
    renderizar();
    expect(screen.getByText('Carta da Ana')).toBeInTheDocument();
    expect(screen.getByText('Oi, pai.')).toBeInTheDocument();
    expect(screen.getByText('Capítulo 3')).toBeInTheDocument();
  });

  it('lê a leitura em voz alta por um alvo de fixação de 76 px, e permite parar', async () => {
    guardar([{ id: 'a', titulo: 'Carta da Ana', texto: 'Oi, pai.', criadoEm: '2026-01-01T00:00:00Z' }]);
    let resolver: (v: unknown) => void = () => {};
    voz.falar.mockImplementationOnce(() => new Promise((r) => (resolver = r)));
    renderizar();
    const ouvir = screen.getByLabelText('Ouvir Carta da Ana em voz alta');
    expect(ouvir.style.height).toBe('76px');
    fireEvent.click(ouvir);
    expect(voz.falar).toHaveBeenCalledWith('Carta da Ana. Oi, pai.', { rate: 0.9 });

    const parar = screen.getByLabelText('Parar a leitura de Carta da Ana');
    fireEvent.click(parar);
    expect(voz.pararFala).toHaveBeenCalled();
    expect(screen.getByLabelText('Ouvir Carta da Ana em voz alta')).toBeInTheDocument();
    await act(async () => resolver({}));
  });

  it('registro ilegível ou incompleto vira lista vazia, sem derrubar a tela', () => {
    localStorage.setItem(CHAVE_DAS_LEITURAS, '{nope');
    expect(lerLeituras()).toEqual([]);
    guardar([{ id: 'x' }, { texto: '   ' }, { texto: 'Só texto' }]);
    expect(lerLeituras()).toEqual([
      expect.objectContaining({ texto: 'Só texto', titulo: 'Leitura 1' }),
    ]);
  });

  it('mantém uma saída para o menu de lazer', () => {
    renderizar();
    expect(screen.getByLabelText('Voltar para Lazer e bem-estar')).toBeInTheDocument();
  });
});
