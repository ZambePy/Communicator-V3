import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
// O `React` em escopo: os testes daqui rodam com o JSX clássico.
import React from 'react';
import { GazeStatusBanner, escolherAvisoDoOlhar, type EntradasDoAviso } from './GazeStatusBanner';

// Pouca luz durante o uso (pedido de 18/10/2026: funcionar à noite).

const base: EntradasDoAviso = { state: 'tracking', cameraError: null, calibrationInvalidated: null };
const LUZ = 'Com pouca luz no rosto eu erro mais.';

describe('aviso de pouca luz', () => {
  it('vence o rosto perdido e os olhos fechados (no escuro a causa é a luz)', () => {
    const a = escolherAvisoDoOlhar({ ...base, avisoDePoucaLuz: LUZ, gazeLostMessage: 'Não estou vendo seu rosto…', avisoDeOlhosFechados: 'Olhos.' });
    expect(a).toMatchObject({ titulo: 'Está escuro para a câmera', problema: 'pouca_luz', tom: 'aviso', clareavel: true });
  });

  it('fica abaixo da contraluz e dos erros', () => {
    expect(escolherAvisoDoOlhar({ ...base, avisoDePoucaLuz: LUZ, avisoDeContraluz: 'Luz atrás.' })?.problema).toBe('contraluz');
    expect(escolherAvisoDoOlhar({ ...base, avisoDePoucaLuz: LUZ, state: 'sem_camera' })?.problema).toBe('camera');
  });

  it('"Clarear a tela" aparece só quando a tela está escurecida, e é dwellável', () => {
    const { rerender } = render(<GazeStatusBanner {...base} avisoDePoucaLuz={LUZ} />);
    expect(screen.getByText('Está escuro para a câmera')).toBeInTheDocument();
    expect(screen.queryByTestId('clarear-tela')).toBeNull();
    const clarear = vi.fn();
    rerender(<GazeStatusBanner {...base} avisoDePoucaLuz={LUZ} onClarearTela={clarear} />);
    const botao = screen.getByTestId('clarear-tela');
    expect(botao).not.toHaveAttribute('data-no-dwell');
    fireEvent.click(botao);
    expect(clarear).toHaveBeenCalledTimes(1);
  });

  // Revisão de UX de 19/10/2026: com pouca luz a mira piora; o botão tem o
  // tamanho mínimo de alvo nos dois sentidos.
  it('"Clarear a tela" tem pelo menos o tamanho mínimo de alvo', () => {
    document.documentElement.style.setProperty('--gaze-target-min', '210px');
    try {
      render(<GazeStatusBanner {...base} avisoDePoucaLuz={LUZ} onClarearTela={() => {}} />);
      const estilo = screen.getByTestId('clarear-tela').style;
      expect(parseFloat(estilo.minHeight)).toBeGreaterThanOrEqual(210);
      expect(parseFloat(estilo.minWidth)).toBeGreaterThanOrEqual(210);
    } finally {
      document.documentElement.style.removeProperty('--gaze-target-min');
    }
  });
});
