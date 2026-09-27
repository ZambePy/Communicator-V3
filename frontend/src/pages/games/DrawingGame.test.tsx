import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import i18n from '../../i18n';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import type { GazeSample } from '@tracker/tracker/engine';
import { DrawingGame } from './DrawingGame';
import { lerAlbum } from '../entertainment/album';

// Guarda o callback registrado pela tela para simular amostras do olhar.
const gaze = vi.hoisted(() => ({
  callback: null as ((s: GazeSample) => void) | null,
  cancelar: vi.fn(),
}));

vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({
    subscribe: (cb: (s: GazeSample) => void) => {
      gaze.callback = cb;
      return gaze.cancelar;
    },
  }),
  useIsDwelling: () => false,
}));

const amostra = (x: number, y: number, hasFace = true): GazeSample => ({
  x,
  y,
  timestamp: 0,
  hasFace,
});

const renderizar = () =>
  render(
    <BrowserRouter>
      <DrawingGame />
    </BrowserRouter>
  );

// Os rótulos vêm do i18n: sem idioma carregado, `t()` devolveria a chave.
beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('DrawingGame — Desenho com Olhar', () => {
  beforeEach(() => {
    gaze.callback = null;
    gaze.cancelar.mockClear();
  });

  it('assina o fluxo do olhar ao montar e cancela ao sair', () => {
    const { unmount } = renderizar();
    expect(gaze.callback).toBeTypeOf('function');
    unmount();
    expect(gaze.cancelar).toHaveBeenCalled();
  });

  it('começa com o pincel desligado e alterna por um alvo de fixação longa', () => {
    renderizar();

    const alternar = screen.getByLabelText('Ligar o pincel');
    // Dwell longo: este botão é a única forma de PARAR de pintar.
    expect(Number(alternar.getAttribute('data-dwell-ms'))).toBeGreaterThanOrEqual(1500);
    expect(alternar).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(alternar);

    const desligar = screen.getByLabelText('Desligar o pincel');
    expect(desligar).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Pincel ligado')).toBeInTheDocument();
  });

  it('processa amostras do olhar sem quebrar, com o pincel ligado ou desligado', () => {
    renderizar();
    const emitir = () => {
      gaze.callback?.(amostra(500, 400));
      gaze.callback?.(amostra(520, 420, false)); // sem rosto: ignorada
      gaze.callback?.(amostra(-50, -50)); // fora do canvas: ignorada
    };

    expect(emitir).not.toThrow();
    fireEvent.click(screen.getByLabelText('Ligar o pincel'));
    expect(emitir).not.toThrow();
  });

  it('cor, traço e apagar ficam no painel de ferramentas, com alvos grandes (FE-18)', () => {
    renderizar();
    expect(screen.getByLabelText('Voltar para Lazer e bem-estar')).toBeInTheDocument();
    // Fechado: as cores não disputam espaço com o canvas na barra estreita.
    expect(screen.queryByLabelText('Cor Azul')).toBeNull();

    fireEvent.click(screen.getByLabelText('Cor e traço'));
    expect(screen.getByRole('dialog', { name: 'Ferramentas de desenho' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cor Azul')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Cor Vermelho')).toBeInTheDocument();
    expect(screen.getByLabelText('Cor Amarelo')).toBeInTheDocument();
    expect(screen.getByLabelText('Apagar todo o desenho')).toBeInTheDocument();

    // Escolher a cor fecha o painel e a cor muda de fato.
    fireEvent.click(screen.getByLabelText('Cor Verde'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByLabelText('Cor e traço'));
    expect(screen.getByLabelText('Cor Verde')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Cor Azul')).toHaveAttribute('aria-checked', 'false');
    // O mesmo botão da barra fecha o painel.
    fireEvent.click(screen.getByLabelText('Fechar as ferramentas'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('todos os controles da barra lateral têm pelo menos 120 px de altura, e o Voltar tem zona ampliada', () => {
    renderizar();
    for (const nome of ['Ligar o pincel', 'Cor e traço', 'Guardar o desenho no álbum']) {
      expect(parseInt(screen.getByLabelText(nome).style.height, 10)).toBeGreaterThanOrEqual(120);
    }
    const voltar = screen.getByLabelText('Voltar para Lazer e bem-estar');
    expect(voltar).toHaveAttribute('data-isolado', 'true');
  });

  it('cicla a espessura do pincel no painel, sem fechá-lo', () => {
    renderizar();
    fireEvent.click(screen.getByLabelText('Cor e traço'));
    const botao = () => screen.getByLabelText(/^Espessura /);
    expect(botao().getAttribute('aria-label')).toContain('Média');
    fireEvent.click(botao());
    expect(botao().getAttribute('aria-label')).toContain('Grossa');
    fireEvent.click(botao());
    expect(botao().getAttribute('aria-label')).toContain('Fina');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('com o painel aberto o olhar não pinta o desenho que está embaixo', () => {
    const stroke = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke,
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const rect = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    try {
      renderizar();
      fireEvent.click(screen.getByLabelText('Ligar o pincel'));
      fireEvent.click(screen.getByLabelText('Cor e traço'));
      gaze.callback?.(amostra(300, 300));
      gaze.callback?.(amostra(320, 310));
      expect(stroke).not.toHaveBeenCalled();
      fireEvent.click(screen.getByLabelText('Fechar as ferramentas'));
      gaze.callback?.(amostra(300, 300));
      expect(stroke).toHaveBeenCalled();
    } finally {
      getContext.mockRestore();
      rect.mockRestore();
    }
  });

  // Timeout ampliado: o teste é síncrono e passa em ~460ms isolado, mas quando
  // a suíte inteira roda em paralelo esta tela (6 GazeButtons + canvas) apanha
  // contenção de CPU e chega perto do teto padrão de 5 s.
  it('mantém o desenho por mouse para quem testa sem rastreamento', () => {
    renderizar();
    const canvas = screen.getByLabelText('Área de desenho');
    expect(() => {
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(canvas, { clientX: 160, clientY: 140 });
      fireEvent.mouseUp(canvas);
    }).not.toThrow();
  }, 15000);

  it('guarda o desenho no MESMO álbum das fotos, rotulado como desenho', () => {
    // jsdom não tem canvas: `toDataURL` e `getContext` são simulados aqui.
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,DESENHO');
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    try {
      renderizar();
      const canvas = screen.getByLabelText('Área de desenho') as HTMLCanvasElement;
      canvas.width = 800;
      canvas.height = 600;
      const guardar = screen.getByLabelText('Guardar o desenho no álbum');
      expect(guardar.className).toContain('gaze-button');
      fireEvent.click(guardar);

      expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7);
      const album = lerAlbum();
      expect(album).toHaveLength(1);
      expect(album[0]).toEqual(
        expect.objectContaining({ dataUrl: 'data:image/jpeg;base64,DESENHO', filter: 'Desenho' })
      );
      expect(screen.getByText('Guardado no álbum')).toBeInTheDocument();
    } finally {
      toDataURL.mockRestore();
      getContext.mockRestore();
    }
  });
});
