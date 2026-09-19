import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

/**
 * O cursor não pode aparecer durante o teste de precisão.
 *
 * O comentário do dispatcher já dizia isso ("se o usuário vir o cursor ele
 * tenta corrigi-lo, criando feedback loop que corrompe a medida"), mas
 * `isAccuracyTesting` não era lido em lugar nenhum do arquivo: o cursor ficava
 * visível durante os ~17 s da medição, e o erro relatado passava a ser o do
 * loop de perseguição, não o do modelo.
 */

let medindo = false;
/** A rodada em curso libera o cursor? (verificação, ou escotilha do operador) */
let cursorLiberadoPelaRodada = false;

// `cursorVisivelNoTeste` é a POLÍTICA, e ela mora em `@tracker/accuracy` — é
// lá que se sabe se a rodada é de medição (malha aberta, cursor escondido) ou
// de verificação (malha fechada, cursor visível de propósito). Este arquivo
// testa o que o `GazeContext` faz com a resposta; que a política em si esteja
// certa é assunto de `src/accuracy.modoDeVerificacao.test.ts`.
vi.mock('@tracker/accuracy', () => ({
  get isAccuracyTesting() { return medindo; },
  cursorVisivelNoTeste: () => !medindo || cursorLiberadoPelaRodada,
  startAccuracyTest: vi.fn(),
}));

let emitir: (s: GazeSample) => void = () => {};

const engineMock = {
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  dispose: vi.fn(),
  subscribe: (cb: (s: GazeSample) => void) => { emitir = cb; return () => {}; },
  onStateChange: () => () => {},
  onL2CSStatusChange: () => () => {},
  getState: () => 'tracking',
  getSessionUptimeMs: () => 1000,
  getDiagnostics: () => null,
  setFilterPreset: vi.fn(),
  setScreenGeometry: vi.fn(),
  calibration: {
    isCalibrated: () => true,
    onInvalidated: () => () => {},
    setCameraFovDeg: vi.fn(),
    setEyeDominance: vi.fn(),
    getDistanceRange: () => null,
    getCalibrationDistancesCm: () => ({ cameraCm: null, screenCm: null }),
    abort: vi.fn(),
    clear: vi.fn(),
  },
  recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
};

vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return { ...real, createGazeEngine: () => engineMock };
});

vi.mock('./SettingsContext', () => ({
  useSettings: () => ({
    settings: { dwellMs: 1500, filterPreset: 'balanceado-v2', eyeDominance: 'both' },
    updateSettings: vi.fn(),
  }),
}));

import { GazeProvider } from './GazeContext';
import { instalarRelogioDeQuadros, type RelogioDeQuadros } from '../test/quadros';

function amostra(): GazeSample {
  return {
    x: 400, y: 300, timestamp: 0,
    hasFace: true, degraded: false, uncalibrated: false, eyeState: 'open',
  } as GazeSample;
}

/** O provider cria o cursor como um `div[aria-hidden]` filho direto do body. */
function cursor(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(':scope > div[aria-hidden="true"]');
}

describe('GazeContext — cursor durante o teste de precisão', () => {
  let relogio: RelogioDeQuadros;

  /**
   * Emite uma amostra e deixa UM quadro de display acontecer.
   *
   * O callback do engine não escreve mais a posição no DOM — ele alimenta o
   * seguidor e o laço de rAF pinta. Sem o quadro, o teste leria o DOM de antes
   * da amostra. O que se afirma continua sendo o mesmo: o cursor está visível,
   * ou está escondido.
   */
  function emitirEPintar(): void {
    act(() => { emitir(amostra()); });
    relogio.quadro();
  }

  beforeEach(() => {
    medindo = false;
    cursorLiberadoPelaRodada = false;
    emitir = () => {};
    // O cursor também depende da ROTA (ver `rotasComCursor.ts`): numa tela de
    // onboarding ele fica escondido mesmo com modelo carregado. Estes testes
    // são sobre o teste de precisão, então a rota é uma de paciente.
    window.location.hash = '#/menu';
    relogio = instalarRelogioDeQuadros();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera no teste'); }) },
    });
    document.elementFromPoint = vi.fn(() => document.body);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    relogio.restaurar();
    vi.restoreAllMocks();
  });

  it('aparece no rastreamento normal e some enquanto o teste mede', () => {
    render(<GazeProvider><div /></GazeProvider>);

    emitirEPintar();
    const c = cursor();
    expect(c).not.toBeNull();
    expect(c!.style.opacity).not.toBe('0');

    // Esconder é SÍNCRONO no callback do engine, de propósito: esperar o
    // próximo quadro deixaria o cursor visível por até 16 ms depois de a
    // medição começar, e o primeiro alvo é justamente o mais sensível.
    medindo = true;
    act(() => { emitir(amostra()); });
    expect(cursor()!.style.opacity).toBe('0');
    expect(cursor()!.style.transform).toContain('-9999px');
    // E o laço de pintura respeita o esconder: quadros seguintes não o trazem
    // de volta.
    relogio.quadros(4);
    expect(cursor()!.style.opacity).toBe('0');
    expect(cursor()!.style.transform).toContain('-9999px');

    medindo = false;
    emitirEPintar();
    expect(cursor()!.style.opacity).not.toBe('0');
    // Reaparecer é descontinuidade legítima: o cursor volta NO LUGAR, sem ser
    // desenhado atravessando a tela desde o offscreen de -9999 px.
    expect(cursor()!.style.transform).not.toContain('-9999px');
  });

  /**
   * Rodada de VERIFICAÇÃO (ou a escotilha do operador): o cursor aparece
   * durante o teste, de propósito.
   *
   * É o que devolve ao usuário o controle durante os alvos — ele vê onde o
   * sistema acha que ele está olhando e tenta pousar no alvo. O preço está
   * pago do lado do protocolo: aquela rodada mede malha fechada, reporta
   * `result.verificacao` e não escreve a linha de base do vigia.
   */
  it('fica visível durante o teste quando a rodada libera o cursor', () => {
    render(<GazeProvider><div /></GazeProvider>);

    medindo = true;
    cursorLiberadoPelaRodada = true;
    emitirEPintar();
    expect(cursor()!.style.opacity).not.toBe('0');
    expect(cursor()!.style.transform).not.toContain('-9999px');
  });

  it('não aparece na jornada anterior à calibração, mesmo com perfil calibrado', () => {
    // O defeito relatado: na escolha de paciente o cursor aparecia. O perfil
    // salvo já deixa `isCalibrated()` verdadeiro, mas o modelo carregado é o
    // do último paciente — ninguém disse ainda quem vai usar agora.
    window.location.hash = '#/profiles';
    render(<GazeProvider><div /></GazeProvider>);

    emitirEPintar();
    expect(cursor()!.style.opacity).toBe('0');
    relogio.quadros(4);
    expect(cursor()!.style.opacity).toBe('0');
  });

  it('a liberação do teste NÃO revela o cursor durante a calibração', () => {
    // Na calibração a pessoa precisa FIXAR o alvo, e um ponto se mexendo ao
    // lado é justamente o que estraga a fixação que se está coletando. A
    // decisão da calibração é do contexto e não passa pelo módulo de teste.
    cursorLiberadoPelaRodada = true;
    engineMock.getState = () => 'calibrating';
    render(<GazeProvider><div /></GazeProvider>);

    emitirEPintar();
    expect(cursor()!.style.opacity).toBe('0');
    relogio.quadros(4);
    expect(cursor()!.style.opacity).toBe('0');
    engineMock.getState = () => 'tracking';
  });
});
