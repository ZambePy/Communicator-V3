import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

/**
 * Modo só horizontal (pedido de 21/10/2026), no despachante de verdade: com
 * zonas laterais na tela, o alvo é resolvido pela coluna do olhar.
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
  calibration: {
    isCalibrated: () => true,
    onInvalidated: () => () => {},
    setCameraFovDeg: vi.fn(),
    setEyeDominance: vi.fn(),
    abort: vi.fn(),
    clear: vi.fn(),
  },
  recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
};

vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return { ...real, createGazeEngine: () => engineMock };
});

const ajustes = {
  dwellMs: 1500,
  filterPreset: 'balanceado-v2',
  eyeDominance: 'both',
  viewingDistanceCm: 60,
  screenDiagonalIn: 23.6,
  modoHorizontal: true,
};
vi.mock('./SettingsContext', () => ({
  useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }),
}));

import { GazeProvider, avisarConteudoNovoSobOOlhar } from './GazeContext';
import { registrarZonaLateral, _limparZonasLaterais } from '../components/ui/zonasLaterais';

type Caixa = { left: number; top: number; right: number; bottom: number };
const caixas = new Map<Element, Caixa>();
let camadas: HTMLElement[] = [];

function comCaixa(el: HTMLElement, c: Caixa) {
  caixas.set(el, c);
  el.getBoundingClientRect = () =>
    ({ ...c, x: c.left, y: c.top, width: c.right - c.left, height: c.bottom - c.top, toJSON: () => c }) as DOMRect;
}

// O "elementFromPoint" do teste: a camada mais de cima cuja caixa contém o ponto.
function hitTest(x: number, y: number): Element | null {
  for (let i = camadas.length - 1; i >= 0; i--) {
    const c = caixas.get(camadas[i]);
    if (c && x >= c.left && x < c.right && y >= c.top && y < c.bottom) return camadas[i];
  }
  return null;
}

let t = 0;
function olhar(ms: number, x: number, y: number, over: Partial<GazeSample> = {}) {
  const passo = 1000 / 30;
  act(() => {
    for (const fim = t + ms; t <= fim; t += passo) {
      emitir({ x, y, timestamp: t, hasFace: true, degraded: false, uncalibrated: false, eyeState: 'open', ...over } as GazeSample);
    }
  });
}

const cliques = {
  voltar: vi.fn(),
  nao: vi.fn(),
  sim: vi.fn(),
  socorro: vi.fn(),
};

function montarTelaLateral() {
  render(
    <GazeProvider>
      <button data-testid="voltar" onClick={cliques.voltar}>Voltar</button>
      <button data-testid="socorro" data-emergency="true" data-dwell-ms="2000" onClick={cliques.socorro}>Emergência</button>
      <button data-testid="nao" onClick={cliques.nao}>Não</button>
      <button data-testid="sim" onClick={cliques.sim}>Sim</button>
    </GazeProvider>
  );
  const voltar = screen.getByTestId('voltar');
  const socorro = screen.getByTestId('socorro');
  const nao = screen.getByTestId('nao');
  const sim = screen.getByTestId('sim');
  comCaixa(voltar, { left: 0, top: 0, right: 120, bottom: 120 });
  comCaixa(socorro, { left: 800, top: 0, right: 1000, bottom: 96 });
  comCaixa(nao, { left: 0, top: 160, right: 400, bottom: 740 });
  comCaixa(sim, { left: 600, top: 160, right: 1000, bottom: 740 });
  camadas = [nao, sim, voltar, socorro];
  return { voltar, socorro, nao, sim };
}

describe('despachante — zonas laterais (modo só horizontal)', () => {
  beforeEach(() => {
    window.location.hash = '#/sim-nao';
    ajustes.modoHorizontal = true;
    emitir = () => {};
    t = 0;
    caixas.clear();
    camadas = [];
    _limparZonasLaterais();
    for (const f of Object.values(cliques)) f.mockClear();
    document.elementFromPoint = vi.fn((x: number, y: number) => hitTest(x, y));
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1024 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 768 });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera no teste'); }) },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    _limparZonasLaterais();
    vi.restoreAllMocks();
  });

  it('o dwell ignora o y: olhar na coluna da metade esquerda, com o y acima da tela, escolhe a esquerda', () => {
    const { nao } = montarTelaLateral();
    registrarZonaLateral(nao);
    olhar(1700, 200, -60);
    expect(cliques.nao).toHaveBeenCalledTimes(1);
    expect(cliques.sim).not.toHaveBeenCalled();
  });

  it('modo só horizontal: o y que caiu no Voltar não leva o paciente para fora — vale a zona da coluna', () => {
    const { nao, sim } = montarTelaLateral();
    registrarZonaLateral(nao);
    registrarZonaLateral(sim);
    olhar(1700, 60, 60);
    expect(cliques.voltar).not.toHaveBeenCalled();
    expect(cliques.nao).toHaveBeenCalledTimes(1);
  });

  it('modo só horizontal: no vão do meio, numa tela lateral, nada é acionado (nem o que está sob o ponto)', () => {
    const { nao, sim } = montarTelaLateral();
    registrarZonaLateral(nao);
    registrarZonaLateral(sim);
    const ouvir = document.createElement('button');
    const ouvirClicado = vi.fn();
    ouvir.addEventListener('click', ouvirClicado);
    document.body.appendChild(ouvir);
    comCaixa(ouvir, { left: 420, top: 300, right: 580, bottom: 400 });
    camadas.push(ouvir);
    olhar(3000, 500, 350);
    expect(ouvirClicado).not.toHaveBeenCalled();
    expect(cliques.nao).not.toHaveBeenCalled();
    expect(cliques.sim).not.toHaveBeenCalled();
  });

  it('a Emergência sob o ponto vale pelo ponto, mesmo dentro da coluna de uma zona', () => {
    const { nao, sim } = montarTelaLateral();
    registrarZonaLateral(nao);
    registrarZonaLateral(sim);
    olhar(2300, 900, 40);
    expect(cliques.socorro).toHaveBeenCalledTimes(1);
    expect(cliques.sim).not.toHaveBeenCalled();
  });

  it('tolerância a intrusões (M19) pela coluna: o x que escorrega para o vão, perto da zona, não zera o dwell', () => {
    const { nao, sim } = montarTelaLateral();
    registrarZonaLateral(nao);
    registrarZonaLateral(sim);
    olhar(900, 300, -60);
    // Uma intrusão curta: o x passa 10 px da borda da zona, com o y longe dela.
    olhar(150, 410, 900);
    olhar(700, 300, -60);
    expect(cliques.nao).toHaveBeenCalledTimes(1);
  });

  it('conteúdo novo sob o olhar (a pergunta do cuidador que abre): a zona sob o olhar parado só vale depois de o olhar sair dela', () => {
    const { nao, sim } = montarTelaLateral();
    registrarZonaLateral(nao);
    registrarZonaLateral(sim);
    olhar(300, 200, 400);
    act(() => avisarConteudoNovoSobOOlhar());
    olhar(4000, 200, 400);
    expect(cliques.nao).not.toHaveBeenCalled();
    // O olhar vai para a direita e volta: agora é uma escolha feita na tela nova.
    olhar(400, 800, 400);
    olhar(1700, 200, 400);
    expect(cliques.nao).toHaveBeenCalledTimes(1);
    expect(cliques.sim).not.toHaveBeenCalled();
  });
});

describe('despachante — sem zonas laterais nada muda', () => {
  beforeEach(() => {
    window.location.hash = '#/sim-nao';
    emitir = () => {};
    t = 0;
    caixas.clear();
    camadas = [];
    _limparZonasLaterais();
    for (const f of Object.values(cliques)) f.mockClear();
    document.elementFromPoint = vi.fn((x: number, y: number) => hitTest(x, y));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera no teste'); }) },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([true, false])('modoHorizontal=%s sem zona registrada: o y continua valendo (fora do botão, nada; no botão, clica)', (horizontal) => {
    ajustes.modoHorizontal = horizontal;
    montarTelaLateral();
    olhar(2500, 200, -60);
    expect(cliques.nao).not.toHaveBeenCalled();
    olhar(1700, 60, 60);
    expect(cliques.voltar).toHaveBeenCalledTimes(1);
  });

  it('fora do modo só horizontal, com zonas: o botão sob o ponto vale como sempre', () => {
    ajustes.modoHorizontal = false;
    const { nao } = montarTelaLateral();
    registrarZonaLateral(nao);
    olhar(1700, 60, 60);
    expect(cliques.voltar).toHaveBeenCalledTimes(1);
    expect(cliques.nao).not.toHaveBeenCalled();
  });
});
