import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PAUSA_APOS_SELECAO_MS, PRESSAO_LONGA_EMERGENCIA_MS } from '@tracker/interaction/varreduraPorAcionador';
import { definirEmergenciaAtiva, _reiniciarParaTeste } from '../services/estadoDeEmergencia';
import { _reiniciarSocorroParaTestes, pedidoAtual } from '../services/emergencia/pedidoDeSocorro';

// Revisão de UX de 20/10/2026, achado 1: na varredura, SEGURAR o acionador é o
// gesto do socorro. Sem o botão flutuante (a contagem aberta, a tela do
// pedido), ele virava "escolher": quem segurava de novo "para garantir"
// escolhia o CANCELAR aos 2 s, e dois "segurar" na tela do alarme chegavam ao
// "Sim, parar". Os dois primeiros testes são os de reprodução da revisão, que
// afirmavam o defeito; aqui afirmam a correção.

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
let proximoX = 0;
let emFileira = false;
const caixaOriginal = HTMLElement.prototype.getBoundingClientRect;
const caixa = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const tecla = (tipo: 'keydown' | 'keyup') =>
  act(() => { window.dispatchEvent(new KeyboardEvent(tipo, { code: 'Space', bubbles: true, cancelable: true })); });
const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const segurar = (ms: number) => { tecla('keydown'); avancar(ms); tecla('keyup'); };
const faixa = () => screen.getByRole('status');

beforeEach(() => {
  vi.useFakeTimers();
  _reiniciarParaTeste();
  _reiniciarSocorroParaTestes();
  retangulos = new Map();
  proximoTopo = 0;
  proximoX = 0;
  emFileira = false;
  // jsdom não tem layout: cada botão ganha uma caixa na primeira medida — uma
  // linha por botão ou, com `emFileira`, lado a lado (a tela do alarme).
  HTMLElement.prototype.getBoundingClientRect = function () {
    const r = retangulos.get(this);
    if (r) return r;
    if (this.tagName !== 'BUTTON') return caixaOriginal.call(this);
    const nova = emFileira ? caixa(proximoX, 500, 300, 200) : caixa(10, proximoTopo, 300, 200);
    if (emFileira) proximoX += 500;
    else proximoTopo += 250;
    retangulos.set(this, nova);
    return nova;
  };
});
afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = caixaOriginal;
  _reiniciarSocorroParaTestes();
  _reiniciarParaTeste();
  vi.useRealTimers();
});

/** Como o `EmergencyProvider`: o botão flutuante some com a contagem aberta, e o CANCELAR fica num alertdialog. */
function App({ aoCancelar, aoEnviar }: { aoCancelar: () => void; aoEnviar: () => void }) {
  const [contando, setContando] = useState(false);
  React.useEffect(() => {
    if (!contando) return;
    const id = setTimeout(() => { setContando(false); aoEnviar(); }, 5000);
    return () => clearTimeout(id);
  }, [contando, aoEnviar]);
  return (
    <>
      <button>Frases</button>
      {!contando && <button data-emergency="true" onClick={() => setContando(true)}>Emergência</button>}
      {contando && (
        <div role="alertdialog" aria-modal="true">
          <p>EMERGÊNCIA ACIONADA</p>
          <button data-cancelar-emergencia="true" onClick={() => { setContando(false); aoCancelar(); }}>CANCELAR</button>
        </div>
      )}
    </>
  );
}

