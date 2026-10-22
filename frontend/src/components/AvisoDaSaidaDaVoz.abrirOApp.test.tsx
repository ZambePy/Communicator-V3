import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// -----------------------------------------------------------------------------
// B1 (revisão final, rodada 2, 21/10/2026), de ponta a ponta com o serviço de
// verdade (sem simular `usarSaidaDaVoz`): o computador tem um cabo salvo no disco
// de uma chamada de ontem. Ao abrir o app, o contexto de áudio da voz NÃO pode
// ser mandado para o cabo — a primeira fala da manhã sairia pelo cabo, ninguém na
// sala a ouviria e nada na tela diria isso. Escolhido na sessão, ele vai.
// -----------------------------------------------------------------------------

vi.mock('../context/GazeContext', () => ({ useGaze: () => ({ state: 'tracking' }) }));
vi.mock('../context/EmergencyContext', () => ({ useEmergency: () => ({ isConfirming: false }) }));

import { AvisoDaSaidaDaVoz } from './AvisoDaSaidaDaVoz';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { registrarAlvoDaVoz, saidaDaVozEscolhida, _redefinirSaida } from '../services/voz/saida';

type Alvo = AudioContext & { setSinkId: ReturnType<typeof vi.fn> };
const novoAlvo = (): Alvo => ({ setSinkId: vi.fn(async () => undefined) }) as unknown as Alvo;
const andar = () => act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); });

const Escolher: React.FC = () => {
  const { updateSettings } = useSettings();
  return <button data-testid="cabo" onClick={() => updateSettings({ saidaDaVoz: 'cabo1' })}>cabo</button>;
};
const montar = () =>
  render(
    <SettingsProvider>
      <MemoryRouter initialEntries={['/keyboard']}>
        <AvisoDaSaidaDaVoz />
        <Escolher />
      </MemoryRouter>
    </SettingsProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  _redefinirSaida();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  _redefinirSaida();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('abrir o app com um cabo de áudio salvo de antes', () => {
  it('a voz fica na saída padrão: nenhum contexto de áudio é mandado para o cabo', async () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ saidaDaVoz: 'cabo1', schemaVersion: 1 }));
    const contexto = novoAlvo();
    registrarAlvoDaVoz(contexto);

    montar();
    await andar();

    expect(saidaDaVozEscolhida()).toBeNull();
    expect(contexto.setSinkId).not.toHaveBeenCalled();
  });

  it('um contexto criado só depois (a primeira fala) também nasce na saída padrão', async () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ saidaDaVoz: 'cabo1', schemaVersion: 1 }));
    montar();
    await andar();

    const contexto = novoAlvo();
    registrarAlvoDaVoz(contexto);
    await andar();

    expect(contexto.setSinkId).not.toHaveBeenCalled();
  });

  it('escolhendo o cabo na sessão, ele vale — e o disco continua sem ele', async () => {
    const contexto = novoAlvo();
    registrarAlvoDaVoz(contexto);
    const { getByTestId } = montar();
    await andar();
    expect(contexto.setSinkId).not.toHaveBeenCalled();

    await act(async () => { getByTestId('cabo').click(); });
    await andar();

    expect(saidaDaVozEscolhida()).toBe('cabo1');
    expect(contexto.setSinkId).toHaveBeenCalledWith('cabo1');
    expect(JSON.parse(localStorage.getItem('irisflow_settings') ?? '{}').saidaDaVoz).toBeUndefined();
  });
});
