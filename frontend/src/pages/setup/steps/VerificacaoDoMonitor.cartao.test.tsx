import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import i18n from '../../../i18n';
import { VerificacaoDoMonitor } from './VerificacaoDoMonitor';

type Janela = { irisflowSystem?: unknown };

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  (window as unknown as Janela).irisflowSystem = {
    getDisplayInfo: async () => ({
      widthPx: 1920,
      heightPx: 1080,
      scaleFactor: 1,
      physicalWidthPx: 1920,
      physicalHeightPx: 1080,
    }),
  };
});
afterEach(() => {
  delete (window as unknown as Janela).irisflowSystem;
});

describe('tamanho do monitor: opcional, com medida por cartão', () => {
  it('diz que o passo é opcional e o que vale se ficar em branco', () => {
    render(<VerificacaoDoMonitor diagonalDoEdid={null} aoMudar={vi.fn()} diagonalAtual={23.6} />);
    expect(screen.getByTestId('monitor-opcional')).toHaveTextContent(/opcional/i);
    expect(screen.getByTestId('monitor-opcional')).toHaveTextContent('23,6 polegadas');
  });

  it('"Medir com um cartão" preenche o MESMO campo, com origem manual', async () => {
    const aoMudar = vi.fn();
    render(<VerificacaoDoMonitor diagonalDoEdid={null} aoMudar={aoMudar} />);
    fireEvent.click(screen.getByRole('button', { name: /Medir com um cartão/ }));
    expect(screen.getByRole('dialog', { name: /Medir com um cartão/ })).toBeInTheDocument();

    // Contorno inicial: 324 px CSS (o "mm CSS"). Numa tela 1920×1080 com dpr 1
    // isso é um monitor de ≈ 22,9".
    await waitFor(() => expect(screen.getByTestId('medida-do-cartao')).toHaveTextContent('22,9 polegadas'));
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir bastante' }));
    // 314 px → 23,6"
    expect(screen.getByTestId('medida-do-cartao')).toHaveTextContent('23,6 polegadas');

    fireEvent.click(screen.getByRole('button', { name: /Usar esta medida/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText(/diagonal em polegadas/i) as HTMLInputElement).value).toBe('23.6');
    expect(aoMudar).toHaveBeenLastCalledWith(23.6, 'manual');
  });

  it('cancelar não mexe no campo', () => {
    const aoMudar = vi.fn();
    render(<VerificacaoDoMonitor diagonalDoEdid={23.6} aoMudar={aoMudar} />);
    fireEvent.click(screen.getByRole('button', { name: /Medir com um cartão/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }));
    expect(aoMudar).toHaveBeenLastCalledWith(23.6, 'edid');
  });
});
