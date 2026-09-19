import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

/**
 * O CAMINHO QUENTE.
 *
 * O engine emite ~30 amostras por segundo. Tudo que esse callback faz, faz
 * trinta vezes por segundo, para sempre. Duas coisas não podem acontecer aí:
 *
 *  1. re-render do React fora de MUDANÇA DE ESTADO. A posição do cursor vive
 *     num `ref` e é escrita direto no DOM; se ela passasse por `setState`, a
 *     árvore inteira reconciliaria 30×/s e o cursor ganharia a latência de um
 *     render — que é exatamente a queixa de "o gaze trava".
 *
 *  2. escrita repetida de propriedades de estilo que NÃO mudaram. `box-shadow`
 *     (três camadas, uma com blur), `border` (invalida a caixa) e `background`
 *     (com transição CSS, que reiniciava a cada quadro) eram reescritos a cada
 *     amostra com o mesmo valor.
 *
 * Este arquivo mede as duas coisas em vez de confiar na leitura do código.
 */

let emitir: (s: GazeSample) => void = () => {};

const engineMock = {
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  dispose: vi.fn(),
  subscribe: (cb: (s: GazeSample) => void) => {
    emitir = cb;
    return () => {};
  },
  onStateChange: () => () => {},
  onL2CSStatusChange: () => () => {},
  getState: () => 'tracking',
  getSessionUptimeMs: () => 1000,
  getDiagnostics: () => null,
  setFilterPreset: vi.fn(),
  setScreenGeometry: vi.fn(),
  calibration: {
    isCalibrated: () => true,
    onInvalidated: () => () => {},
    setCameraFovDeg: vi.fn(),
    setEyeDominance: vi.fn(),
    getDistanceRange: () => null,
    getCalibrationDistancesCm: () => ({ cameraCm: null, screenCm: null }),
    abort: vi.fn(),
    clear: vi.fn(),
  },
  recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
};

vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return { ...real, createGazeEngine: () => engineMock };
});

