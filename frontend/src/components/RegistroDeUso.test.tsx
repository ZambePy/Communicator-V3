import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

// A coleta do uso (21/10/2026): um ouvinte único, em captura, que vê TODO clique
// de botão — o do olhar é um `.click()` da página — sem tocar nas telas. O que
// conta como uso (e o que não) é decidido por rota e por tipo de alvo.

let dwellMs = 1500;
vi.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ settings: { dwellMs }, updateSettings: vi.fn() }),
}));

const registrarSelecao = vi.fn();
const registrarCorrecao = vi.fn();
vi.mock('../services/evolucao/registroDeUso', async (original) => {
  const real = await original<typeof import('../services/evolucao/registroDeUso')>();
  return {
    ...real,
    registrarSelecao: (...a: unknown[]) => registrarSelecao(...a),
    registrarCorrecao: (...a: unknown[]) => registrarCorrecao(...a),
  };
});

import { RegistroDeUso } from './RegistroDeUso';

let irPara: (rota: string) => void = () => {};
function Navegador() {
  const navigate = useNavigate();
  irPara = (r) => navigate(r);
  return null;
}

const montar = (rota = '/menu', filhos: React.ReactNode = <button type="button">Alvo</button>) =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <Navegador />
      <RegistroDeUso />
      {filhos}
    </MemoryRouter>,
  );

const visibilidade = (v: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });

