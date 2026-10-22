import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RespostasSugeridas } from './RespostasSugeridas';
import { _reiniciarParaTeste, definirEmergenciaAtiva } from '../services/estadoDeEmergencia';
import { definirAssistenteDesligado, registrarFalaDoPaciente } from '../services/assistente';
import { reiniciarParaTeste } from '../services/assistente/armazenamento';
import { lerAceitacao, registrarSugestaoMostrada } from '../services/assistente/aceitacao';

// A faixa "Respostas sugeridas" (roadmap 1, rodada 3, 21/10/2026). Quatro coisas
// não podem falhar: nada é falado sem a escolha do paciente, cada botão se diz
// "sugestão", a faixa some em emergência e na tela da dor, e a aceitação é medida.

const pergunta = (sobre: Partial<{ id: string; text: string; kind: string }> = {}) => ({
  id: 'm1',
  text: 'Você quer água?',
  kind: 'texto',
  ...sobre,
});

function desenhar(
  props: Partial<React.ComponentProps<typeof RespostasSugeridas>> = {},
  rota = '/conversation',
) {
  const aoEscolher = vi.fn();
  const aoNenhuma = vi.fn();
  const todas = { mensagem: pergunta(), aoEscolher, aoNenhuma, ...props };
  const visual = render(
    <MemoryRouter initialEntries={[rota]}>
      <RespostasSugeridas {...todas} />
    </MemoryRouter>,
  );
  const de = (novas: Partial<React.ComponentProps<typeof RespostasSugeridas>>) =>
    visual.rerender(
      <MemoryRouter initialEntries={[rota]}>
        <RespostasSugeridas {...todas} {...novas} />
      </MemoryRouter>,
    );
  // `rerender` por último: o do Testing Library espera um elemento, este espera só as props novas.
  return { ...visual, aoEscolher, aoNenhuma, rerender: de };
}

const botoesDeSugestao = () => screen.queryAllByRole('button', { name: /^Sugestão de resposta:/ });

beforeEach(() => {
  localStorage.clear();
  reiniciarParaTeste();
  _reiniciarParaTeste();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a faixa de sugestões', () => {
  it('mostra até quatro respostas, cada uma com o rótulo "sugestão", e o Nenhuma', () => {
    desenhar();
    expect(screen.getByRole('region', { name: 'Respostas sugeridas' })).toBeInTheDocument();
    expect(botoesDeSugestao().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Sugestão de resposta: Sim, por favor',
      'Sugestão de resposta: Não, obrigado',
      'Sugestão de resposta: Só um pouco',
      'Sugestão de resposta: Mais tarde',
    ]);
    // O rótulo está escrito em cada botão, não só no nome acessível.
    expect(screen.getAllByText('sugestão')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /Nenhuma/ })).toBeInTheDocument();
  });

  it('os botões são alvos de olhar (GazeButton), com o Nenhuma incluído', () => {
    const { container } = desenhar();
    expect(container.querySelectorAll('button.gaze-button')).toHaveLength(5);
  });

  it('nunca fala sozinha: nada é escolhido ao aparecer, nem com o tempo parado', () => {
    vi.useFakeTimers();
    const { aoEscolher, aoNenhuma } = desenhar();
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(aoEscolher).not.toHaveBeenCalled();
    expect(aoNenhuma).not.toHaveBeenCalled();
  });

  it('escolher uma sugestão entrega o texto dela, uma vez só — o segundo clique não repete', () => {
    const { aoEscolher } = desenhar();
    const sim = screen.getByRole('button', { name: 'Sugestão de resposta: Sim, por favor' });
    fireEvent.click(sim);
    fireEvent.click(sim);
    expect(aoEscolher).toHaveBeenCalledTimes(1);
    expect(aoEscolher).toHaveBeenCalledWith('Sim, por favor');
  });

  it('o Nenhuma leva ao teclado e não escolhe nada', () => {
    const { aoEscolher, aoNenhuma } = desenhar();
    fireEvent.click(screen.getByRole('button', { name: /Nenhuma/ }));
    expect(aoNenhuma).toHaveBeenCalledTimes(1);
    expect(aoEscolher).not.toHaveBeenCalled();
  });

  it('as sugestões não trocam debaixo do olhar quando o modelo muda', () => {
    const { rerender } = desenhar();
    const antes = botoesDeSugestao().map((b) => b.getAttribute('aria-label'));
    registrarFalaDoPaciente('Quero um gole', 'Você quer água?');
    rerender({});
    expect(botoesDeSugestao().map((b) => b.getAttribute('aria-label'))).toEqual(antes);
  });

  it('o que o paciente já respondeu àquela pergunta vem na frente', () => {
    registrarFalaDoPaciente('Só um gole', 'Quer água?');
    desenhar({ mensagem: pergunta({ text: 'Quer água?' }) });
    expect(botoesDeSugestao()[0]).toHaveAttribute('aria-label', 'Sugestão de resposta: Só um gole');
  });

  it('não repete os botões que a tela já tem (Sim e Não)', () => {
    desenhar({ mensagem: pergunta({ text: 'Você vai sair?' }), jaNaTela: ['Sim', 'Não'] });
    const nomes = botoesDeSugestao().map((b) => b.getAttribute('aria-label'));
    expect(nomes).toEqual(['Sugestão de resposta: Não sei', 'Sugestão de resposta: Espere um pouco']);
  });
});

