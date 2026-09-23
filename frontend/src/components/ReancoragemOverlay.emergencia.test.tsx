import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GazeSample } from '@tracker/tracker/engine';

// -----------------------------------------------------------------------------
// Reajuste rápido × Emergência.
//
// O overlay do reajuste é preto e cobre a tela inteira por 2 s. Antes, cobria
// também o botão de Emergência (z-index 1000001 contra 99990): durante a
// coleta, quem precisasse de socorro não tinha como pedir. O contrato agora:
//   1. a Emergência fica POR CIMA do overlay, visível e acionável pelo olhar
//      (dwell), pelo mouse e pelo teclado;
//   2. o alvo do reajuste (centro) nunca fica sob o botão (canto);
//   3. escolher a Emergência cancela o reajuste — as amostras são DESCARTADAS
//      no engine — e segue o fluxo normal (a confirmação com contagem).
// -----------------------------------------------------------------------------

let emitir: (s: GazeSample) => void = () => {};
/** Resolve a promessa do reajuste em curso (o engine resolveria ao fim dos 2 s). */
let resolverReajuste: (r: { amostras: number; aplicado: boolean; desvioPx: number | null }) => void = () => {};

function novoEngine(opcoes: { comCancelamento: boolean }) {
  const engine: Record<string, unknown> = {
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
    // A referência lenta pede o reajuste: é o que faz o aviso de postura (e
    // o botão "Reajustar (2 s)") aparecer — o caminho real do usuário.
    sugereReancoragem: () => true,
    precisaDeRecalibracao: () => ({ precisa: false, motivo: null }),
    reancorarReferencias: vi.fn(
      () =>
        new Promise<{ amostras: number; aplicado: boolean; desvioPx: number | null }>((r) => {
          resolverReajuste = r;
        })
    ),
    calibration: {
      isCalibrated: () => true,
      onInvalidated: () => () => {},
      setCameraFovDeg: vi.fn(),
      setEyeDominance: vi.fn(),
      abort: vi.fn(),
      clear: vi.fn(),
      getDistanceRange: () => null,
      getCalibrationDistancesCm: () => ({ screenCm: null }),
    },
    recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
  };
  if (opcoes.comCancelamento) {
    // Como o engine faz: abandona a coleta e resolve a promessa SEM aplicar nada.
    engine.cancelarReancoragem = vi.fn(() => resolverReajuste({ amostras: 0, aplicado: false, desvioPx: null }));
  }
  return engine;
}

let engineAtual: Record<string, unknown> = novoEngine({ comCancelamento: true });

vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return { ...real, createGazeEngine: () => engineAtual };
});

vi.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both' },
    updateSettings: vi.fn(),
  }),
}));

import { GazeProvider } from '../context/GazeContext';
import {
  EmergencyProvider,
  EMERGENCIA_ALTURA_PX,
  EMERGENCIA_LARGURA_PX,
  Z_EMERGENCIA_NO_REAJUSTE,
} from '../context/EmergencyContext';
import { LADO_DO_ALVO_PX, Z_DO_REAJUSTE } from './ReancoragemOverlay';

const NOME_DA_EMERGENCIA = 'Disparar Emergência Médica';

function montar(rota = '/menu') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <GazeProvider>
        <EmergencyProvider>
          <div>
            tela <button type="button">botão da tela</button>
          </div>
        </EmergencyProvider>
      </GazeProvider>
    </MemoryRouter>
  );
}

/** Espera o aviso de postura (tick de 500 ms) e aperta "Reajustar (2 s)". */
async function iniciarReajuste() {
  const reajustar = await screen.findByRole('button', { name: 'Reajustar (2 s)' }, { timeout: 2000 });
  act(() => void fireEvent.click(reajustar));
  expect(engineAtual.reancorarReferencias).toHaveBeenCalledTimes(1);
  return screen.getByTestId('reancoragem-overlay');
}

function amostra(t: number): GazeSample {
  return {
    x: 900,
    y: 60,
    timestamp: t,
    hasFace: true,
    degraded: false,
    uncalibrated: false,
    eyeState: 'open',
  } as GazeSample;
}

/** Olhar parado sobre o que `elementFromPoint` devolve, a 30 quadros/s, por `ms`. */
function olhar(ms: number) {
  const passo = 1000 / 30;
  act(() => {
    for (let t = 0; t <= ms; t += passo) emitir(amostra(t));
  });
}

function caixaDaEmergencia(): HTMLElement {
  return screen.getByRole('button', { name: NOME_DA_EMERGENCIA }).parentElement as HTMLElement;
}