describe('RegistroDeUso', () => {
  beforeEach(() => {
    dwellMs = 1500;
    registrarSelecao.mockClear();
    registrarCorrecao.mockClear();
    visibilidade('visible');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    visibilidade('visible');
  });

  it('clique num botão de uma tela do paciente conta uma seleção, com a hora e o dwell em uso', () => {
    montar('/menu');
    fireEvent.click(screen.getByText('Alvo'));
    expect(registrarSelecao).toHaveBeenCalledTimes(1);
    expect(registrarSelecao).toHaveBeenCalledWith(Date.parse('2026-10-21T15:00:00Z'), 1500);
    expect(registrarCorrecao).not.toHaveBeenCalled();
  });

  it('o clique no filho de um botão (o ícone dentro dele) também é do botão', () => {
    montar('/menu', <button type="button"><span data-testid="icone">i</span></button>);
    fireEvent.click(screen.getByTestId('icone'));
    expect(registrarSelecao).toHaveBeenCalledTimes(1);
  });

  // Revisão final, rodada 1 (M7, 21/10/2026): a rota /emergency já ficava de fora ("um aumento ali é
  // aflição"), mas o botão do topo, a faixa da borda e os dois CANCELAR, acionados de OUTRAS rotas,
  // contavam como minuto útil e inflavam a evolução. Acionar a Emergência não é treino nem melhora.
  it('os cliques da Emergência (botão, faixa, CANCELAR) não contam como uso, em nenhuma rota', () => {
    montar(
      '/menu',
      <>
        <button type="button" data-emergency="true" aria-label="Disparar Emergência Médica"><span data-testid="icone-sos">!</span></button>
        <button type="button" data-cancelar-emergencia="true">CANCELAR</button>
        <button type="button">Alvo comum</button>
      </>,
    );
    fireEvent.click(screen.getByLabelText('Disparar Emergência Médica'));
    fireEvent.click(screen.getByTestId('icone-sos'));
    fireEvent.click(screen.getByText('CANCELAR'));
    expect(registrarSelecao).not.toHaveBeenCalled();
    expect(registrarCorrecao).not.toHaveBeenCalled();
    // O que não é da Emergência continua contando.
    fireEvent.click(screen.getByText('Alvo comum'));
    expect(registrarSelecao).toHaveBeenCalledTimes(1);
  });

  it('links e papéis de botão e de link também contam', () => {
    montar('/menu', <><a href="#x">link</a><div role="button">papel</div><div role="link">outro</div></>);
    fireEvent.click(screen.getByText('link'));
    fireEvent.click(screen.getByText('papel'));
    fireEvent.click(screen.getByText('outro'));
    expect(registrarSelecao).toHaveBeenCalledTimes(3);
  });

  it('clique fora de qualquer alvo (fundo, texto) não conta', () => {
    montar('/menu', <p>texto solto</p>);
    fireEvent.click(screen.getByText('texto solto'));
    expect(registrarSelecao).not.toHaveBeenCalled();
  });

  it('alvo marcado como fora do dwell (data-no-dwell, ex.: botão desabilitado) não conta', () => {
    montar('/menu', <button type="button" data-no-dwell="true">Imprimir</button>);
    fireEvent.click(screen.getByText('Imprimir'));
    expect(registrarSelecao).not.toHaveBeenCalled();
  });

  it('botão desfazer (data-desfazer) conta a seleção E a correção', () => {
    montar('/keyboard', <button type="button" data-desfazer="true">Apagar</button>);
    fireEvent.click(screen.getByText('Apagar'));
    expect(registrarSelecao).toHaveBeenCalledTimes(1);
    expect(registrarCorrecao).toHaveBeenCalledTimes(1);
    expect(registrarCorrecao).toHaveBeenCalledWith(Date.parse('2026-10-21T15:00:00Z'));
  });

  it.each(['/', '/emergency', '/settings', '/settings/prancha', '/caregiver', '/calibration', '/tutorial', '/evolucao', '/consulta'])(
    'em %s nada conta (não é o paciente usando o comunicador)',
    (rota) => {
      montar(rota);
      fireEvent.click(screen.getByText('Alvo'));
      expect(registrarSelecao).not.toHaveBeenCalled();
      expect(registrarCorrecao).not.toHaveBeenCalled();
    },
  );

  it('acompanha a rota: ao sair de uma tela de ajustes para uma do paciente, passa a contar', () => {
    montar('/settings');
    fireEvent.click(screen.getByText('Alvo'));
    expect(registrarSelecao).not.toHaveBeenCalled();
    act(() => irPara('/keyboard'));
    fireEvent.click(screen.getByText('Alvo'));
    expect(registrarSelecao).toHaveBeenCalledTimes(1);
    act(() => irPara('/emergency'));
    fireEvent.click(screen.getByText('Alvo'));
    expect(registrarSelecao).toHaveBeenCalledTimes(1);
  });

  it('com a janela escondida (outra aba, minimizada) o clique não conta', () => {
    montar('/menu');
    visibilidade('hidden');
    fireEvent.click(screen.getByText('Alvo'));
    expect(registrarSelecao).not.toHaveBeenCalled();
  });

  it('o dwell amostrado é o de agora: mudou o ajuste, muda a amostra', () => {
    const { rerender } = montar('/menu');
    dwellMs = 2400;
    rerender(
      <MemoryRouter initialEntries={['/menu']}>
        <Navegador />
        <RegistroDeUso />
        <button type="button">Alvo</button>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Alvo'));
    expect(registrarSelecao).toHaveBeenLastCalledWith(expect.any(Number), 2400);
  });

  it('não esconde o clique de ninguém: o clique segue para o botão normalmente', () => {
    const aoClicar = vi.fn();
    montar('/menu', <button type="button" onClick={aoClicar}>Alvo</button>);
    fireEvent.click(screen.getByText('Alvo'));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it('se o registro quebrar, o botão funciona do mesmo jeito e o console avisa (no máximo uma vez por minuto)', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registrarSelecao.mockImplementation(() => { throw new Error('armazenamento cheio'); });
    const aoClicar = vi.fn();
    montar('/menu', <button type="button" onClick={aoClicar}>Alvo</button>);
    fireEvent.click(screen.getByText('Alvo'));
    fireEvent.click(screen.getByText('Alvo'));
    fireEvent.click(screen.getByText('Alvo'));
    expect(aoClicar).toHaveBeenCalledTimes(3);
    expect(aviso).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(61_000); });
    fireEvent.click(screen.getByText('Alvo'));
    expect(aviso).toHaveBeenCalledTimes(2);
    registrarSelecao.mockReset();
    aviso.mockRestore();
  });

  it('ao desmontar, para de ouvir', () => {
    const { unmount } = montar('/menu');
    const botao = screen.getByText('Alvo');
    unmount();
    document.body.appendChild(botao);
    fireEvent.click(botao);
    expect(registrarSelecao).not.toHaveBeenCalled();
    botao.remove();
  });
});