describe('quando a faixa não existe', () => {
  it('sem mensagem no ar', () => {
    desenhar({ mensagem: undefined });
    expect(screen.queryByRole('region', { name: 'Respostas sugeridas' })).toBeNull();
  });

  it('mensagem do cuidador de sim ou não (a Task 5 tem tela própria) e do sistema', () => {
    desenhar({ mensagem: pergunta({ kind: 'simnao' }) });
    expect(screen.queryByRole('region', { name: 'Respostas sugeridas' })).toBeNull();
    desenhar({ mensagem: pergunta({ kind: 'sistema' }) });
    expect(screen.queryAllByRole('region', { name: 'Respostas sugeridas' })).toHaveLength(0);
  });

  it('em emergência, e volta quando a emergência acaba', () => {
    desenhar();
    expect(botoesDeSugestao()).toHaveLength(4);
    act(() => definirEmergenciaAtiva(true, 'pedido'));
    expect(screen.queryByRole('region', { name: 'Respostas sugeridas' })).toBeNull();
    expect(botoesDeSugestao()).toHaveLength(0);
    act(() => definirEmergenciaAtiva(false, 'pedido'));
    expect(botoesDeSugestao()).toHaveLength(4);
  });

  it('já nascendo dentro de uma emergência, não aparece', () => {
    definirEmergenciaAtiva(true, 'tela');
    desenhar();
    expect(screen.queryByRole('region', { name: 'Respostas sugeridas' })).toBeNull();
  });

  it('na tela da dor e na de emergência', () => {
    desenhar({}, '/dor');
    expect(screen.queryByRole('region', { name: 'Respostas sugeridas' })).toBeNull();
    desenhar({}, '/emergency');
    expect(screen.queryAllByRole('region', { name: 'Respostas sugeridas' })).toHaveLength(0);
  });

  // Decisão de 21/10/2026 (rodada de correção 1 da Task 7): "nunca na dor" vale para a
  // PERGUNTA. Uma resposta pronta com o sentido trocado sobre dor ("A dor passou?" →
  // "Sim, estou com dor") é perigosa; o paciente responde pelo teclado ou pelo mapa da dor.
  it.each([
    'Está com dor?',
    'A dor passou?',
    'A dor melhorou?',
    'O remédio aliviou a dor?',
    'Onde dói?',
    'Quanto dói de 0 a 10?',
    'Está doendo?',
  ])('pergunta de dor ("%s"): sem faixa, nem com o que o paciente já respondeu, e nada é contado como mostrado', (texto) => {
    for (let i = 0; i < 3; i++) registrarFalaDoPaciente('Um pouco', texto);
    desenhar({ mensagem: pergunta({ text: texto }) });
    expect(screen.queryByRole('region', { name: 'Respostas sugeridas' })).toBeNull();
    expect(botoesDeSugestao()).toHaveLength(0);
    expect(screen.queryByTestId('respostas-recolhidas')).toBeNull();
    expect(lerAceitacao().mostradas).toBe(0);
  });

  it('uma pergunta comum ("Quer água?") continua com a faixa', () => {
    desenhar({ mensagem: pergunta({ text: 'Quer água?' }) });
    expect(screen.getByRole('region', { name: 'Respostas sugeridas' })).toBeInTheDocument();
    expect(botoesDeSugestao()).toHaveLength(4);
  });

  it('com as sugestões desligadas nos ajustes', () => {
    definirAssistenteDesligado(true);
    desenhar();
    expect(screen.queryByRole('region', { name: 'Respostas sugeridas' })).toBeNull();
  });

  it('quando não há o que sugerir (pergunta aberta sem histórico), e nada é contado como mostrado', () => {
    desenhar({ mensagem: pergunta({ text: 'O que você quer comer hoje?' }) });
    expect(screen.queryByRole('region', { name: 'Respostas sugeridas' })).toBeNull();
    expect(lerAceitacao().mostradas).toBe(0);
  });
});