describe('achado 1 — segurar de novo durante a contagem', () => {
  it('o 2º "segurar 2 s" (o mesmo gesto do socorro) NÃO cancela a contagem: o pedido sai', () => {
    const cancelou = vi.fn(); const enviou = vi.fn();
    render(<><App aoCancelar={cancelou} aoEnviar={enviou} /><VarreduraComAcionador /></>);
    avancar(200);
    // 1º segurar: abre a contagem (o paciente quer socorro).
    segurar(2100);
    expect(screen.getByText('EMERGÊNCIA ACIONADA')).toBeInTheDocument();
    avancar(900); // 700 ms de pausa e o destaque cai no CANCELAR
    expect(faixa()).toHaveTextContent('Para cancelar, aperte rápido');
    // 2º segurar, "para garantir": passa do limiar e nada é escolhido.
    tecla('keydown');
    avancar(1000);
    // Enquanto segura, a faixa não convida a soltar (soltar cedo cancela).
    expect(faixa()).toHaveTextContent('Para cancelar, aperte rápido');
    avancar(1100);
    expect(faixa()).toHaveTextContent('Segurar não cancela: o pedido de socorro continua');
    tecla('keyup');
    expect(cancelou).not.toHaveBeenCalled();
    // O destaque segue no CANCELAR (não some, não volta para fora da contagem).
    expect(screen.getByTestId('destaque-do-acionador')).toBeInTheDocument();
    avancar(3000);
    expect(cancelou).not.toHaveBeenCalled();
    expect(enviou).toHaveBeenCalledTimes(1);
  });

  it('um aperto curto ainda cancela — também logo depois de um "segurar" sem efeito', () => {
    const cancelou = vi.fn(); const enviou = vi.fn();
    render(<><App aoCancelar={cancelou} aoEnviar={enviou} /><VarreduraComAcionador /></>);
    avancar(200);
    segurar(2100);
    avancar(PAUSA_APOS_SELECAO_MS + 200);
    segurar(PRESSAO_LONGA_EMERGENCIA_MS + 100);
    expect(cancelou).not.toHaveBeenCalled();
    // Logo depois de soltar, o aperto curto no CANCELAR (que continua destacado).
    segurar(300);
    expect(cancelou).toHaveBeenCalledTimes(1);
    avancar(6000);
    expect(enviou).not.toHaveBeenCalled();
  });

  it('com o EmergencyProvider de verdade: o 2º "segurar" não cancela, e o pedido sai no fim da contagem', () => {
    render(
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
    avancar(200);
    segurar(2100);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    avancar(900);
    expect(faixa()).toHaveTextContent('Para cancelar, aperte rápido');
    segurar(2100);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(pedidoAtual()).toBeNull();
    avancar(3500);
    expect(screen.getByText('tela de emergência')).toBeInTheDocument();
    expect(pedidoAtual()?.fase).toBe('aguardando');
    // Na tela do pedido (sem o botão flutuante), a faixa diz o que vale ali.
    avancar(200);
    expect(faixa()).toHaveTextContent('Socorro em andamento · para escolher, aperte rápido');
  });
});

/**
 * A tela de emergência com o pedido em andamento, como `EmergencyEscalation`:
 * sem Voltar, sem o botão flutuante, e o "Sim, parar" marcado para só aceitar
 * aperto curto.
 */
function TelaDeEmergencia({ aoParar }: { aoParar: () => void }) {
  const [perguntando, setPerguntando] = useState(false);
  return perguntando ? (
    <div>
      <p>Parar o alarme?</p>
      <button onClick={() => setPerguntando(false)}>Não, continuar tocando</button>
      <button data-acionador-aperto-curto="true" onClick={aoParar}>Sim, parar</button>
    </div>
  ) : (
    <button onClick={() => setPerguntando(true)}>Parar o alarme</button>
  );
}

describe('achado 1 — segurar o acionador na tela do pedido de socorro', () => {
  it('dois "segurar 2 s" (o gesto da emergência) NÃO param o alarme; os apertos curtos, sim', () => {
    emFileira = true;
    definirEmergenciaAtiva(true, 'pedido'); // o pedido em andamento, como `dispararPedidoDeSocorro`
    const parou = vi.fn();
    render(<><TelaDeEmergencia aoParar={parou} /><VarreduraComAcionador /></>);
    avancar(200); // destaque no único botão: "Parar o alarme"
    expect(faixa()).toHaveTextContent('Socorro em andamento · para escolher, aperte rápido');
    // 1º segurar: passa do limiar e não abre a pergunta.
    tecla('keydown');
    avancar(2100);
    expect(faixa()).toHaveTextContent('Segurar não escolhe nada aqui · para escolher, aperte rápido');
    tecla('keyup');
    expect(screen.queryByText('Parar o alarme?')).toBeNull();
    // 2º segurar: idem.
    segurar(2100);
    expect(screen.queryByText('Parar o alarme?')).toBeNull();
    expect(parou).not.toHaveBeenCalled();

    // Aperto curto: abre a pergunta. Destaque em "Não" e, 1,5 s depois, em "Sim, parar".
    segurar(300);
    expect(screen.getByText('Parar o alarme?')).toBeInTheDocument();
    avancar(PAUSA_APOS_SELECAO_MS + 100 + 1500 + 100);
    // Segurar em "Sim, parar" não para o alarme...
    segurar(2100);
    expect(parou).not.toHaveBeenCalled();
    // ...o aperto curto, sim (o destaque seguiu nele).
    segurar(300);
    expect(parou).toHaveBeenCalledTimes(1);
  });

  it('"Sim, parar" nunca é escolhido pela pressão longa, mesmo sem o sinal do pedido', () => {
    emFileira = true;
    const parou = vi.fn(); const continuar = vi.fn();
    render(
      <>
        <button onClick={continuar}>Não, continuar tocando</button>
        <button data-acionador-aperto-curto="true" onClick={parou}>Sim, parar</button>
        <VarreduraComAcionador />
      </>,
    );
    avancar(200 + 1500); // destaque em "Sim, parar"
    segurar(2100);
    expect(parou).not.toHaveBeenCalled();
    segurar(300);
    expect(parou).toHaveBeenCalledTimes(1);
    expect(continuar).not.toHaveBeenCalled();
  });
});
