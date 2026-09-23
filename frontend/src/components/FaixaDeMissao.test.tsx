import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import i18n from '../i18n';
import { FaixaDeMissao } from './FaixaDeMissao';
import { PassoDeMissao } from '../pages/tutorial/steps/PassoDeMissao';
import { GamesMenu } from '../pages/GamesMenu';
import {
  cumprirMissao,
  guardarPasso,
  iniciarMissao,
  limparMissoes,
  missaoCumprida,
  passoGuardado,
} from '../pages/tutorial/missao';

/**
 * A ida e a VOLTA de uma missão, de ponta a ponta.
 *
 * O bug: depois de cumprir a missão (abrir um jogo), a pessoa ficava fora do
 * tutorial sem volta pelo olhar — a faixa lia o estado uma vez, e a missão
 * ativa some no instante em que é cumprida. Aqui o percurso inteiro é
 * exercitado: passo → tela real (o menu de jogos de verdade) → abre um jogo →
 * volta ao menu de jogos → a faixa diz "Feito — voltar ao tutorial" → volta.
 */
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()) }),
  useIsDwelling: () => false,
}));
vi.mock('./ui/DicaContextual', () => ({ DicaContextual: () => null }));

const Jogo: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div>
      JOGO
      <button type="button" onClick={() => navigate('/games')}>
        sair-do-jogo
      </button>
    </div>
  );
};

const Tutorial: React.FC = () => (
  <div>
    TUTORIAL
    <PassoDeMissao
      missao="lazer"
      passo="lazer"
      rota="/games"
      titulo="Jogos"
      texto="..."
      convite="ir-aos-jogos"
      feito="missao-feita"
    />
  </div>
);

const montar = (inicial = '/tutorial') =>
  render(
    <MemoryRouter initialEntries={[inicial]}>
      <Routes>
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/games" element={<GamesMenu />} />
        <Route path="/games/bubble" element={<Jogo />} />
      </Routes>
    </MemoryRouter>
  );

describe('FaixaDeMissao — ida e volta da missão', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pt-BR');
    sessionStorage.clear();
  });

  it('passo → tela real → cumpre → faixa muda → volta ao passo cumprido', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /ir-aos-jogos/ }));

    // Na tela real: a faixa diz o que fazer e oferece a volta.
    expect(screen.getByText('Lazer e bem-estar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar ao tutorial' })).toBeInTheDocument();
    expect(screen.queryByText('Feito — voltar ao tutorial')).toBeNull();

    // Abre um jogo: é a ação da missão. O jogo leva a outra rota.
    fireEvent.click(screen.getByLabelText(/^Abrir Estoura Bolhas/));
    expect(screen.getByText('JOGO')).toBeInTheDocument();
    expect(missaoCumprida('lazer')).toBe(true);

    // Volta ao menu de jogos: a faixa REMONTA e ainda assim está lá, agora
    // dizendo que a missão foi feita.
    fireEvent.click(screen.getByText('sair-do-jogo'));
    const voltar = screen.getByRole('button', { name: 'Feito — voltar ao tutorial' });
    expect(voltar.className).toContain('gaze-button');
    expect(voltar.style.height).toBe('76px');

    fireEvent.click(voltar);
    expect(screen.getByText('TUTORIAL')).toBeInTheDocument();
    expect(screen.getByText('missao-feita')).toBeInTheDocument();
  });

  it('reage sem remontar: cumprir a missão na própria tela troca o rótulo', () => {
    guardarPasso('lazer');
    iniciarMissao('lazer');
    render(
      <MemoryRouter>
        <FaixaDeMissao missao="lazer" instrucao="faca-isto" />
      </MemoryRouter>
    );
    expect(screen.getByText('faca-isto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar ao tutorial' })).toBeInTheDocument();

    act(() => cumprirMissao('lazer'));
    expect(screen.getByRole('button', { name: 'Feito — voltar ao tutorial' })).toBeInTheDocument();
    expect(screen.queryByText('faca-isto')).toBeNull();
  });

  it('voltar sem cumprir abandona a missão mas mantém o passo', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /ir-aos-jogos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao tutorial' }));
    expect(screen.getByText('TUTORIAL')).toBeInTheDocument();
    expect(missaoCumprida('lazer')).toBe(false);
    expect(passoGuardado()).toBe('lazer');
  });

  it('não aparece fora do tutorial nem em outro passo', () => {
    const primeira = montar('/games');
    expect(screen.queryByRole('button', { name: /voltar ao tutorial/i })).toBeNull();
    primeira.unmount();

    limparMissoes();
    guardarPasso('digitacao');
    montar('/games');
    expect(screen.queryByRole('button', { name: /voltar ao tutorial/i })).toBeNull();
  });
});