vi.mock('./SettingsContext', () => ({
  useSettings: () => ({
    settings: { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both' },
    updateSettings: vi.fn(),
  }),
}));

import { GazeProvider } from './GazeContext';
import { instalarRelogioDeQuadros, type RelogioDeQuadros } from '../test/quadros';

/** Quantas amostras uma sessão de um segundo entrega. */
const AMOSTRAS_POR_SEGUNDO = 30;

/**
 * Quadros de display por amostra: 60 Hz de tela contra 30 Hz de câmera.
 *
 * É o número que mudou de significado. Antes a posição do cursor era escrita
 * uma vez por AMOSTRA (o quadro sem amostra não desenhava nada, e o quadro com
 * amostra recebia o passo inteiro — o "para-e-teleporta" das gravações). Agora
 * é escrita uma vez por QUADRO, com o passo dividido entre eles.
 */
const QUADROS_POR_AMOSTRA = 2;

function amostra(x: number, y: number): GazeSample {
  return {
    x,
    y,
    timestamp: 0,
    hasFace: true,
    degraded: false,
    uncalibrated: false,
    eyeState: 'open',
  } as GazeSample;
}

/** O provider cria o cursor como um `div[aria-hidden]` filho direto do body. */
function cursor(): HTMLElement {
  const el = document.body.querySelector<HTMLElement>(':scope > div[aria-hidden="true"]');
  if (!el) throw new Error('cursor não montado');
  return el;
}

/** Nomes CSS, como o caminho quente os escreve. */
type PropriedadeMedida = 'transform' | 'background' | 'box-shadow' | 'border' | 'opacity';

/**
 * Conta escritas de estilo no elemento.
 *
 * Envolve `setProperty`/`removeProperty` da INSTÂNCIA (não do protótipo), que
 * é por onde o caminho quente escreve — assim só este elemento é observado e
 * nada vaza para outros testes.
 */
function contarEscritas(
  el: HTMLElement,
  props: readonly PropriedadeMedida[]
): Record<PropriedadeMedida, number> {
  const contagem = {} as Record<PropriedadeMedida, number>;
  for (const prop of props) contagem[prop] = 0;

  const estilo = el.style;
  const setOriginal = estilo.setProperty.bind(estilo);
  const removeOriginal = estilo.removeProperty.bind(estilo);
  const registrar = (nome: string) => {
    if (nome in contagem) contagem[nome as PropriedadeMedida] += 1;
  };
  estilo.setProperty = (nome: string, valor: string | null, prioridade?: string) => {
    registrar(nome);
    setOriginal(nome, valor, prioridade);
  };
  estilo.removeProperty = (nome: string) => {
    registrar(nome);
    return removeOriginal(nome);
  };
  return contagem;
}

describe('GazeContext — o caminho quente a 30 Hz', () => {
  let relogio: RelogioDeQuadros;

  /** Emite uma amostra e deixa os quadros de display correspondentes rodarem. */
  function emitirEPintar(x: number, y: number): void {
    act(() => {
      emitir(amostra(x, y));
    });
    relogio.quadros(QUADROS_POR_AMOSTRA);
  }

  beforeEach(() => {
    emitir = () => {};
    // O cursor só é desenhado em rota de paciente (ver `rotasComCursor.ts`);
    // sem isto o jsdom começa com hash vazio, que é a abertura, e o caminho
    // quente mediria um cursor legitimamente escondido.
    window.location.hash = '#/menu';
    relogio = instalarRelogioDeQuadros();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new Error('sem câmera no teste');
        }),
      },
    });
    // Sem alvo sob o olhar: nenhum dwell, que é o estado de repouso da UI.
    document.elementFromPoint = vi.fn(() => document.body);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    relogio.restaurar();
    vi.restoreAllMocks();
  });

  it('um segundo de amostras não re-renderiza a árvore nenhuma vez', () => {
    let renders = 0;
    const Filho: React.FC = () => {
      renders += 1;
      return <div>filho</div>;
    };

    render(
      <GazeProvider>
        <Filho />
      </GazeProvider>
    );

    const rendersNaMontagem = renders;

    for (let i = 0; i < AMOSTRAS_POR_SEGUNDO; i++) emitirEPintar(400 + i, 300 + i);

    // Nada mudou de ESTADO: nem rosto perdido, nem dwell, nem degradado. O
    // cursor andou 60 vezes (um segundo de quadros) e o React não soube de
    // nada — é isso que mantém a latência do cursor no custo de uma escrita de
    // `transform`. O laço de pintura entra nessa conta: ele roda a 60 Hz e não
    // pode tocar em estado do React nem uma vez.
    expect(renders).toBe(rendersNaMontagem);
  });

  it('o estilo do cursor só é reescrito no que muda de fato', () => {
    render(
      <GazeProvider>
        <div />
      </GazeProvider>
    );

    // Primeira amostra: estabelece os valores. As seguintes é que contam.
    emitirEPintar(400, 300);

    const contagem = contarEscritas(cursor(), [
      'background',
      'box-shadow',
      'border',
      'opacity',
      'transform',
    ]);

    for (let i = 1; i <= AMOSTRAS_POR_SEGUNDO; i++) emitirEPintar(400 + i, 300 + i);

    const QUADROS = AMOSTRAS_POR_SEGUNDO * QUADROS_POR_AMOSTRA;

    // A posição muda a cada QUADRO — essa escrita é o trabalho útil, e é o
    // trabalho que o desacoplamento acrescentou de propósito. O mesmo caminho
    // percorrido, em passos menores.
    expect(contagem.transform).toBe(QUADROS);
    expect(contagem.transform).toBeGreaterThan(AMOSTRAS_POR_SEGUNDO);
    // Estas não mudam com a posição. Antes eram 30 escritas por segundo cada
    // uma; a de `background` ainda reiniciava uma transição CSS a cada quadro.
    // Dobrar a taxa de pintura NÃO pode dobrar o custo delas: o cache é o que
    // torna o laço de 60 Hz mais barato que o de 30 Hz que ele substituiu.
    expect(contagem.background).toBe(0);
    expect(contagem['box-shadow']).toBe(0);
    expect(contagem.border).toBe(0);
    expect(contagem.opacity).toBe(0);
  });

  it('o cursor escondido não é reescrito a cada quadro', () => {
    const estadoOriginal = engineMock.getState;
    engineMock.getState = () => 'calibrating';
    try {
      render(
        <GazeProvider>
          <div />
        </GazeProvider>
      );
      emitirEPintar(400, 300);

      const contagem = contarEscritas(cursor(), ['transform', 'opacity']);
      for (let i = 0; i < AMOSTRAS_POR_SEGUNDO; i++) emitirEPintar(400 + i, 300 + i);

      // Durante a calibração o cursor fica parado fora da tela. Antes, as duas
      // propriedades eram reescritas com o MESMO valor 30 vezes por segundo,
      // durante os 1–2 minutos inteiros da coleta.
      //
      // Com o laço de pintura isto vale duplamente: são 60 oportunidades por
      // segundo de repintar um cursor que não deve aparecer. O laço tem que
      // sair na primeira linha, e é isso que a contagem zero prova.
      expect(contagem.transform).toBe(0);
      expect(contagem.opacity).toBe(0);
    } finally {
      engineMock.getState = estadoOriginal;
    }
  });
});
