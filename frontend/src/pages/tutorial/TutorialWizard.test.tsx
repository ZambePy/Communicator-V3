import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * O tutorial precisa ser PERCORRÍVEL — em qualquer direção.
 *
 * O bug relatado era "entro numa parte e não consigo mais ir para outra aba".
 * A causa: a trilha de passos era um `div` com `span`, sem `onClick`, sem
 * `role` e fora do `DWELL_SELECTOR` do GazeContext — parecia um conjunto de
 * abas e era inerte para mouse, teclado e olhar.
 *
 * Não existia teste nenhum do wizard. Estes travam o contrato mínimo: dá para
 * chegar do primeiro ao último passo, voltar, e pular direto para qualquer um
 * pela trilha.
 */

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const gravarTutorial = vi.fn();
vi.mock('../../services/local/tutorialProfile', () => ({
  gravarTutorial: (...a: unknown[]) => gravarTutorial(...a),
  tutorialConcluido: () => false,
  limparTutorial: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ currentProfile: { id: 'p1', name: 'Teste' } }),
}));

const updateSettings = vi.fn();
vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({ settings: { dwellMs: 900 }, updateSettings }),
}));

// Os passos usam gaze/emergência de verdade; aqui só interessa a navegação.
vi.mock('./steps/OQueEDwell', () => ({ OQueEDwell: () => <div>passo-oQueEDwell</div> }));
vi.mock('./steps/PraticaGuiada', () => ({ PraticaGuiada: () => <div>passo-pratica</div> }));
vi.mock('./steps/AjusteDoTempo', () => ({ AjusteDoTempo: () => <div>passo-ajuste</div> }));
vi.mock('./steps/BotaoDeEmergencia', () => ({ BotaoDeEmergencia: () => <div>passo-emergencia</div> }));
vi.mock('./steps/Concluido', () => ({ Concluido: () => <div>passo-concluido</div> }));

import { TutorialWizard } from './TutorialWizard';
import { PASSOS_DO_TUTORIAL } from './passos';

function montar() {
  return render(
    <MemoryRouter>
      <TutorialWizard />
    </MemoryRouter>
  );
}

/** Aba da trilha pelo índice do passo. */
function aba(n: number): HTMLElement {
  return within(screen.getByRole('tablist')).getAllByRole('tab')[n];
}

// Sem i18n inicializado, `t()` devolve a própria chave — e é por ela que os
// botões são localizados aqui. Casar pelo texto traduzido deixaria o teste
// refém da redação, que não é o que ele mede.
const botao = (chave: string) => screen.getByRole('button', { name: chave });
const avancar = () =>
  fireEvent.click(screen.getByRole('button', { name: /tutorial\.(next|concluido\.ir)/ }));

describe('TutorialWizard — a trilha navega', () => {
  beforeEach(() => {
    navigate.mockClear();
    gravarTutorial.mockClear();
  });

  it('a trilha é um tablist com um tab clicável por passo', () => {
    montar();
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs).toHaveLength(PASSOS_DO_TUTORIAL.length);
    // O contrato que faltava: são BOTÕES. Um `div` aqui é inerte para o olhar.
    for (const tab of tabs) expect(tab.tagName).toBe('BUTTON');
  });

  it('clicar numa aba salta direto para aquele passo', () => {
    montar();
    expect(screen.getByText('passo-oQueEDwell')).toBeInTheDocument();
    fireEvent.click(aba(3));
    expect(screen.getByText('passo-emergencia')).toBeInTheDocument();
    expect(screen.queryByText('passo-oQueEDwell')).toBeNull();
  });

  it('dá para voltar pela trilha depois de ter avançado — o bug relatado', () => {
    montar();
    fireEvent.click(aba(4));
    expect(screen.getByText('passo-concluido')).toBeInTheDocument();
    fireEvent.click(aba(1));
    expect(screen.getByText('passo-pratica')).toBeInTheDocument();
    fireEvent.click(aba(0));
    expect(screen.getByText('passo-oQueEDwell')).toBeInTheDocument();
  });

  it('a aba atual se anuncia para leitor de tela', () => {
    montar();
    expect(aba(0)).toHaveAttribute('aria-selected', 'true');
    expect(aba(2)).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(aba(2));
    expect(aba(2)).toHaveAttribute('aria-selected', 'true');
    expect(aba(0)).toHaveAttribute('aria-selected', 'false');
  });

  it('o caminho inteiro pelo botão Continuar chega ao fim e conclui', () => {
    montar();
    for (const nome of ['pratica', 'ajuste', 'emergencia', 'concluido']) {
      avancar();
      expect(screen.getByText(`passo-${nome}`)).toBeInTheDocument();
    }
    avancar();
    expect(gravarTutorial).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/welcome', { replace: true });
  });

  it('Voltar está desabilitado só no primeiro passo', () => {
    montar();
    const voltar = () => screen.getByRole('button', { name: /tutorial\.back/ });
    expect(voltar()).toBeDisabled();
    fireEvent.click(aba(2));
    expect(voltar()).not.toBeDisabled();
    fireEvent.click(voltar());
    expect(screen.getByText('passo-pratica')).toBeInTheDocument();
  });

  it('Pular sai sem gravar conclusão, de qualquer passo', () => {
    montar();
    fireEvent.click(aba(3));
    fireEvent.click(screen.getByRole('button', { name: /tutorial\.skip/ }));
    expect(gravarTutorial).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/menu', { replace: true });
  });
});
