import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { PhotoCaptureScreen } from './PhotoCaptureScreen';
import { lerAlbum, LIMITE_DO_ALBUM } from './album';

// Mock do hook useGaze
vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({
    isDwelling: false,
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

describe('PhotoCaptureScreen — Módulo de Câmera & Fotos', () => {
  beforeEach(() => {
    localStorage.clear();
    // Mock de getUserMedia
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
  });

  it('deve renderizar os botões principais de navegação, disparo, filtro e tempo', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <PhotoCaptureScreen />
        </BrowserRouter>
      );
    });

    // Verifica título
    expect(screen.getByText('Câmera & Fotos')).toBeInTheDocument();

    // Verifica botão de disparo grande
    expect(screen.getByText(/TIRAR FOTO/i)).toBeInTheDocument();

    // Verifica botão de filtro e tempo
    expect(screen.getByText('Filtro')).toBeInTheDocument();
    expect(screen.getByText('Tempo')).toBeInTheDocument();

    // Verifica botão Voltar
    expect(screen.getByText('Voltar')).toBeInTheDocument();
  });

  it('deve alternar os filtros de cor ao clicar no botão Filtro', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <PhotoCaptureScreen />
        </BrowserRouter>
      );
    });

    const filterButton = screen.getByText('Filtro').closest('button');
    expect(filterButton).toBeInTheDocument();

    // Filtro inicial: Normal
    expect(screen.getByText('Normal')).toBeInTheDocument();

    // Clica para mudar filtro
    act(() => {
      fireEvent.click(filterButton!);
    });
    expect(screen.getByText('Vívido')).toBeInTheDocument();

    act(() => {
      fireEvent.click(filterButton!);
    });
    expect(screen.getByText('P&B')).toBeInTheDocument();
  });

  it('deve alternar as opções de temporizador ao clicar no botão Tempo', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <PhotoCaptureScreen />
        </BrowserRouter>
      );
    });

    const timerButton = screen.getByText('Tempo').closest('button');
    expect(timerButton).toBeInTheDocument();

    // Inicial: 3 segundos
    expect(screen.getByText('3 segundos')).toBeInTheDocument();

    // Clica para 5s
    act(() => {
      fireEvent.click(timerButton!);
    });
    expect(screen.getByText('5 segundos')).toBeInTheDocument();

    // Clica para 0s (Sem atraso)
    act(() => {
      fireEvent.click(timerButton!);
    });
    expect(screen.getByText('Sem atraso')).toBeInTheDocument();
  });

  /** jsdom não decodifica vídeo: dá ao <video> as dimensões de um quadro real de câmera. */
  const simularQuadroDaCamera = () => {
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
  };

  /** Tempo cicla 3 → 5 → 0: disparo imediato. */
  const dispararAgora = () => {
    const tempo = screen.getByText('Tempo').closest('button')!;
    act(() => void fireEvent.click(tempo));
    act(() => void fireEvent.click(tempo));
    act(() => void fireEvent.click(screen.getByLabelText('Tirar Foto agora com temporizador')));
  };

  const contextoFalso = () =>
    ({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
    }) as unknown as CanvasRenderingContext2D;

  describe('guardar no álbum', () => {
    const preparar = async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,FOTO');
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contextoFalso());
      await act(async () => {
        render(
          <BrowserRouter>
            <PhotoCaptureScreen />
          </BrowserRouter>
        );
      });
      simularQuadroDaCamera();
      dispararAgora();
    };

    afterEach(() => vi.restoreAllMocks());

    it('salva com o teto do álbum e sem "Baixar" para o paciente', async () => {
      await preparar();
      expect(screen.queryByLabelText(/Baixar/)).toBeNull();
      act(() => void fireEvent.click(screen.getByLabelText('Salvar foto no álbum')));
      expect(lerAlbum()).toHaveLength(1);
      expect(lerAlbum()[0].dataUrl).toBe('data:image/jpeg;base64,FOTO');
      expect(LIMITE_DO_ALBUM).toBeLessThanOrEqual(15);
    });

    it('cota cheia é dita na tela, não engolida', async () => {
      await preparar();
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });
      act(() => void fireEvent.click(screen.getByLabelText('Salvar foto no álbum')));
      expect(screen.getByRole('alert')).toHaveTextContent(/Álbum cheio/);
    });
  });

  // Antes, sem câmera, a tela anunciava "Modo Demonstração Ativo" e fabricava
  // uma "foto" (um degradê escrito "Foto IrisFlow Capturada!") que ia para o
  // álbum do paciente. Nada de demonstração num app instalado.
  describe('sem imagem da câmera, nenhuma foto é inventada', () => {
    afterEach(() => vi.restoreAllMocks());

    it('câmera recusada: aviso honesto, obturador inerte e nenhuma prévia', async () => {
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new DOMException('negado', 'NotAllowedError')
      );
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const desenhar = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
      await act(async () => {
        render(
          <BrowserRouter>
            <PhotoCaptureScreen />
          </BrowserRouter>
        );
      });

      expect(screen.getByText('Câmera indisponível')).toBeInTheDocument();
      expect(screen.queryByText(/demonstra/i)).toBeNull();
      expect(screen.queryByText(/ilustrado/i)).toBeNull();
      expect(screen.getByLabelText('Tirar Foto agora com temporizador')).toBeDisabled();

      dispararAgora();
      expect(screen.queryByLabelText('Salvar foto no álbum')).toBeNull();
      expect(desenhar).not.toHaveBeenCalled();
      expect(lerAlbum()).toHaveLength(0);
    });

    it('obturador antes da primeira imagem: diz para esperar, sem foto falsa', async () => {
      const desenhar = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
      await act(async () => {
        render(
          <BrowserRouter>
            <PhotoCaptureScreen />
          </BrowserRouter>
        );
      });
      // A câmera abriu, mas o <video> ainda não tem quadro (videoWidth 0).
      dispararAgora();
      expect(screen.getByRole('status')).toHaveTextContent(/ainda não mostrou imagem/);
      expect(screen.queryByLabelText('Salvar foto no álbum')).toBeNull();
      expect(desenhar).not.toHaveBeenCalled();
    });
  });
});
