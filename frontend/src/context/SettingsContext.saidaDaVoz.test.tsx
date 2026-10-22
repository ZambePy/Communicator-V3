import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { SettingsProvider, useSettings } from './SettingsContext';

// -----------------------------------------------------------------------------
// A saída da voz para chamadas (roadmap 3, rodada 3, de 21/10/2026): `null` é a
// saída padrão do computador; um texto é o código do aparelho escolhido (o
// cabo de áudio virtual).
//
// Revisão final, rodada 2 (B1, 21/10/2026): a escolha vale SÓ PARA A SESSÃO. Ela
// não vai para o disco e, ao abrir o app, a voz volta à saída padrão. Antes, quem
// escolhia o cabo para uma chamada e esquecia de voltar abria o app no dia seguinte
// com a voz saindo pelo cabo: ninguém na sala a ouvia e nada na tela dizia isso —
// a fala do paciente sumia em silêncio.
// -----------------------------------------------------------------------------

const Sonda: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <span data-testid="saida">{String(settings.saidaDaVoz)}</span>
      <span data-testid="dwell">{settings.dwellMs}</span>
      <button data-testid="cabo" onClick={() => updateSettings({ saidaDaVoz: 'cabo1' })}>cabo</button>
      <button data-testid="padrao" onClick={() => updateSettings({ saidaDaVoz: null })}>padrão</button>
      <button data-testid="outro-ajuste" onClick={() => updateSettings({ dwellMs: 1200 })}>outro ajuste</button>
    </div>
  );
};

const gravar = (v: unknown) =>
  localStorage.setItem('irisflow_settings', JSON.stringify({ saidaDaVoz: v, schemaVersion: 1 }));
const montar = () => render(<SettingsProvider><Sonda /></SettingsProvider>);
/** O que ficou no disco para `saidaDaVoz` (`undefined`: o campo nem foi gravado). */
const gravado = () => JSON.parse(localStorage.getItem('irisflow_settings') ?? '{}').saidaDaVoz;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('saidaDaVoz vale só para a sessão', () => {
  it('sem nada gravado: a saída padrão do computador', () => {
    montar();
    expect(screen.getByTestId('saida').textContent).toBe('null');
  });

  it('disco de antes do campo: a saída padrão (e o resto continua valendo)', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ dwellMs: 800, schemaVersion: 1 }));
    montar();
    expect(screen.getByTestId('saida').textContent).toBe('null');
    expect(screen.getByTestId('dwell').textContent).toBe('800');
  });

  it('uma escolha que ficou no disco (de uma versão anterior) NÃO volta: ao abrir o app, a saída padrão', () => {
    gravar('3f9a1c');
    montar();
    expect(screen.getByTestId('saida').textContent).toBe('null');
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['número', 7],
    ['booleano', true],
    ['objeto', { id: 'x' }],
    ['lista', ['x']],
    ['nulo', null],
    ['enorme', 'x'.repeat(600)],
  ])('qualquer coisa no disco (%s) abre na saída padrão', (_nome, valor) => {
    gravar(valor);
    montar();
    expect(screen.getByTestId('saida').textContent).toBe('null');
  });

  it('o resto das configurações do disco continua voltando (só a saída da voz é da sessão)', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ dwellMs: 800, saidaDaVoz: 'cabo1', schemaVersion: 1 }));
    montar();
    expect(screen.getByTestId('dwell').textContent).toBe('800');
    expect(screen.getByTestId('saida').textContent).toBe('null');
  });

  it('escolher em Configurações vale na sessão e NÃO vai para o disco; voltar à padrão também não grava', () => {
    montar();
    act(() => { screen.getByTestId('cabo').click(); });
    expect(screen.getByTestId('saida').textContent).toBe('cabo1');
    expect(gravado()).toBeUndefined();
    act(() => { screen.getByTestId('padrao').click(); });
    expect(screen.getByTestId('saida').textContent).toBe('null');
    expect(gravado()).toBeUndefined();
  });

  it('mudar OUTRO ajuste com o cabo escolhido não solta o cabo (a sessão o guarda) e também não o grava', () => {
    montar();
    act(() => { screen.getByTestId('cabo').click(); });
    act(() => { screen.getByTestId('outro-ajuste').click(); });
    expect(screen.getByTestId('saida').textContent).toBe('cabo1');
    expect(screen.getByTestId('dwell').textContent).toBe('1200');
    expect(JSON.parse(localStorage.getItem('irisflow_settings') ?? '{}').dwellMs).toBe(1200);
    expect(gravado()).toBeUndefined();
  });

  it('fechar e abrir o app de novo: a voz volta à saída padrão', () => {
    const primeira = montar();
    act(() => { screen.getByTestId('cabo').click(); });
    act(() => { screen.getByTestId('outro-ajuste').click(); });
    expect(screen.getByTestId('saida').textContent).toBe('cabo1');
    primeira.unmount();

    montar();
    expect(screen.getByTestId('saida').textContent).toBe('null');
    expect(screen.getByTestId('dwell').textContent).toBe('1200');
  });

  it('o valor antigo que estava no disco some na próxima gravação', () => {
    gravar('cabo1');
    montar();
    act(() => { screen.getByTestId('outro-ajuste').click(); });
    expect(gravado()).toBeUndefined();
  });
});