describe('reajuste rápido: a Emergência continua por cima', () => {
  beforeEach(() => {
    engineAtual = novoEngine({ comCancelamento: true });
    emitir = () => {};
    resolverReajuste = () => {};
    // Câmera "abrindo" para sempre: sem erro de câmera (que esconderia o aviso
    // de postura) e sem precisar simular o aquecimento do vídeo.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() => new Promise(() => {})),
        enumerateDevices: vi.fn(async () => []),
      },
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o botão fica visível, acima do overlay e fora dele', async () => {
    montar();
    const overlay = await iniciarReajuste();

    const botao = screen.getByRole('button', { name: NOME_DA_EMERGENCIA });
    const caixa = caixaDaEmergencia();
    expect(overlay.contains(botao)).toBe(false);
    expect(Number(caixa.style.zIndex)).toBe(Z_EMERGENCIA_NO_REAJUSTE);
    expect(Number(caixa.style.zIndex)).toBeGreaterThan(Number(overlay.style.zIndex));
    expect(Number(overlay.style.zIndex)).toBe(Z_DO_REAJUSTE);
    expect(caixa.style.visibility).not.toBe('hidden');
    expect(botao).not.toBeDisabled();
    expect(botao.getAttribute('data-no-dwell')).toBeNull();
    // Não é modal: a Emergência continua existindo para o leitor de tela.
    expect(overlay.getAttribute('aria-modal')).not.toBe('true');
  });

  it('pelo OLHAR (dwell): cancela o reajuste, descarta as amostras e abre a confirmação', async () => {
    montar();
    await iniciarReajuste();
    const botao = screen.getByRole('button', { name: NOME_DA_EMERGENCIA });
    // O olhar cai na Emergência — é o elemento do topo naquele ponto, porque
    // ela está acima do overlay preto.
    document.elementFromPoint = vi.fn(() => botao);

    olhar(2300); // dwell da Emergência: 2000 ms

    expect(engineAtual.cancelarReancoragem).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('reancoragem-overlay')).toBeNull();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('EMERGÊNCIA ACIONADA');
  });

  it('pelo MOUSE: o mesmo fluxo', async () => {
    montar();
    await iniciarReajuste();

    act(() => void fireEvent.click(screen.getByRole('button', { name: NOME_DA_EMERGENCIA })));

    expect(engineAtual.cancelarReancoragem).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('reancoragem-overlay')).toBeNull();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('EMERGÊNCIA ACIONADA');
  });

  it('pelo TECLADO: Tab (e Shift+Tab) vai para a Emergência — nunca para um botão escondido sob o overlay — e Enter aciona', async () => {
    const user = userEvent.setup();
    montar();
    await iniciarReajuste();
    const botao = screen.getByRole('button', { name: NOME_DA_EMERGENCIA });

    await user.tab();
    expect(document.activeElement).toBe(botao);
    await user.tab();
    expect(document.activeElement).toBe(botao);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(botao);
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'botão da tela' }));
    // Sem foco automático: o botão só recebe foco quando alguém aperta Tab.
    await user.keyboard('{Enter}');

    expect(engineAtual.cancelarReancoragem).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('reancoragem-overlay')).toBeNull();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('EMERGÊNCIA ACIONADA');
  });

  it('o botão não rouba o foco sozinho quando o reajuste começa', async () => {
    montar();
    await iniciarReajuste();
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: NOME_DA_EMERGENCIA }));
  });

  it('fora do reajuste o botão volta à camada normal e o Tab volta a ser da página', async () => {
    montar();
    await iniciarReajuste();
    // Durante: o Tab é desviado para a Emergência.
    expect(fireEvent.keyDown(document.body, { key: 'Tab' })).toBe(false);
    await act(async () => {
      resolverReajuste({ amostras: 55, aplicado: true, desvioPx: 24 });
    });
    await waitFor(() => expect(screen.queryByTestId('reancoragem-overlay')).toBeNull());

    expect(Number(caixaDaEmergencia().style.zIndex)).toBeLessThan(Z_DO_REAJUSTE);
    // Depois: o Tab segue o fluxo normal da página.
    expect(fireEvent.keyDown(document.body, { key: 'Tab' })).toBe(true);
    // Reajuste concluído normalmente: não houve cancelamento.
    expect(engineAtual.cancelarReancoragem).not.toHaveBeenCalled();
  });

  it('durante uma emergência em curso o reajuste não começa (não tapa a confirmação)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    montar();
    // Emergência escolhida: abre a contagem de confirmação.
    act(() => void fireEvent.click(screen.getByRole('button', { name: NOME_DA_EMERGENCIA })));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    const reajustar = await screen.findByRole('button', { name: 'Reajustar (2 s)' }, { timeout: 2000 });
    act(() => void fireEvent.click(reajustar));

    expect(engineAtual.reancorarReferencias).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reancoragem-overlay')).toBeNull();
    expect(screen.getByRole('button', { name: 'CANCELAR' })).toBeInTheDocument();
    expect(aviso.mock.calls.some((c) => String(c[0]).includes('emergência em curso'))).toBe(true);
  });

  it('também nas telas do cuidador, onde o botão normalmente não aparece', async () => {
    montar('/settings');
    expect(screen.queryByRole('button', { name: NOME_DA_EMERGENCIA })).toBeNull();
    await iniciarReajuste();
    expect(screen.getByRole('button', { name: NOME_DA_EMERGENCIA })).toBeInTheDocument();
  });

  it('engine sem cancelarReancoragem: o overlay sai igual, e o log diz que a coleta NÃO foi descartada', async () => {
    engineAtual = novoEngine({ comCancelamento: false });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    montar();
    await iniciarReajuste();

    act(() => void fireEvent.click(screen.getByRole('button', { name: NOME_DA_EMERGENCIA })));

    expect(screen.queryByTestId('reancoragem-overlay')).toBeNull();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(aviso.mock.calls.some((c) => String(c[0]).includes('cancelarReancoragem'))).toBe(true);

    // A coleta termina em segundo plano: a resolução tardia não traz o
    // overlay de volta por cima da confirmação.
    await act(async () => {
      resolverReajuste({ amostras: 40, aplicado: true, desvioPx: 18 });
    });
    expect(screen.queryByTestId('reancoragem-overlay')).toBeNull();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------------
// Geometria: o alvo do reajuste (centro exato — é o que o engine pressupõe)
// contra a pegada do botão de Emergência, nas duas posições que ele assume.
// jsdom não faz layout, então a conta sai das mesmas constantes que o CSS usa.
// -----------------------------------------------------------------------------

const AQUI = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(AQUI, '../index.css'), 'utf8');
const mainDoElectron = readFileSync(resolve(AQUI, '../../../electron/main.ts'), 'utf8');

interface Retangulo { x0: number; y0: number; x1: number; y1: number }
const intersectam = (a: Retangulo, b: Retangulo) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const clamp = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

describe('o alvo do reajuste nunca fica sob a Emergência', () => {
  it('as constantes da conta são as do CSS e da janela mínima', () => {
    expect(css).toMatch(/--pagina-margem-x:\s*clamp\(1rem,\s*2\.5vw,\s*3rem\)/);
    expect(css).toMatch(/--pagina-margem-topo:\s*clamp\(1rem,\s*2\.5vh,\s*2rem\)/);
    expect(css).toMatch(/--emergencia-topo:\s*calc\(var\(--pagina-margem-topo\)\s*\+\s*16px\)/);
    expect(mainDoElectron).toMatch(/minWidth:\s*1024/);
    expect(mainDoElectron).toMatch(/minHeight:\s*640/);
  });

  const larguras = [1024, 1280, 1366, 1440, 1600, 1920, 2560, 3840];
  const alturas = [640, 720, 768, 900, 1080, 1440, 2160];

  it.each(larguras.flatMap((w) => alturas.map((h) => [w, h] as const)))('%i × %i', (w, h) => {
    // Alvo: SVG de 120 px centrado na horizontal; na vertical, o bloco
    // alvo+frase é centrado — margem folgada de ±150 px em torno do meio.
    const alvo: Retangulo = {
      x0: (w - LADO_DO_ALVO_PX) / 2,
      x1: (w + LADO_DO_ALVO_PX) / 2,
      y0: h / 2 - 150,
      y1: h / 2 + 150,
    };
    // Botão no topo (uso normal): `right: --emergencia-direita`, `top: --emergencia-topo`.
    const direita = clamp(16, 0.025 * w, 48);
    const topo = clamp(16, 0.025 * h, 32) + 16;
    const noTopo: Retangulo = {
      x0: w - direita - EMERGENCIA_LARGURA_PX,
      x1: w - direita,
      y0: topo,
      y1: topo + EMERGENCIA_ALTURA_PX,
    };
    // Botão no canto (durante medição): 176 × 52 a 1,5rem das bordas.
    const noCanto: Retangulo = { x0: w - 24 - 176, x1: w - 24, y0: h - 24 - 52, y1: h - 24 };

    expect(intersectam(alvo, noTopo)).toBe(false);
    expect(intersectam(alvo, noCanto)).toBe(false);
  });
});
