import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { SettingsProvider, useSettings } from './SettingsContext';
import { _redefinirFalhasDeGravacao, falhasDeGravacaoVisiveis } from '../services/local/falhasDeGravacao';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 15): com a cota
// cheia, os ajustes (o tempo do olhar, inclusive) não eram gravados e tudo
// seguia como se estivessem — na próxima abertura o dwell voltava ao padrão,
// sem ninguém saber. `updateSettings` agora devolve se gravou, e a falha
// fica registrada para o aviso da tela.
// -----------------------------------------------------------------------------

let resultados: boolean[] = [];
const Sonda: React.FC<{ mudanca: Parameters<ReturnType<typeof useSettings>['updateSettings']>[0] }> = ({ mudanca }) => {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <span data-testid="dwell">{settings.dwellMs}</span>
      <span data-testid="camera">{settings.cameraDeviceId ?? '—'}</span>
      <button data-testid="mudar" onClick={() => resultados.push(updateSettings(mudanca))}>
        mudar
      </button>
    </div>
  );
};

beforeEach(() => {
  localStorage.clear();
  resultados = [];
  _redefinirFalhasDeGravacao();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('updateSettings diz se gravou', () => {
  it('gravou: true, e o valor está no disco', () => {
    render(<SettingsProvider><Sonda mudanca={{ dwellMs: 2500 }} /></SettingsProvider>);
    act(() => { screen.getByTestId('mudar').click(); });
    expect(resultados).toEqual([true]);
    expect(JSON.parse(localStorage.getItem('irisflow_settings')!).dwellMs).toBe(2500);
    expect(falhasDeGravacaoVisiveis()).toEqual([]);
  });

  it('cota cheia: false, a mudança vale nesta sessão e a falha fica registrada', () => {
    render(<SettingsProvider><Sonda mudanca={{ dwellMs: 2500 }} /></SettingsProvider>);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cota excedida', 'QuotaExceededError');
    });
    act(() => { screen.getByTestId('mudar').click(); });
    expect(resultados).toEqual([false]);
    expect(screen.getByTestId('dwell').textContent).toBe('2500');
    expect(falhasDeGravacaoVisiveis()).toEqual(['ajustes']);
  });

  it('a gravação seguinte que dá certo repõe tudo e tira o aviso', () => {
    render(<SettingsProvider><Sonda mudanca={{ dwellMs: 2500 }} /></SettingsProvider>);
    const espiao = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cota excedida', 'QuotaExceededError');
    });
    act(() => { screen.getByTestId('mudar').click(); });
    espiao.mockRestore();
    act(() => { screen.getByTestId('mudar').click(); });
    expect(resultados).toEqual([false, true]);
    expect(falhasDeGravacaoVisiveis()).toEqual([]);
  });

  it('a câmera escolhida no Preparo é um ajuste como os outros (item 3)', () => {
    render(<SettingsProvider><Sonda mudanca={{ cameraDeviceId: 'usb-1' }} /></SettingsProvider>);
    act(() => { screen.getByTestId('mudar').click(); });
    expect(screen.getByTestId('camera').textContent).toBe('usb-1');
    expect(JSON.parse(localStorage.getItem('irisflow_settings')!).cameraDeviceId).toBe('usb-1');
  });

  it('cameraDeviceId inválido no disco volta a `null`', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ schemaVersion: 1, cameraDeviceId: 42 }));
    render(<SettingsProvider><Sonda mudanca={{}} /></SettingsProvider>);
    expect(screen.getByTestId('camera').textContent).toBe('—');
  });
});
