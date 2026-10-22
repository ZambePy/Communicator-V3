import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EmergencyProvider, useEmergency } from './EmergencyContext';
import { SettingsProvider, useSettings } from './SettingsContext';
import { _reiniciarSocorroParaTestes, pedidoAtual } from '../services/emergencia/pedidoDeSocorro';

// -----------------------------------------------------------------------------
// A contagem da Emergência ajustável (decisão 5 da rodada 3, 21/10/2026):
// de 3 a 10 s, padrão 5. O que NÃO pode mudar com o ajuste:
//  - NADA sai antes de a contagem acabar, e o CANCELAR desfaz o engano em
//    qualquer valor;
//  - um valor ruim nunca zera a contagem — com 0 o pedido sairia no mesmo
//    instante, sem CANCELAR.
// Aqui valem o `SettingsProvider` e o `EmergencyProvider` de verdade: o ajuste
// entra por `updateSettings`, que não passa pela sanitização do disco — então a
// segunda camada de proteção (a do próprio contexto) é a que é testada.
// -----------------------------------------------------------------------------

vi.mock('./GazeContext', () => ({ useGaze: () => ({ isDegraded: false }) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'p1' }, isCaregiver: false }) }));

const MOTIVO = { tipo: 'pain', rotulo: 'DOR MUITO FORTE — cabeça, 9 de 10' };

// Pega o `updateSettings` do provider de verdade para o teste mexer no ajuste
// com QUALQUER valor, inclusive os que a tela de Configurações nunca ofereceria.
let aplicarAjuste: (valor: unknown) => void = () => {};
const Captura: React.FC = () => {
  const { updateSettings } = useSettings();
  aplicarAjuste = (valor) => { updateSettings({ contagemDaEmergenciaS: valor as number }); };
  return null;
};

const Gatilho: React.FC = () => {
  const { iniciarContagemDeEmergencia } = useEmergency();
  return <button type="button" onClick={() => iniciarContagemDeEmergencia(MOTIVO)}>chamar pela dor</button>;
};

const montar = (ajuste?: unknown) => {
  if (ajuste !== undefined) {
    localStorage.setItem('irisflow_settings', JSON.stringify({ contagemDaEmergenciaS: ajuste, schemaVersion: 1 }));
  }
  return render(
    <MemoryRouter initialEntries={['/dor']}>
      <SettingsProvider>
        <EmergencyProvider>
          <Captura />
          <Routes>
            <Route path="/dor" element={<Gatilho />} />
            <Route path="/emergency" element={<p>tela de emergência</p>} />
          </Routes>
        </EmergencyProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );
};

const apertarEmergencia = () => fireEvent.click(screen.getByRole('button', { name: /Emergência/ }));
const passar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const contagemNaTela = () => screen.getByRole('alertdialog').querySelector('strong')?.textContent;

