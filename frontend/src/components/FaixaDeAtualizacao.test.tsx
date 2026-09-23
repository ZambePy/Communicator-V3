import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { FaixaDeAtualizacao, DWELL_DO_REINICIAR_MS } from './FaixaDeAtualizacao';

let estadoDoMotor = 'tracking';
let confirmando = false;
vi.mock('../context/GazeContext', () => ({ useGaze: () => ({ state: estadoDoMotor }) }));
vi.mock('../context/EmergencyContext', () => ({ useEmergency: () => ({ isConfirming: confirmando }) }));

type Janela = { irisflowAtualizacao?: unknown };

function ponte(estado: unknown) {
  const instalar = vi.fn(async () => true);
  (window as unknown as Janela).irisflowAtualizacao = {
    estado: async () => estado,
    verificar: async () => true,
    instalar,
    aoMudar: () => () => undefined,
  };
  return { instalar };
}

async function montar(rota = '/menu') {
  render(
    <MemoryRouter initialEntries={[rota]}>
      <FaixaDeAtualizacao />
    </MemoryRouter>
  );
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  delete (window as unknown as Janela).irisflowAtualizacao;
  estadoDoMotor = 'tracking';
  confirmando = false;
});

describe('faixa de atualização', () => {
  it('pronta: "Reiniciar agora" e "Depois" são alvos de olhar grandes', async () => {
    const { instalar } = ponte({ fase: 'pronta', versao: '1.0.1' });
    await montar();
    expect(screen.getByText('Atualização pronta')).toBeInTheDocument();
    const reiniciar = screen.getByRole('button', { name: /Reiniciar agora/ });
    const depois = screen.getByRole('button', { name: /Depois/ });
    for (const b of [reiniciar, depois]) {
      expect(b.className).toContain('gaze-button');
      expect(b.getAttribute('data-no-dwell')).toBeNull();
      expect(parseInt(b.style.height, 10)).toBeGreaterThanOrEqual(96);
    }
    // Reiniciar no meio de uma frase apaga a frase: o dwell é mais longo.
    expect(reiniciar.getAttribute('data-dwell-ms')).toBe(String(DWELL_DO_REINICIAR_MS));
    fireEvent.click(reiniciar);
    expect(instalar).toHaveBeenCalled();
  });

  it('"Depois" dispensa a faixa', async () => {
    ponte({ fase: 'pronta', versao: '1.0.1' });
    await montar();
    fireEvent.click(screen.getByRole('button', { name: /Depois/ }));
    expect(screen.queryByTestId('faixa-atualizacao')).toBeNull();
  });

  it('fica abaixo da Emergência e do alarme dela', async () => {
    ponte({ fase: 'pronta', versao: '1.0.1' });
    await montar();
    const z = Number(screen.getByTestId('faixa-atualizacao').style.zIndex);
    expect(z).toBeLessThan(99990);
  });

  it('não aparece no teclado, na calibração nem com o alarme aberto', async () => {
    ponte({ fase: 'pronta', versao: '1.0.1' });
    await montar('/keyboard');
    expect(screen.queryByTestId('faixa-atualizacao')).toBeNull();
  });

  it('não aparece durante a medição', async () => {
    ponte({ fase: 'pronta', versao: '1.0.1' });
    estadoDoMotor = 'calibrating';
    await montar();
    expect(screen.queryByTestId('faixa-atualizacao')).toBeNull();
  });

  it('não aparece com o alarme de emergência aberto', async () => {
    ponte({ fase: 'pronta', versao: '1.0.1' });
    confirmando = true;
    await montar();
    expect(screen.queryByTestId('faixa-atualizacao')).toBeNull();
  });

  it('baixando: só informa, sem alvo', async () => {
    ponte({ fase: 'baixando', versao: '1.0.1', progresso: 40 });
    await montar();
    expect(screen.getByTestId('faixa-atualizacao')).toHaveTextContent('40%');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sem ponte (navegador): nada', async () => {
    await montar();
    expect(screen.queryByTestId('faixa-atualizacao')).toBeNull();
  });
});
