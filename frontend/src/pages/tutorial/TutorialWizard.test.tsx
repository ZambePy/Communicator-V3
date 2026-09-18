import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
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
 * Estes testes travam o contrato mínimo: dá para chegar do primeiro ao último
 * passo, voltar, e pular direto para qualquer um pela trilha. E, desde que a
 * jornada passou a ir até as telas reais, mais dois contratos: a única trava
 * do tutorial trava mesmo, e ela abre — por ter sido cumprida, ou pelo tempo.
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
vi.mock('./steps/BotaoDeEmergencia', () => ({
  BotaoDeEmergencia: () => <div>passo-emergencia</div>,
}));
vi.mock('./steps/Concluido', () => ({ Concluido: () => <div>passo-concluido</div> }));
vi.mock('./steps/MaisRecursos', () => ({ MaisRecursos: () => <div>passo-recursos</div> }));
// O passo de missão é o mesmo componente para quatro passos; o `passo` que ele
// recebe é o que os distingue, e é por ele que o teste identifica a tela.
vi.mock('./steps/PassoDeMissao', () => ({
  PassoDeMissao: ({ passo }: { passo: string }) => <div>{`passo-${passo}`}</div>,
}));

import { TutorialWizard } from './TutorialWizard';
import { PASSOS_DO_TUTORIAL, PASSO_COM_TRAVA, ESPERA_MAXIMA_MS } from './passos';
import { cumprirMissao, iniciarMissao } from './missao';

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

/** Índice de um passo, para o teste não depender do tamanho da jornada. */
const idx = (p: string) => (PASSOS_DO_TUTORIAL as readonly string[]).indexOf(p);

// Sem i18n inicializado, `t()` devolve a própria chave — e é por ela que os
// botões são localizados aqui. Casar pelo texto traduzido deixaria o teste
// refém da redação, que não é o que ele mede.
const avancar = () =>
  fireEvent.click(screen.getByRole('button', { name: /tutorial\.(next|concluido\.ir)/ }));
const botaoAvancar = () =>
  screen.getByRole('button', { name: /tutorial\.(next|concluido\.ir)/ });

/** Marca a missão do passo travado como já cumprida, como se a pessoa
 *  tivesse ido ao teclado, escrito uma frase e voltado. */
function jaEscreveuUmaFrase() {
  iniciarMissao('digitacao');
  cumprirMissao('digitacao');
}

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
    // E cada um se identifica para leitor de tela: com dez passos os rótulos
    // saíram da tela (cada aba ficaria mais estreita que o alvo mínimo), então
    // o nome vive no `aria-label`.
    for (const tab of tabs) expect(tab).toHaveAttribute('aria-label');
  });

  it('clicar numa aba salta direto para aquele passo', () => {
    montar();
    expect(screen.getByText('passo-oQueEDwell')).toBeInTheDocument();
    fireEvent.click(aba(idx('emergencia')));
    expect(screen.getByText('passo-emergencia')).toBeInTheDocument();
    expect(screen.queryByText('passo-oQueEDwell')).toBeNull();
  });

  it('dá para voltar pela trilha depois de ter avançado — o bug relatado', () => {
    montar();
    fireEvent.click(aba(idx('concluido')));
    expect(screen.getByText('passo-concluido')).toBeInTheDocument();
    fireEvent.click(aba(idx('pratica')));
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
    // A frase já foi escrita: este teste mede o percurso, não a trava — ela
    // tem testes próprios logo abaixo.
    jaEscreveuUmaFrase();
    montar();
    for (const nome of PASSOS_DO_TUTORIAL.slice(1)) {
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
    fireEvent.click(aba(idx('conversa')));
    fireEvent.click(screen.getByRole('button', { name: /tutorial\.skip/ }));
    expect(gravarTutorial).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/menu', { replace: true });
  });
});

/**
 * A única trava da jornada.
 *
 * Escrever a primeira frase pelo olhar é o que transforma "o app responde ao
 * meu olhar" em "eu consigo dizer o que eu quiser", e é a única coisa do
 * tutorial que ninguém aprende assistindo. Por isso este passo espera — e por
 * isso ele tem saída: uma trava sem escapatória num app assistivo é armadilha.
 */
describe('TutorialWizard — a trava de escrever uma frase', () => {
  beforeEach(() => {
    navigate.mockClear();
    gravarTutorial.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('segura o Continuar enquanto a frase não foi escrita', () => {
    montar();
    fireEvent.click(aba(idx(PASSO_COM_TRAVA)));
    expect(botaoAvancar()).toBeDisabled();
    // E diz por quê: um botão desabilitado sem explicação é indistinguível de
    // um app quebrado, e quem está aqui não tem como investigar.
    expect(screen.getByText(/tutorial\.digitacao\.travado/)).toBeInTheDocument();
    // Clicar não avança.
    fireEvent.click(botaoAvancar());
    expect(screen.getByText(`passo-${PASSO_COM_TRAVA}`)).toBeInTheDocument();
  });

  it('libera assim que a frase foi escrita na tela real', () => {
    jaEscreveuUmaFrase();
    montar();
    fireEvent.click(aba(idx(PASSO_COM_TRAVA)));
    expect(botaoAvancar()).not.toBeDisabled();
    avancar();
    expect(screen.getByText('passo-conversa')).toBeInTheDocument();
  });

  it('libera sozinha depois da espera máxima — ninguém fica preso', () => {
    vi.useFakeTimers();
    montar();
    fireEvent.click(aba(idx(PASSO_COM_TRAVA)));
    expect(botaoAvancar()).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(ESPERA_MAXIMA_MS + 1000);
    });
    expect(botaoAvancar()).not.toBeDisabled();
  });

  it('Pular continua disponível no passo travado', () => {
    // A trava é para quem CONSEGUE e ainda não tentou, nunca para prender quem
    // não consegue.
    montar();
    fireEvent.click(aba(idx(PASSO_COM_TRAVA)));
    fireEvent.click(screen.getByRole('button', { name: /tutorial\.skip/ }));
    expect(navigate).toHaveBeenCalledWith('/menu', { replace: true });
  });

  it('Voltar continua livre no passo travado', () => {
    montar();
    fireEvent.click(aba(idx(PASSO_COM_TRAVA)));
    fireEvent.click(screen.getByRole('button', { name: /tutorial\.back/ }));
    expect(screen.getByText('passo-comunicacao')).toBeInTheDocument();
  });
});

/**
 * O passo sobrevive à ida até a tela real e ao F5.
 *
 * A segunda metade da jornada SAI desta rota: a pessoa vai ao teclado, escreve,
 * e volta. Se o wizard recomeçasse do primeiro passo a cada volta, a jornada
 * seria impossível de terminar.
 */
describe('TutorialWizard — retomar de onde parou', () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it('remontar retoma o passo guardado', () => {
    const { unmount } = montar();
    fireEvent.click(aba(idx('lazer')));
    expect(screen.getByText('passo-lazer')).toBeInTheDocument();
    unmount();

    montar();
    expect(screen.getByText('passo-lazer')).toBeInTheDocument();
  });

  it('sair do tutorial esquece o passo — a próxima vez começa do começo', () => {
    const { unmount } = montar();
    fireEvent.click(aba(idx('lazer')));
    fireEvent.click(screen.getByRole('button', { name: /tutorial\.skip/ }));
    unmount();

    montar();
    expect(screen.getByText('passo-oQueEDwell')).toBeInTheDocument();
  });
});
