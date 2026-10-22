import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import React from 'react';

// -----------------------------------------------------------------------------
// Roadmap 3, rodada 3 (21/10/2026): se o cabo de áudio escolhido para as
// chamadas some, a voz volta para o alto-falante e a tela AVISA, uma vez — a
// outra ponta da chamada deixou de ouvir o paciente, e quem está em casa
// precisa saber disso sem ter de adivinhar. Este componente também põe o
// ajuste em vigor ao abrir o app e a cada mudança.
// -----------------------------------------------------------------------------

const gaze = vi.hoisted(() => ({ state: 'tracking' }));
const emergencia = vi.hoisted(() => ({ isConfirming: false }));
vi.mock('../context/GazeContext', () => ({ useGaze: () => ({ state: gaze.state }) }));
vi.mock('../context/EmergencyContext', () => ({ useEmergency: () => ({ isConfirming: emergencia.isConfirming }) }));

const aplicar = vi.hoisted(() => ({ usarSaidaDaVoz: vi.fn() }));
vi.mock('../services/voz/local', async (original) => ({
  ...(await original<typeof import('../services/voz/local')>()),
  usarSaidaDaVoz: aplicar.usarSaidaDaVoz,
}));

import { AvisoDaSaidaDaVoz, DURACAO_DO_AVISO_DA_SAIDA_MS } from './AvisoDaSaidaDaVoz';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { alvoMinimoPx } from '../design/gazeMetrics';
import {
  EVENTO_DA_SAIDA_DA_VOZ,
  definirSaidaDaVoz,
  registrarAlvoDaVoz,
  _redefinirSaida,
} from '../services/voz/saida';

const Sonda: React.FC = () => {
  const { updateSettings } = useSettings();
  return (
    <>
      <button data-testid="cabo" onClick={() => updateSettings({ saidaDaVoz: 'cabo1' })}>
        cabo
      </button>
      <button data-testid="padrao" onClick={() => updateSettings({ saidaDaVoz: null })}>
        padrão
      </button>
    </>
  );
};

const Ir: React.FC = () => {
  const navigate = useNavigate();
  return (
    <button data-testid="ir-para-o-menu" onClick={() => navigate('/menu')}>
      menu
    </button>
  );
};

const arvore = (rota: string) => (
  <SettingsProvider>
    <MemoryRouter initialEntries={[rota]}>
      <AvisoDaSaidaDaVoz />
      <Sonda />
      <Ir />
    </MemoryRouter>
  </SettingsProvider>
);
const montar = (rota = '/menu') => render(arvore(rota));

const avisar = (perdida: boolean) =>
  act(async () => {
    window.dispatchEvent(new CustomEvent(EVENTO_DA_SAIDA_DA_VOZ, { detail: { perdida } }));
  });

beforeEach(() => {
  _redefinirSaida();
  aplicar.usarSaidaDaVoz.mockReset();
  gaze.state = 'tracking';
  emergencia.isConfirming = false;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  _redefinirSaida();
  vi.restoreAllMocks();
});

describe('o ajuste em vigor', () => {
  // B1 (revisão final, rodada 2, 21/10/2026): a saída escolhida vale só para a sessão. Se o app abrisse
  // com o cabo de uma chamada de ontem, a fala sairia pelo cabo e ninguém na sala a ouviria.
  it('ao abrir o app, a voz vai para a saída padrão — mesmo com um cabo salvo no disco de antes', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ saidaDaVoz: 'cabo1', schemaVersion: 1 }));
    montar();
    expect(aplicar.usarSaidaDaVoz).toHaveBeenCalledWith(null);
    expect(aplicar.usarSaidaDaVoz).not.toHaveBeenCalledWith('cabo1');
  });

  it('a cada mudança do ajuste na sessão, aplica de novo', () => {
    montar();
    fireEvent.click(screen.getByTestId('cabo'));
    expect(aplicar.usarSaidaDaVoz).toHaveBeenLastCalledWith('cabo1');
    fireEvent.click(screen.getByTestId('padrao'));
    expect(aplicar.usarSaidaDaVoz).toHaveBeenLastCalledWith(null);
  });

  it('o ajuste continua valendo mesmo quando o aviso espera (calibração, emergência)', () => {
    montar('/calibration-check');
    fireEvent.click(screen.getByTestId('cabo'));
    expect(aplicar.usarSaidaDaVoz).toHaveBeenLastCalledWith('cabo1');
  });
});