describe('contagem da Emergência ajustável', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    _reiniciarSocorroParaTestes();
  });
  afterEach(() => {
    _reiniciarSocorroParaTestes();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('sem ajuste continua 5 s, como sempre', () => {
    montar();
    apertarEmergencia();
    expect(contagemNaTela()).toBe('5');
    passar(4999);
    expect(pedidoAtual()).toBeNull();
    passar(1);
    expect(pedidoAtual()).not.toBeNull();
  });

  it('no limite de baixo (3 s): mostra 3, nada sai antes de 3 s e o pedido sai em 3 s', () => {
    montar(3);
    apertarEmergencia();
    expect(contagemNaTela()).toBe('3');
    passar(2999);
    expect(pedidoAtual()).toBeNull();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    passar(1);
    expect(screen.getByText('tela de emergência')).toBeInTheDocument();
    expect(pedidoAtual()?.tipo).toBe('other');
  });

  it('no limite de cima (10 s): mostra 10, nada sai antes de 10 s e o pedido sai em 10 s', () => {
    montar(10);
    apertarEmergencia();
    expect(contagemNaTela()).toBe('10');
    passar(9999);
    expect(pedidoAtual()).toBeNull();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    passar(1);
    expect(screen.getByText('tela de emergência')).toBeInTheDocument();
    expect(pedidoAtual()).not.toBeNull();
  });

  it('um valor do meio (7 s) vale como está, e a contagem desce de 1 em 1 s', () => {
    montar(7);
    apertarEmergencia();
    expect(contagemNaTela()).toBe('7');
    passar(3000);
    expect(contagemNaTela()).toBe('4');
    passar(3999);
    expect(pedidoAtual()).toBeNull();
    passar(1);
    expect(pedidoAtual()).not.toBeNull();
  });

  it.each([3, 10])('o CANCELAR desfaz o engano no limite de %i s — e nada sai depois', (limite) => {
    montar(limite);
    apertarEmergencia();
    passar((limite - 1) * 1000);
    expect(contagemNaTela()).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: /CANCELAR/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    passar(60_000);
    expect(pedidoAtual()).toBeNull();
    expect(screen.queryByText('tela de emergência')).toBeNull();
  });

  it.each([3, 10])('depois de cancelar no limite de %i s, a próxima contagem recomeça inteira', (limite) => {
    montar(limite);
    apertarEmergencia();
    passar(1000);
    fireEvent.click(screen.getByRole('button', { name: /CANCELAR/ }));
    apertarEmergencia();
    expect(contagemNaTela()).toBe(String(limite));
    passar(limite * 1000 - 1);
    expect(pedidoAtual()).toBeNull();
    passar(1);
    expect(pedidoAtual()).not.toBeNull();
  });

  it('a contagem aberta por outra tela (mapa da dor) usa o mesmo ajuste', () => {
    montar(8);
    fireEvent.click(screen.getByRole('button', { name: 'chamar pela dor' }));
    expect(contagemNaTela()).toBe('8');
    passar(7999);
    expect(pedidoAtual()).toBeNull();
    passar(1);
    expect(pedidoAtual()?.tipo).toBe('pain');
  });

  it('mudar o ajuste no meio de uma contagem não mexe nela; a próxima já usa o novo valor', () => {
    montar(6);
    apertarEmergencia();
    passar(2000);
    act(() => aplicarAjuste(3));
    expect(contagemNaTela()).toBe('4');
    passar(3999);
    expect(pedidoAtual()).toBeNull();
    passar(1);
    expect(pedidoAtual()).not.toBeNull();
  });

  describe('um valor ruim nunca zera a contagem', () => {
    it.each([0, 1, 2, -4])('abaixo do mínimo (%i) sobe para 3 s: a confirmação abre e o pedido NÃO sai na hora', (ruim) => {
      montar();
      act(() => aplicarAjuste(ruim));
      apertarEmergencia();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(contagemNaTela()).toBe('3');
      expect(pedidoAtual()).toBeNull();
      passar(2999);
      expect(pedidoAtual()).toBeNull();
      passar(1);
      expect(pedidoAtual()).not.toBeNull();
    });

    it.each([11, 99, 1_000_000])('acima do máximo (%i) desce para 10 s', (ruim) => {
      montar();
      act(() => aplicarAjuste(ruim));
      apertarEmergencia();
      expect(contagemNaTela()).toBe('10');
      passar(9999);
      expect(pedidoAtual()).toBeNull();
      passar(1);
      expect(pedidoAtual()).not.toBeNull();
    });

    it.each([[NaN], [Infinity], [-Infinity], [undefined], [null], ['3'], [{}]])(
      'o que não é número válido (%s) volta ao padrão de 5 s',
      (ruim) => {
        montar();
        act(() => aplicarAjuste(ruim));
        apertarEmergencia();
        expect(contagemNaTela()).toBe('5');
        passar(4999);
        expect(pedidoAtual()).toBeNull();
        passar(1);
        expect(pedidoAtual()).not.toBeNull();
      },
    );

    it('fração arredonda para o segundo inteiro: 3,4 vira 3 s', () => {
      montar();
      act(() => aplicarAjuste(3.4));
      apertarEmergencia();
      expect(contagemNaTela()).toBe('3');
    });
  });
});