describe('a fileira de alvos', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A zona de acerto do GazeButton passa 12 px da borda do cartão. Numa grade
  // com `overflow: auto` (o padrão) a última — aqui a única — linha fazia a
  // faixa "transbordar" sem faltar espaço: uma barra de rolagem fantasma e o
  // anel de dwell cortado. A Home e a Conversa já pedem `rolarSoSeNaoCouber`
  // por isso (GazeGrid.test.tsx); a faixa mora na Conversa e faz a mesma conta.
  it('não vira contêiner de rolagem quando cabe: a zona de acerto não cria barra de rolagem', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(250);
    const { container } = desenhar();
    const grade = container.querySelector('.gaze-grid') as HTMLElement;
    expect(grade.style.overflow).toBe('visible');
  });

  it('se a altura não comportar o alvo de 5°, rola como antes — o piso não encolhe', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120);
    const { container } = desenhar();
    const grade = container.querySelector('.gaze-grid') as HTMLElement;
    expect(grade.style.overflowY).toBe('auto');
    expect(grade.style.gridTemplateRows).toMatch(/^repeat\(1, minmax\(\d+px, 1fr\)\)$/);
  });

  // Medido num Chromium de verdade, com a Conversa montada (21/10/2026): o
  // `GazeGrid` tem `height: 100%`, e numa faixa com título esse 100% é a altura
  // da FAIXA INTEIRA — a grade ficava com a altura do título a mais, os alvos
  // saíam 34 px para fora da faixa (232 px em vez de 198) e o fim deles era
  // cortado pela borda da tela. Uma altura explícita, a do alvo mínimo, fecha a conta.
  it('a fileira tem a altura exata do alvo mínimo: a grade não herda a altura da faixa (o título a empurraria para fora)', () => {
    document.documentElement.style.setProperty('--gaze-target-min', '193px');
    try {
      const { container } = desenhar();
      const grade = container.querySelector('.gaze-grid') as HTMLElement;
      expect(grade.parentElement?.style.height).toBe('193px');
    } finally {
      document.documentElement.style.removeProperty('--gaze-target-min');
    }
  });
});

