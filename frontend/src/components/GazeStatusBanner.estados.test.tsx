import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { GazeStatusBanner } from './GazeStatusBanner';

// -----------------------------------------------------------------------------
// Estados do engine que param o controle por olhar precisam aparecer para quem
// está perto. Antes o banner ignorava `state`: câmera que parou de enviar
// imagem e detector de rosto em falha ficavam só no heartbeat — na tela, um
// cursor parado.
// -----------------------------------------------------------------------------

const base = { cameraError: null, calibrationInvalidated: null };

describe('banner — estados do engine', () => {
  it('sem_camera: diz que a câmera parou e que o app tenta reconectar sozinho', () => {
    render(<GazeStatusBanner {...base} state="sem_camera" />);
    expect(screen.getByTestId('gaze-status-banner')).toBeInTheDocument();
    expect(screen.getByText(/câmera parou de enviar imagem/i)).toBeInTheDocument();
    expect(screen.getByText(/tentando reconectar a câmera sozinho/i)).toBeInTheDocument();
  });

  it('error: diz que o rastreamento parou e que o app tenta recuperar sozinho', () => {
    render(<GazeStatusBanner {...base} state="error" />);
    expect(screen.getByText(/rastreamento do olhar parou/i)).toBeInTheDocument();
    expect(screen.getByText(/tentando recuperar sozinho/i)).toBeInTheDocument();
  });

  it('um erro de câmera com mensagem própria vence o estado genérico', () => {
    render(<GazeStatusBanner {...base} state="sem_camera" cameraError="Nenhuma câmera encontrada." />);
    expect(screen.getByText(/câmera não está disponível/i)).toBeInTheDocument();
    expect(screen.queryByText(/parou de enviar imagem/i)).not.toBeInTheDocument();
  });

  it('câmera parada vence o aviso de rosto perdido (o rosto não sumiu: a imagem é que parou)', () => {
    render(<GazeStatusBanner {...base} state="sem_camera" gazeLostMessage="Posicione o rosto" />);
    expect(screen.getByText(/parou de enviar imagem/i)).toBeInTheDocument();
    expect(screen.queryByText('Posicione o rosto')).not.toBeInTheDocument();
  });

  it('estados normais continuam sem banner', () => {
    for (const s of ['tracking', 'no_face', 'degraded', 'calibrating', 'uncalibrated', 'idle', 'loading']) {
      const { container, unmount } = render(<GazeStatusBanner {...base} state={s} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});

describe('banner — calibração suspensa pela janela fora do tamanho', () => {
  it('é aviso (não erro) e mostra o texto do provider', () => {
    render(
      <GazeStatusBanner
        {...base}
        state="degraded"
        avisoDeTela="A janela saiu da tela cheia. Pressione F11 para voltar."
      />
    );
    expect(screen.getByText(/modo reduzido/i)).toBeInTheDocument();
    expect(screen.getByText(/Pressione F11/)).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('fica abaixo dos erros de câmera', () => {
    render(<GazeStatusBanner {...base} state="tracking" cameraError="Dispositivo em uso." avisoDeTela="Janela menor." />);
    expect(screen.getByText(/câmera não está disponível/i)).toBeInTheDocument();
    expect(screen.queryByText('Janela menor.')).not.toBeInTheDocument();
  });
});
