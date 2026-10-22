import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { _reiniciarSocorroParaTestes } from '../services/emergencia/pedidoDeSocorro';

/**
 * Revisão final, rodada 1 (I1, 21/10/2026): no modo só horizontal o CANCELAR do
 * olhar é uma faixa na borda ESQUERDA, de 5° a 6,6° (o alvo mínimo, que sobe
 * com a precisão medida), e o texto da contagem ("EMERGÊNCIA ACIONADA",
 * "Enviando alerta…") ficava centrado na janela inteira: a 1024, 1280 e 1366 px
 * o título começava dentro da faixa ou a menos de 1° dela — e ler o título
 * por 1 s cancelava o próprio socorro. Agora o texto fica só na coluna do meio,
 * com 1,5° de folga além da folga de intrusão (1°) das duas faixas.
 *
 * O jsdom não faz layout: aqui se confere o CONTRATO do estilo (a margem de
 * cada lado, a largura da coluna e o tamanho do título) nas quatro larguras
 * comuns; a medida de verdade, no Chromium, está no relatório da correção.
 */

vi.mock('./GazeContext', () => ({ useGaze: () => ({ isDegraded: false }) }));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'p1' }, isCaregiver: false }) }));
const ajustes: Record<string, unknown> = { modoHorizontal: true, alarmeComVolumeMaximo: true };
vi.mock('./SettingsContext', () => ({ useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }) }));
vi.mock('../utils/emergencyAudio', () => ({ playTickSound: vi.fn(), playCancelSound: vi.fn(), tocarSomDaSelecao: vi.fn(), playTone: vi.fn() }));

const { EmergencyProvider } = await import('./EmergencyContext');
const { larguraDaFaixaPx } = await import('../components/FaixaLateralDaEmergencia');
const { _limparZonasLaterais } = await import('../components/ui/zonasLaterais');

const LARGURAS = [1024, 1280, 1366, 1920];
/** 5° (o piso) e 6,6° (o recomendado, a que o requisito medido chega) num posto comum: 60 cm, 96 dpi. */
const ALVOS_MINIMOS = [198, 262];
/** 1,5° em px no mesmo posto (o token `--gaze-spacing-min`). */
const UM_E_MEIO_GRAU_PX = 59;
/** A folga de intrusão (1°) mais o afastamento pedido (1,5°) = 2,5°, em px. */
const FOLGA_TOTAL_PX = UM_E_MEIO_GRAU_PX * (2.5 / 1.5);

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/sim-nao']}>
      <EmergencyProvider>
        <div>Tela</div>
      </EmergencyProvider>
    </MemoryRouter>
  );

const px = (v: string) => parseFloat(v);

describe('contagem da Emergência no modo só horizontal: o texto fica na coluna do meio', () => {
  const larguraOriginal = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  beforeEach(() => {
    ajustes.modoHorizontal = true;
    _reiniciarSocorroParaTestes();
    _limparZonasLaterais();
    document.documentElement.style.setProperty('--gaze-spacing-min', `${UM_E_MEIO_GRAU_PX}px`);
  });
  afterEach(() => {
    if (larguraOriginal) Object.defineProperty(window, 'innerWidth', larguraOriginal);
    document.documentElement.style.removeProperty('--gaze-target-min');
    document.documentElement.style.removeProperty('--gaze-spacing-min');
    _limparZonasLaterais();
  });

  for (const largura of LARGURAS) {
    for (const alvo of ALVOS_MINIMOS) {
      it(`${largura} px, alvo mínimo de ${alvo} px: margem de cada lado = faixa + 1° de folga + 1,5°`, () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: largura });
        document.documentElement.style.setProperty('--gaze-target-min', `${alvo}px`);
        montar();
        fireEvent.click(screen.getByRole('button', { name: 'Disparar Emergência Médica' }));
        const coluna = screen.getByRole('alertdialog');
        const esquerda = px(coluna.style.paddingLeft);
        const direita = px(coluna.style.paddingRight);
        const faixa = larguraDaFaixaPx(largura, alvo);
        // As duas faixas (a do CANCELAR à esquerda e a da Emergência à direita) valem a mesma largura.
        expect(esquerda).toBeGreaterThanOrEqual(faixa + FOLGA_TOTAL_PX - 1);
        expect(direita).toBe(esquerda);
        // Sem exagero: o texto não perde mais coluna do que o necessário.
        expect(esquerda).toBeLessThanOrEqual(faixa + FOLGA_TOTAL_PX + 3);
        // O título e a frase da contagem estão DENTRO da coluna (o padding vale para eles).
        expect(coluna).toContainElement(screen.getByRole('heading', { name: 'EMERGÊNCIA ACIONADA' }));
        expect(coluna).toContainElement(screen.getByText(/Enviando alerta de socorro em/));
      });

      it(`${largura} px, alvo mínimo de ${alvo} px: a maior palavra do título cabe na coluna`, () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: largura });
        document.documentElement.style.setProperty('--gaze-target-min', `${alvo}px`);
        montar();
        fireEvent.click(screen.getByRole('button', { name: 'Disparar Emergência Médica' }));
        const dialogo = screen.getByRole('alertdialog');
        const colunaPx = largura - px(dialogo.style.paddingLeft) - px(dialogo.style.paddingRight);
        // "EMERGÊNCIA" tem ~6,8 em em Arial negrito: o título nunca passa de coluna / 7,4.
        const titulo = screen.getByRole('heading', { name: 'EMERGÊNCIA ACIONADA' });
        const tituloPx = px(titulo.style.fontSize);
        expect(tituloPx).toBeGreaterThanOrEqual(22);
        expect(tituloPx * 6.9).toBeLessThanOrEqual(colunaPx);
        // Mesmo no pior caso (6,6° a 1024 px) sobra coluna para uma palavra legível.
        expect(colunaPx).toBeGreaterThanOrEqual(240);
        // A frase da contagem quebra dentro da coluna em vez de vazar para a faixa.
        expect(screen.getByText(/Enviando alerta de socorro em/).style.overflowWrap).toBe('anywhere');
      });
    }
  }

  it('o CANCELAR do meio (só mouse e teclado no modo horizontal) também não passa da coluna', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    document.documentElement.style.setProperty('--gaze-target-min', '262px');
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Disparar Emergência Médica' }));
    const dialogo = screen.getByRole('alertdialog');
    const colunaPx = 1024 - px(dialogo.style.paddingLeft) - px(dialogo.style.paddingRight);
    const botao = screen.getByRole('button', { name: 'CANCELAR' });
    expect(dialogo).toContainElement(botao);
    expect(px(botao.style.maxWidth)).toBeLessThanOrEqual(colunaPx);
  });

  it('fora do modo só horizontal nada muda: o texto segue centrado na janela inteira, sem coluna', () => {
    ajustes.modoHorizontal = false;
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Disparar Emergência Médica' }));
    const dialogo = screen.getByRole('alertdialog');
    expect(dialogo.style.paddingLeft).toBe('');
    expect(dialogo.style.paddingRight).toBe('');
    expect(screen.getByRole('button', { name: 'CANCELAR' }).style.maxWidth).toBe('90vw');
  });
});
