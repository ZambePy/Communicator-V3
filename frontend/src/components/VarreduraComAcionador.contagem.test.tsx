import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { _reiniciarParaTeste } from '../services/estadoDeEmergencia';
import { _reiniciarSocorroParaTestes, pedidoAtual } from '../services/emergencia/pedidoDeSocorro';

// -----------------------------------------------------------------------------
// A contagem da Emergência ajustável (decisão 5 da rodada 3, 21/10/2026) com
// quem a usa de verdade: o paciente do acionador. Os limites são 3 e 10 s, e a
// regra que não pode mudar com eles é a de 20/10/2026 (achado 1): SEGURAR o
// acionador durante a contagem não cancela — é o gesto do socorro, e quem
// segura de novo "para garantir" não pode cancelar o que acabou de pedir. Só o
// aperto curto cancela.
//
// A pressão longa de cada caso é a que cabe na contagem: com 3 s, um "segurar
// 2 s" mais a pausa de 0,7 s da varredura já consumiriam a contagem inteira.
// -----------------------------------------------------------------------------

vi.mock('../context/GazeContext', () => ({
  DWELL_SELECTOR: 'button, a, [role="button"], [role="link"]',
  suspenderDwell: () => {},
  useGaze: () => ({
    state: 'tracking',
    calibration: { isCalibrated: () => true },
    isDegraded: false,
    reancorando: false,
    cancelarReancoragem: () => {},
  }),
}));
const ajustes = {
  modoDeEntrada: 'acionador' as const,
  acionador: null,
  acionadorPassoMs: 1500,
  acionadorDesligaOlhar: true,
  acionadorPressaoLongaMs: 2000,
  contagemDaEmergenciaS: 5,
};
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'p1' }, isCaregiver: false }) }));
vi.mock('../utils/emergencyAudio', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  playTone: vi.fn(),
}));

const { VarreduraComAcionador } = await import('./VarreduraComAcionador');
const { EmergencyProvider } = await import('../context/EmergencyContext');

let retangulos = new Map<Element, DOMRect>();
let proximoTopo = 0;
const caixaOriginal = HTMLElement.prototype.getBoundingClientRect;
const caixa = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const tecla = (tipo: 'keydown' | 'keyup') =>
  act(() => { window.dispatchEvent(new KeyboardEvent(tipo, { code: 'Space', bubbles: true, cancelable: true })); });
const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const segurar = (ms: number) => { tecla('keydown'); avancar(ms); tecla('keyup'); };
const faixa = () => screen.getByRole('status');
const contagemNaTela = () => screen.getByRole('alertdialog').querySelector('strong')?.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  _reiniciarParaTeste();
  _reiniciarSocorroParaTestes();
  retangulos = new Map();
  proximoTopo = 0;
  HTMLElement.prototype.getBoundingClientRect = function () {
    const r = retangulos.get(this);
    if (r) return r;
    if (this.tagName !== 'BUTTON') return caixaOriginal.call(this);
    const nova = caixa(10, proximoTopo, 300, 200);
    proximoTopo += 250;
    retangulos.set(this, nova);
    return nova;
  };
});
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = caixaOriginal;
  _reiniciarSocorroParaTestes();
  _reiniciarParaTeste();
  vi.useRealTimers();
  ajustes.contagemDaEmergenciaS = 5;
  ajustes.acionadorPressaoLongaMs = 2000;
});

function montar() {
  return render(
    <MemoryRouter initialEntries={['/menu']}>
      <EmergencyProvider>
        <Routes>
          <Route path="/menu" element={<button>Frases</button>} />
          <Route path="/emergency" element={<p>tela de emergência</p>} />
        </Routes>
        <VarreduraComAcionador />
      </EmergencyProvider>
    </MemoryRouter>,
  );
}

/**
 * Abre a contagem como o paciente do acionador: segura o tempo da pressão
 * longa. Devolve quanto da contagem já passou até o aperto ser solto.
 */
function abrirSegurando(pressaoLongaMs: number): number {
  avancar(200);
  segurar(pressaoLongaMs + 100);
  return 100; // a contagem abriu no tique do limiar e o aperto soltou ~100 ms depois
}

describe.each([
  { limite: 3, pressaoLongaMs: 1000 },
  { limite: 10, pressaoLongaMs: 2000 },
])('contagem de $limite s com o acionador', ({ limite, pressaoLongaMs }) => {
  beforeEach(() => {
    ajustes.contagemDaEmergenciaS = limite;
    ajustes.acionadorPressaoLongaMs = pressaoLongaMs;
  });

  it(`mostra ${limite} e o pedido só sai quando a contagem acaba`, () => {
    montar();
    const passou = abrirSegurando(pressaoLongaMs);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(contagemNaTela()).toBe(String(limite));
    avancar(limite * 1000 - passou - 400);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(pedidoAtual()).toBeNull();
    avancar(800);
    expect(screen.getByText('tela de emergência')).toBeInTheDocument();
    expect(pedidoAtual()?.fase).toBe('aguardando');
  });

  it('segurar de novo durante a contagem NÃO cancela: o pedido sai no fim', () => {
    montar();
    let passou = abrirSegurando(pressaoLongaMs);
    avancar(900); // a pausa de 0,7 s e o destaque cai no CANCELAR
    passou += 900;
    expect(faixa()).toHaveTextContent('Para cancelar, aperte rápido');

    // 2º segurar, "para garantir": passa do limiar e nada é escolhido.
    tecla('keydown');
    avancar(pressaoLongaMs + 100);
    passou += pressaoLongaMs + 100;
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(faixa()).toHaveTextContent('Segurar não cancela: o pedido de socorro continua');
    tecla('keyup');
    passou += 0;
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(pedidoAtual()).toBeNull();

    avancar(limite * 1000 - passou + 400);
    expect(screen.getByText('tela de emergência')).toBeInTheDocument();
    expect(pedidoAtual()?.fase).toBe('aguardando');
  });

  it('um aperto curto cancela dentro da contagem: nada sai, nem depois', () => {
    montar();
    abrirSegurando(pressaoLongaMs);
    avancar(900);
    segurar(300);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    avancar(limite * 1000 + 5000);
    expect(pedidoAtual()).toBeNull();
    expect(screen.queryByText('tela de emergência')).toBeNull();
  });
});
