import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

// Escolha lateral (modo só horizontal, pedido de 21/10/2026): duas metades que
// o olhar escolhe pela coluna, qualquer que seja o y.

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
const ajustes = { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both', modoHorizontal: true };
vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }),
}));

import { GazeProvider } from '../../context/GazeContext';
import { EscolhaLateral } from './EscolhaLateral';
import { zonaLateralNoX, haZonasLaterais, _limparZonasLaterais } from './zonasLaterais';

type Caixa = { left: number; top: number; right: number; bottom: number };
const caixas = new Map<Element, Caixa>();
function comCaixa(el: HTMLElement, c: Caixa) {
  caixas.set(el, c);
  el.getBoundingClientRect = () =>
    ({ ...c, x: c.left, y: c.top, width: c.right - c.left, height: c.bottom - c.top, toJSON: () => c }) as DOMRect;
}
function hitTest(x: number, y: number): Element | null {
  let achado: Element | null = null;
  for (const [el, c] of caixas) if (x >= c.left && x < c.right && y >= c.top && y < c.bottom) achado = el;
  return achado;
}

let t = 0;
function olhar(ms: number, x: number, y: number) {
  const passo = 1000 / 30;
  act(() => {
    for (const fim = t + ms; t <= fim; t += passo) {
      emitir({ x, y, timestamp: t, hasFace: true, degraded: false, uncalibrated: false, eyeState: 'open' } as GazeSample);
    }
  });
}

const esquerda = vi.fn();
const direita = vi.fn();

function montar(over: { desligadoEsquerda?: boolean; soNavegaDireita?: boolean } = {}) {
  const r = render(
    <GazeProvider>
      <EscolhaLateral
        esquerda={{ nome: 'Não', rotulo: 'NÃO', aoEscolher: esquerda, desligado: over.desligadoEsquerda }}
        direita={{ nome: 'Sim', rotulo: 'SIM', aoEscolher: direita, soNavega: over.soNavegaDireita }}
        centro={<p>Você está com dor?</p>}
      />
    </GazeProvider>
  );
  const nao = screen.getByRole('button', { name: 'Não' });
  const sim = screen.getByRole('button', { name: 'Sim' });
  comCaixa(nao, { left: 0, top: 120, right: 360, bottom: 740 });
  comCaixa(sim, { left: 660, top: 120, right: 1000, bottom: 740 });
  return { ...r, nao, sim };
}

describe('EscolhaLateral', () => {
  beforeEach(() => {
    window.location.hash = '#/sim-nao';
    ajustes.modoHorizontal = true;
    emitir = () => {};
    t = 0;
    caixas.clear();
    _limparZonasLaterais();
    esquerda.mockClear();
    direita.mockClear();
    document.elementFromPoint = vi.fn((x: number, y: number) => hitTest(x, y));
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

  it('as duas metades são zonas laterais enquanto estão na tela (e deixam de ser ao sair)', () => {
    const { nao, sim, unmount } = montar();
    expect(nao.getAttribute('data-dwell-eixo')).toBe('x');
    expect(sim.getAttribute('data-dwell-eixo')).toBe('x');
    expect(zonaLateralNoX(100)).toBe(nao);
    expect(zonaLateralNoX(900)).toBe(sim);
    // O meio, onde fica a pergunta, não é de nenhuma das duas.
    expect(zonaLateralNoX(500)).toBeNull();
    unmount();
    expect(haZonasLaterais()).toBe(false);
  });

  it('o dwell ignora o y: olhar na coluna da direita, com o y abaixo da tela, escolhe a direita — uma vez', () => {
    montar();
    olhar(1700, 850, 2000);
    expect(direita).toHaveBeenCalledTimes(1);
    expect(esquerda).not.toHaveBeenCalled();
    // O olhar parado não escolhe de novo: só depois de sair e voltar.
    olhar(3000, 850, 2000);
    expect(direita).toHaveBeenCalledTimes(1);
  });

  it('o y no meio da tela, no vão entre as metades, não escolhe nada', () => {
    montar();
    olhar(3000, 500, 400);
    expect(esquerda).not.toHaveBeenCalled();
    expect(direita).not.toHaveBeenCalled();
  });

  it('mouse e teclado também escolhem', () => {
    const { nao, sim } = montar();
    fireEvent.click(nao);
    fireEvent.click(sim);
    expect(esquerda).toHaveBeenCalledTimes(1);
    expect(direita).toHaveBeenCalledTimes(1);
  });

  it('um lado desligado não escolhe (nem pelo olhar, nem pelo mouse), mas continua cobrindo a coluna', () => {
    const { nao } = montar({ desligadoEsquerda: true });
    expect(nao.dataset.noDwell).toBe('true');
    expect(nao.getAttribute('aria-disabled')).toBe('true');
    // Sem dwell o CSS comum tira o ponteiro; aqui ele fica, para a zona seguir à vista.
    expect(nao.style.pointerEvents).toBe('auto');
    olhar(3000, 100, 400);
    fireEvent.click(nao);
    expect(esquerda).not.toHaveBeenCalled();
  });

  it('a interface mínima do pedido ({ rotulo, aoEscolher }): o nome acessível é o texto do rótulo', () => {
    render(<EscolhaLateral esquerda={{ rotulo: 'NÃO', aoEscolher: esquerda }} direita={{ rotulo: 'SIM', aoEscolher: direita }} />);
    fireEvent.click(screen.getByRole('button', { name: 'SIM' }));
    expect(direita).toHaveBeenCalledTimes(1);
  });

  it('o lado que só navega rearma pela permanência do olhar', () => {
    const { sim, nao } = montar({ soNavegaDireita: true });
    expect(sim.dataset.rearmePermanencia).toBe('true');
    expect(nao.dataset.rearmePermanencia).toBeUndefined();
  });

  // Revisão de 21/10/2026 (Important 1): a tela de socorro tem fases com UMA
  // saída só ("Voltar" depois de visto). O outro lado fica vazio: não é zona
  // nem botão, e o olhar descansa nele sem escolher nada.
  it('um lado vazio (null) não é zona nem botão: o olhar na coluna dele não escolhe nada', () => {
    render(
      <GazeProvider>
        <EscolhaLateral esquerda={{ nome: 'Voltar', rotulo: 'VOLTAR', aoEscolher: esquerda }} direita={null} />
      </GazeProvider>
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const voltar = screen.getByRole('button', { name: 'Voltar' });
    comCaixa(voltar, { left: 0, top: 120, right: 360, bottom: 740 });
    const vazio = document.querySelector('.escolha-lateral__vazio') as HTMLElement;
    expect(vazio).not.toBeNull();
    expect(vazio.getAttribute('aria-hidden')).toBe('true');
    comCaixa(vazio, { left: 660, top: 120, right: 1000, bottom: 740 });
    expect(zonaLateralNoX(850)).toBeNull();
    olhar(3000, 850, 400);
    expect(esquerda).not.toHaveBeenCalled();
    // A outra metade continua valendo pela coluna.
    olhar(1700, 100, 2000);
    expect(esquerda).toHaveBeenCalledTimes(1);
  });
});