describe('o aviso de "a voz não está indo para a chamada"', () => {
  it('sem perda nenhuma: nada na tela', () => {
    montar();
    expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
  });

  it('a saída escolhida deixou de abrir: diz o que aconteceu e o que isso muda, com calma', async () => {
    montar();
    await avisar(true);
    const aviso = screen.getByTestId('aviso-saida-da-voz');
    expect(aviso).toBeInTheDocument();
    const texto = aviso.textContent ?? '';
    expect(texto).toContain('A voz está saindo pelo alto-falante do computador');
    // O que isso muda: quem está do outro lado da chamada não ouve.
    expect(texto).toMatch(/chamada/);
    expect(texto).toMatch(/não vai ouvir|não ouve/);
    // O que fazer, sem jargão.
    expect(texto).toMatch(/Configurações/);
  });

  it('"Entendi" é alvo de olhar do tamanho mínimo e tira o aviso', async () => {
    montar();
    await avisar(true);
    const entendi = screen.getByRole('button', { name: /Entendi/ });
    expect(entendi.className).toContain('gaze-button');
    expect(parseFloat(entendi.style.height)).toBeGreaterThanOrEqual(alvoMinimoPx());
    await act(async () => { fireEvent.click(entendi); });
    expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
  });

  it('avisa UMA vez: depois do "Entendi", a mesma perda não faz o aviso voltar', async () => {
    montar();
    await avisar(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Entendi/ })); });
    await avisar(true);
    expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
  });

  it('quando a saída volta a abrir o aviso sai sozinho, e uma perda NOVA avisa de novo', async () => {
    montar();
    await avisar(true);
    await avisar(false);
    expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
    await avisar(true);
    expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
    // E depois de um "Entendi" + recuperação + nova perda, também.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Entendi/ })); });
    await avisar(false);
    await avisar(true);
    expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
  });

  it('uma perda que aconteceu ANTES de o componente existir também aparece', async () => {
    // Ao abrir o app a perda é descoberta antes da primeira tela montar.
    const quebrado = { setSinkId: () => Promise.reject(new DOMException('some', 'NotFoundError')) } as unknown as AudioContext;
    registrarAlvoDaVoz(quebrado);
    definirSaidaDaVoz('cabo1');
    await act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); });
    montar();
    expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
  });

  it('espera fora da calibração, da emergência e do descanso', async () => {
    for (const rota of ['/calibration-check', '/emergency', '/rest', '/retomada']) {
      const { unmount } = montar(rota);
      await avisar(true);
      expect(screen.queryByTestId('aviso-saida-da-voz'), rota).toBeNull();
      unmount();
      await avisar(false);
    }
  });

  it('aparece também no teclado: é lá que o paciente está escrevendo para a chamada', async () => {
    // Quem fala numa chamada fica no teclado; um aviso que esperasse a saída
    // dele nunca seria visto, e o paciente falaria no vazio.
    montar('/keyboard');
    await avisar(true);
    expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
  });

  it('o aviso que esperou na calibração aparece quando o paciente sai dela (não se perde)', async () => {
    montar('/calibration-check');
    await avisar(true);
    expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
    fireEvent.click(screen.getByTestId('ir-para-o-menu'));
    expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
  });

  describe('não fica para sempre', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('sem ninguém tocar em "Entendi", sai sozinho depois de uns minutos e não volta pela mesma perda', async () => {
      montar();
      await avisar(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(DURACAO_DO_AVISO_DA_SAIDA_MS - 1000); });
      expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
      await avisar(true);
      expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
      // Uma perda NOVA (depois de a saída abrir de novo) avisa outra vez.
      await avisar(false);
      await avisar(true);
      expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
    });

    it('o tempo só corre enquanto o aviso está na tela: esperar na calibração não o gasta', async () => {
      const { rerender } = montar('/menu');
      await avisar(true);
      gaze.state = 'calibrating';
      rerender(arvore('/menu'));
      expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(DURACAO_DO_AVISO_DA_SAIDA_MS * 2); });
      gaze.state = 'tracking';
      rerender(arvore('/menu'));
      expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
    });
  });

  it('cede lugar à contagem da emergência e volta quando ela acaba', async () => {
    const { rerender } = montar();
    await avisar(true);
    expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
    emergencia.isConfirming = true;
    rerender(arvore('/menu'));
    expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
    emergencia.isConfirming = false;
    rerender(arvore('/menu'));
    expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
  });

  it('cede lugar à medição da calibração e volta quando ela acaba', async () => {
    const { rerender } = montar();
    await avisar(true);
    gaze.state = 'calibrating';
    rerender(arvore('/menu'));
    expect(screen.queryByTestId('aviso-saida-da-voz')).toBeNull();
    gaze.state = 'tracking';
    rerender(arvore('/menu'));
    expect(screen.getByTestId('aviso-saida-da-voz')).toBeInTheDocument();
  });

  it('fica abaixo da Emergência: o pedido de socorro nunca é coberto', async () => {
    montar();
    await avisar(true);
    // A Emergência é 99990; os avisos calmos ficam abaixo dela.
    expect(Number(screen.getByTestId('aviso-saida-da-voz').style.zIndex)).toBeLessThan(99990);
  });
});
