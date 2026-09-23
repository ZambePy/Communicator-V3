import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * O tutorial precisa ser PERCORRÍVEL — em qualquer direção — PELO OLHAR.
 *
 * A trilha de passos já foi um `div` inerte que parecia abas, e depois dez
 * `<button>` de ~60×56 px — abaixo do alvo mínimo, inoperáveis pelo dwell.
 * Agora ela é só indicador: quem navega são Voltar e Continuar, de 76 px, e
 * Pular, que virou alvo de olhar em vez de um texto de 130×20.
 *
 * Estes testes travam o contrato mínimo: dá para chegar do primeiro ao último
 * passo e voltar, sem nenhum alvo cru no caminho; a única trava do tutorial
 * trava mesmo, e ela abre — por ter sido cumprida, ou pelo tempo.
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

// Sem calibração o dwell não liga; o wizard consulta isto para avisar.
const gaze = vi.hoisted(() => ({ calibrado: true }));
vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({ calibration: { isCalibrated: () => gaze.calibrado } }),
  useIsDwelling: () => false,
}));

// Os passos usam gaze/emergência de verdade; aqui só interessa a navegação.
vi.mock('./steps/OQueEDwell', () => ({ OQueEDwell: () => <div>passo-oQueEDwell</div> }));
vi.mock('./steps/PraticaGuiada', () => ({ PraticaGuiada: () => <div>passo-pratica</div> }));
vi.mock('./steps/AjusteDoTempo', () => ({ AjusteDoTempo: () => <div>passo-ajuste</div> }));
vi.mock('./steps/BotaoDeEmergencia', () => ({
  BotaoDeEmergencia: ({ aoEnsaiar, aoPular }: { aoEnsaiar: () => void; aoPular: () => void }) => (
    <div>
      passo-emergencia
      <button type="button" onClick={aoEnsaiar}>
        ensaiar
      </button>
      <button type="button" onClick={aoPular}>
        nao-ensaiar
      </button>
    </div>
  ),
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
import { cumprirMissao, iniciarMissao, guardarPasso } from './missao';

function montar() {
  return render(
    <MemoryRouter>
      <TutorialWizard />
    </MemoryRouter>
  );
}

/** Índice de um passo, para o teste não depender do tamanho da jornada. */
const idx = (p: string) => (PASSOS_DO_TUTORIAL as readonly string[]).indexOf(p);

/** Marca da trilha pelo índice do passo (indicador, não alvo). */
function marca(n: number): HTMLElement {
  return within(screen.getByRole('list', { name: /tutorial\.title/ })).getAllByRole('listitem')[n];
}

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

/** Anda até um passo pelo Continuar — o único caminho para a frente. */
function irPara(p: string) {
  const alvo = idx(p);
  for (let i = 0; i < alvo; i++) avancar();
  expect(screen.getByText(`passo-${p}`)).toBeInTheDocument();
}

describe('TutorialWizard — navegar pelo olhar', () => {
  beforeEach(() => {
    navigate.mockClear();
    gravarTutorial.mockClear();
    gaze.calibrado = true;
  });

  it('a trilha é um indicador: uma marca por passo, nenhuma é botão', () => {
    montar();
    const marcas = within(screen.getByRole('list', { name: /tutorial\.title/ })).getAllByRole('listitem');
    expect(marcas).toHaveLength(PASSOS_DO_TUTORIAL.length);
    // O contrato que mudou: dez alvos de 60 px não são alvos para o olhar.
    // Nada na trilha pode ser clicável, nem casar com o seletor de dwell.
    expect(screen.queryByRole('tab')).toBeNull();
    for (const m of marcas) {
      expect(m.querySelector('button, a, [role="button"]')).toBeNull();
      expect(m).toHaveAttribute('aria-label');
    }
  });

  it('a marca atual se anuncia para leitor de tela e acompanha o passo', () => {
    montar();
    expect(marca(0)).toHaveAttribute('aria-current', 'step');
    expect(marca(1)).not.toHaveAttribute('aria-current');
    avancar();
    expect(marca(1)).toHaveAttribute('aria-current', 'step');
    expect(marca(0)).not.toHaveAttribute('aria-current');
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

  it('Voltar está desabilitado só no primeiro passo, e volta de verdade', () => {
    montar();
    const voltar = () => screen.getByRole('button', { name: /tutorial\.back/ });
    expect(voltar()).toBeDisabled();
    irPara('ajuste');
    expect(voltar()).not.toBeDisabled();
    fireEvent.click(voltar());
    expect(screen.getByText('passo-pratica')).toBeInTheDocument();
  });

  it('Pular é um alvo de olhar (GazeButton, 76 px), não um texto', () => {
    montar();
    const pular = screen.getByRole('button', { name: /tutorial\.skip/ });
    expect(pular.className).toContain('gaze-button');
    expect(pular.style.height).toBe('76px');
    expect(pular).toHaveAttribute('data-isolado', 'true');
  });

  it('Pular sai sem gravar conclusão, de qualquer passo', () => {
    montar();
    irPara('comunicacao');
    fireEvent.click(screen.getByRole('button', { name: /tutorial\.skip/ }));
    expect(gravarTutorial).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/menu', { replace: true });
  });

  it('sem calibração avisa e dá o caminho — pelo olhar', () => {
    gaze.calibrado = false;
    montar();
    expect(screen.getByRole('alert')).toHaveTextContent(/tutorial\.semCalibracao\.texto/);
    const ir = screen.getByRole('button', { name: /tutorial\.semCalibracao\.ir/ });
    expect(ir.className).toContain('gaze-button');
    fireEvent.click(ir);
    expect(navigate).toHaveBeenCalledWith('/calibration-check');
  });

  it('com calibração não há aviso', () => {
    montar();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * O ensaio de emergência.
 *
 * "Não quero ensaiar agora" tem de FAZER alguma coisa (avançar), e o ensaio
 * feito tem de sobreviver a uma remontagem — o passo vem depois das missões
 * que saem desta rota, e um F5 zerava o `ensaiou` da conclusão.
 */
describe('TutorialWizard — o ensaio de emergência', () => {
  beforeEach(() => {
    navigate.mockClear();
    gravarTutorial.mockClear();
    gaze.calibrado = true;
  });

  it('"não quero ensaiar agora" avança o passo', () => {
    jaEscreveuUmaFrase();
    montar();
    irPara('emergencia');
    fireEvent.click(screen.getByText('nao-ensaiar'));
    expect(screen.getByText('passo-concluido')).toBeInTheDocument();
  });

  it('o ensaio feito é gravado na conclusão mesmo depois de remontar', () => {
    jaEscreveuUmaFrase();
    const { unmount } = montar();
    irPara('emergencia');
    fireEvent.click(screen.getByText('ensaiar'));
    unmount();

    montar();
    expect(screen.getByText('passo-emergencia')).toBeInTheDocument();
    avancar();
    avancar();
    expect(gravarTutorial).toHaveBeenCalledWith('p1', expect.objectContaining({ ensaiouEmergencia: true }));
  });

  it('sem ensaio a conclusão diz que não ensaiou', () => {
    jaEscreveuUmaFrase();
    montar();
    irPara('concluido');
    avancar();
    expect(gravarTutorial).toHaveBeenCalledWith('p1', expect.objectContaining({ ensaiouEmergencia: false }));
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
    gaze.calibrado = true;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('segura o Continuar enquanto a frase não foi escrita', () => {
    montar();
    irPara(PASSO_COM_TRAVA);
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
    irPara(PASSO_COM_TRAVA);
    expect(botaoAvancar()).not.toBeDisabled();
    avancar();
    expect(screen.getByText('passo-conversa')).toBeInTheDocument();
  });

  it('libera sozinha depois da espera máxima — ninguém fica preso', () => {
    vi.useFakeTimers();
    montar();
    irPara(PASSO_COM_TRAVA);
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
    irPara(PASSO_COM_TRAVA);
    fireEvent.click(screen.getByRole('button', { name: /tutorial\.skip/ }));
    expect(navigate).toHaveBeenCalledWith('/menu', { replace: true });
  });

  it('Voltar continua livre no passo travado', () => {
    montar();
    irPara(PASSO_COM_TRAVA);
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
    jaEscreveuUmaFrase();
    const { unmount } = montar();
    irPara('lazer');
    unmount();

    montar();
    expect(screen.getByText('passo-lazer')).toBeInTheDocument();
  });

  it('abre no passo guardado pela tela real (a volta de uma missão)', () => {
    guardarPasso('conversa');
    montar();
    expect(screen.getByText('passo-conversa')).toBeInTheDocument();
  });

  it('sair do tutorial esquece o passo — a próxima vez começa do começo', () => {
    jaEscreveuUmaFrase();
    const { unmount } = montar();
    irPara('lazer');
    fireEvent.click(screen.getByRole('button', { name: /tutorial\.skip/ }));
    unmount();

    montar();
    expect(screen.getByText('passo-oQueEDwell')).toBeInTheDocument();
  });
});
