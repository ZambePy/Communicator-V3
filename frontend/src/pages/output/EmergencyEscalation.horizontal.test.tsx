import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { GazeSample } from '@tracker/tracker/engine';

/**
 * Revisão de 21/10/2026 (Important 1): no modo só horizontal, a tela de socorro
 * tinha as saídas centradas, pelo ponto — quem só olha para os lados ficava
 * preso nela, sem teclado, sem Sim · Não e sem a pergunta do cuidador, até
 * alguém usar o mouse. E a saída levava ao menu, que esse paciente não usa.
 * Agora as saídas são pela coluna do olhar e voltam para a tela lateral de
 * origem. Despachante de verdade (GazeProvider) e pedido de verdade.
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
const ajustes = { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both', modoHorizontal: true };
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }) }));
const emitirPedidoDeAjuda = vi.fn();
vi.mock('../../cloud/eventos', async (original) => ({
  ...(await original<typeof import('../../cloud/eventos')>()),
  emitirPedidoDeAjuda: (...a: unknown[]) => emitirPedidoDeAjuda(...a),
}));
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const cloud: {
  ajustesRemotos: null;
  reconhecimento: { id: string; kind: string; created_at: string; acknowledged_at: string; resolved_at: string | null } | null;
  mensagens: [];
} = { ajustesRemotos: null, reconhecimento: null, mensagens: [] };
vi.mock('../../cloud/CloudContext', () => ({ useCloud: () => cloud }));

import { GazeProvider } from '../../context/GazeContext';
import { EmergencyEscalation } from './EmergencyEscalation';
import { _limparZonasLaterais } from '../../components/ui/zonasLaterais';
import { _reiniciarSocorroParaTestes, dispararPedidoDeSocorro, pedidoAtual } from '../../services/emergencia/pedidoDeSocorro';
import { marcarTelaLateral, _reiniciarTelaLateralParaTestes } from '../../services/telaLateral';

type Caixa = { left: number; top: number; right: number; bottom: number };
const ESQUERDA: Caixa = { left: 0, top: 120, right: 300, bottom: 760 };
const DIREITA: Caixa = { left: 724, top: 120, right: 1024, bottom: 760 };
let caixas: Array<[Element, Caixa]> = [];
function comCaixa(el: Element, c: Caixa) {
  caixas.push([el, c]);
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ ...c, x: c.left, y: c.top, width: c.right - c.left, height: c.bottom - c.top, toJSON: () => c }) as DOMRect;
}
/** Dá às metades à vista as caixas da esquerda e da direita (as de agora, depois de cada troca de fase). */
function medirAsMetades() {
  caixas = [];
  for (const el of document.querySelectorAll('[data-lado="esquerda"], .escolha-lateral__vazio:first-child')) comCaixa(el, ESQUERDA);
  for (const el of document.querySelectorAll('[data-lado="direita"], .escolha-lateral__vazio:last-child')) comCaixa(el, DIREITA);
}
function hitTest(x: number, y: number): Element | null {
  let achado: Element | null = null;
  for (const [el, c] of caixas) if (el.isConnected && x >= c.left && x < c.right && y >= c.top && y < c.bottom) achado = el;
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

let rotaAtual = '';
const Rota: React.FC = () => {
  rotaAtual = useLocation().pathname;
  return null;
};
function montar() {
  render(
    <GazeProvider>
      <MemoryRouter initialEntries={['/emergency']}>
        <Rota />
        <Routes>
          <Route path="/emergency" element={<EmergencyEscalation />} />
          <Route path="/teclado-lateral" element={<p>Teclado lateral</p>} />
          <Route path="/sim-nao" element={<p>Sim Não</p>} />
          <Route path="/menu" element={<p>Menu</p>} />
        </Routes>
      </MemoryRouter>
    </GazeProvider>
  );
  medirAsMetades();
}

describe('tela de socorro no modo só horizontal: saídas pela coluna do olhar', () => {
  beforeEach(() => {
    window.location.hash = '#/emergency';
    ajustes.modoHorizontal = true;
    emitir = () => {};
    t = 0;
    caixas = [];
    rotaAtual = '';
    cloud.reconhecimento = null;
    _limparZonasLaterais();
    _reiniciarSocorroParaTestes();
    _reiniciarTelaLateralParaTestes();
    emitirPedidoDeAjuda.mockClear();
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
    _reiniciarSocorroParaTestes();
    _reiniciarTelaLateralParaTestes();
    vi.restoreAllMocks();
  });

  it('pedido visto: olhar para a esquerda (com o y fora da tela) encerra e volta para a tela lateral de origem', () => {
    marcarTelaLateral('/teclado-lateral');
    const pedido = dispararPedidoDeSocorro('other', 'Outra urgência');
    const agora = new Date().toISOString();
    cloud.reconhecimento = { id: pedido.id, kind: 'emergencia', created_at: agora, acknowledged_at: agora, resolved_at: null };
    montar();
    expect(pedidoAtual()?.fase).toBe('visto');
    const voltar = screen.getByRole('button', { name: 'emergency.voltar' });
    expect(voltar.getAttribute('data-dwell-eixo')).toBe('x');
    expect(voltar.dataset.lado).toBe('esquerda');
    // Recuperação: vale também com o rastreamento degradado.
    expect(voltar.dataset.recovery).toBe('true');
    // O outro lado fica vazio: olhar para a direita não faz nada.
    olhar(2500, 900, -40);
    expect(rotaAtual).toBe('/emergency');
    olhar(2200, 120, -40);
    expect(rotaAtual).toBe('/teclado-lateral');
    expect(pedidoAtual()?.fase).toBe('encerrado');
  });

  it('antes do visto, parar o alarme pelo olhar são dois passos: a esquerda pergunta, a direita confirma', () => {
    marcarTelaLateral('/sim-nao');
    dispararPedidoDeSocorro('other', 'Outra urgência');
    montar();
    expect(screen.getByRole('button', { name: 'emergency.cancelAndReturn' }).dataset.lado).toBe('esquerda');
    olhar(1800, 120, -40);
    // Abriu a pergunta: NÃO (continuar pedindo ajuda) à esquerda, SIM, parar à direita.
    const nao = screen.getByRole('button', { name: 'emergency.pararAlarme.nao' });
    const sim = screen.getByRole('button', { name: 'emergency.pararAlarme.sim' });
    expect(nao.dataset.lado).toBe('esquerda');
    expect(sim.dataset.lado).toBe('direita');
    expect(sim.getAttribute('data-acionador-aperto-curto')).toBe('true');
    medirAsMetades();
    // O olhar que ficou parado à esquerda não responde a pergunta sozinho.
    olhar(3000, 120, -40);
    expect(screen.getByRole('button', { name: 'emergency.pararAlarme.sim' })).toBeInTheDocument();
    expect(pedidoAtual()?.fase).toBe('aguardando');
    // O segundo passo, do outro lado.
    olhar(2200, 900, -40);
    expect(pedidoAtual()?.fase).toBe('encerrado');
    expect(rotaAtual).toBe('/sim-nao');
  });

  it('na pergunta, o NÃO (à esquerda, depois de sair e voltar) mantém o pedido', () => {
    dispararPedidoDeSocorro('other', 'Outra urgência');
    montar();
    olhar(1800, 120, -40);
    medirAsMetades();
    // Sai para o meio e volta à esquerda.
    olhar(600, 512, -40);
    olhar(1800, 120, -40);
    expect(screen.getByRole('button', { name: 'emergency.cancelAndReturn' })).toBeInTheDocument();
    expect(pedidoAtual()?.fase).toBe('aguardando');
    expect(rotaAtual).toBe('/emergency');
  });

  it('fora do modo só horizontal, as saídas de sempre (centradas) e a volta ao menu', () => {
    ajustes.modoHorizontal = false;
    dispararPedidoDeSocorro('other', 'Outra urgência');
    montar();
    const parar = screen.getByRole('button', { name: 'emergency.cancelAndReturn' });
    expect(parar.getAttribute('data-dwell-eixo')).toBeNull();
    expect(document.querySelector('.escolha-lateral')).toBeNull();
  });
});
