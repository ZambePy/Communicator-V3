import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import i18n from '../../i18n';
import { EXPERIMENT } from '@tracker/config/experiment';
import { PreparoDaCalibracao } from './PreparoDaCalibracao';

const alvoInferior = EXPERIMENT.alvoInferiorCentral;

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});
afterEach(() => {
  EXPERIMENT.alvoInferiorCentral = alvoInferior;
});

describe('PreparoDaCalibracao', () => {
  it('promete o número de pontos que a calibração completa vai pedir', () => {
    // 9 da grade + 4 cantos da tela + o meio da borda de baixo (M7).
    EXPERIMENT.alvoInferiorCentral = true;
    const { unmount } = render(<PreparoDaCalibracao />);
    expect(screen.getByText(/São 14 pontos/)).toBeInTheDocument();
    unmount();
    // Sem o 14º alvo, 13 — nunca os 9 de antes dos cantos.
    EXPERIMENT.alvoInferiorCentral = false;
    render(<PreparoDaCalibracao />);
    expect(screen.getByText(/São 13 pontos/)).toBeInTheDocument();
  });
});
