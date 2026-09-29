import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import i18n from '../../i18n';
import { AtalhoDeCalibracao } from './AtalhoDeCalibracao';

/**
 * As Configurações não tinham como calibrar: o teste de precisão dali pedia
 * "Calibre primeiro", o cartão do menu prometia "Ajustes e calibração" e o
 * README listava "o botão manual em Configurações" — que não existia.
 */
const navigate = vi.fn();
let calibrado = false;
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({ calibration: { isCalibrated: () => calibrado } }),
}));
vi.mock('@tracker/calibration', () => ({
  getCalibrationTimestampMs: () => Date.now() - 60_000,
}));

beforeEach(async () => {
  navigate.mockClear();
  calibrado = false;
  await i18n.changeLanguage('pt-BR');
});

describe('atalho de calibração nas Configurações', () => {
  it('leva à calibração', () => {
    render(<AtalhoDeCalibracao />);
    fireEvent.click(screen.getByRole('button', { name: 'Calibrar o olhar' }));
    expect(navigate).toHaveBeenCalledWith('/calibration-check');
  });

  it('sem calibração em uso, diz que o olhar não seleciona nada', () => {
    render(<AtalhoDeCalibracao />);
    expect(screen.getByText(/nenhuma calibração em uso/i)).toBeTruthy();
  });

  it('com calibração em uso, diz de quando ela é', () => {
    calibrado = true;
    render(<AtalhoDeCalibracao />);
    expect(screen.getByText('Em uso: calibração de hoje.')).toBeTruthy();
  });
});