describe('a medida da largura da faixa (navegador de verdade, com ResizeObserver)', () => {
  // O jsdom não tem layout nem ResizeObserver; estes testes simulam os dois para
  // cobrir o caminho que roda no app: medir a largura e deixar caber só o que
  // cabe sem passar do alvo mínimo de 5° (198 px nesta geometria).
  class ObservadorParado {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const comLargura = (px: number) => {
    vi.stubGlobal('ResizeObserver', ObservadorParado);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(px);
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('antes de medir a largura, não desenha os alvos — nem por um quadro com colunas estreitas demais', () => {
    comLargura(0);
    document.documentElement.style.setProperty('--gaze-target-min', '193px');
    try {
      desenhar();
      // O espaço da fileira já está reservado: o registro de mensagens não muda de
      // tamanho quando os alvos aparecem, e a pergunta no fim dele não sai da vista.
      expect(screen.getByTestId('respostas-fileira').style.height).toBe('193px');
    } finally {
      document.documentElement.style.removeProperty('--gaze-target-min');
    }
    expect(botoesDeSugestao()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Nenhuma/ })).toBeNull();
    // O título e o aviso de que as sugestões só falam se o paciente escolher já estão lá.
    expect(screen.getByText('só falam se você escolher')).toBeInTheDocument();
    // E sem alvo na tela não há "mostrada" para contar: a taxa de aceitação não pode
    // cair por botões que ninguém chegou a ver.
    expect(lerAceitacao().mostradas).toBe(0);
  });

  it.each([
    [668, 2],
    [960, 3],
    [1290, 4],
  ])('numa coluna de %i px cabem %i sugestões, mais o Nenhuma', (largura, sugestoes) => {
    comLargura(largura);
    desenhar();
    expect(botoesDeSugestao()).toHaveLength(sugestoes);
    expect(screen.getByRole('button', { name: /Nenhuma/ })).toBeInTheDocument();
  });

  it('as que sobram são as menos prováveis: ficam as primeiras', () => {
    comLargura(668);
    desenhar();
    expect(botoesDeSugestao().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Sugestão de resposta: Sim, por favor',
      'Sugestão de resposta: Não, obrigado',
    ]);
  });
});

describe('a medida de quantas sugestões são aceitas', () => {
  it('conta uma mostrada por mensagem, mesmo se a faixa for desenhada de novo', () => {
    const { rerender, unmount } = desenhar();
    rerender({});
    expect(lerAceitacao().mostradas).toBe(1);
    unmount();
    desenhar();
    expect(lerAceitacao().mostradas).toBe(1);
  });

  it('uma mensagem nova conta de novo', () => {
    const { rerender } = desenhar();
    rerender({ mensagem: pergunta({ id: 'm2', text: 'Quer um cobertor?' }) });
    expect(lerAceitacao().mostradas).toBe(2);
  });

  it('escolher conta uma aceita; não escolher nada não conta', () => {
    desenhar();
    expect(lerAceitacao()).toMatchObject({ mostradas: 1, aceitas: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Sugestão de resposta: Não, obrigado' }));
    expect(lerAceitacao()).toMatchObject({ mostradas: 1, aceitas: 1, taxa: 1 });
  });

  it('o Nenhuma não conta como aceita', () => {
    desenhar();
    fireEvent.click(screen.getByRole('button', { name: /Nenhuma/ }));
    expect(lerAceitacao()).toMatchObject({ mostradas: 1, aceitas: 0 });
  });
});

describe('quando poucas são aceitas, a faixa recolhe', () => {
  const vinteSemAceitar = () => {
    for (let i = 0; i < 20; i++) registrarSugestaoMostrada(`antiga${i}`);
  };

  it('abaixo de 30% em 20 mostradas: vira uma linha com o aviso e o botão de mostrar de novo', () => {
    vinteSemAceitar();
    desenhar();
    expect(botoesDeSugestao()).toHaveLength(0);
    expect(screen.getByText(/Sugestões de resposta recolhidas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mostrar de novo' })).toBeInTheDocument();
  });

  it('recolhida não conta como mostrada', () => {
    vinteSemAceitar();
    desenhar();
    expect(lerAceitacao().mostradas).toBe(20);
  });

  it('o botão de mostrar de novo é do mouse e do teclado: o olhar não o aciona por acidente', () => {
    vinteSemAceitar();
    desenhar();
    expect(screen.getByRole('button', { name: 'Mostrar de novo' })).toHaveAttribute('data-no-dwell', 'true');
  });

  it('mostrar de novo traz as sugestões e passa a contá-las', () => {
    vinteSemAceitar();
    desenhar();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar de novo' }));
    expect(botoesDeSugestao()).toHaveLength(4);
    expect(lerAceitacao().mostradas).toBe(21);
  });

  it('com menos de 20 mostradas ela nunca recolhe', () => {
    for (let i = 0; i < 19; i++) registrarSugestaoMostrada(`antiga${i}`);
    desenhar();
    expect(botoesDeSugestao()).toHaveLength(4);
  });
});
