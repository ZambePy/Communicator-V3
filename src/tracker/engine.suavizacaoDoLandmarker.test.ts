import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// M14: com `suavizacaoDoLandmarker: 'desligada'` o FaceLandmarker roda em modo
// IMAGE — sem o One Euro interno do MediaPipe nos landmarks e com o detector a
// cada quadro —, para medir quanto do ruído chega pré-filtrado. O padrão é o
// modo VIDEO de sempre.

const opcoesCriadas: { runningMode?: string }[] = [];
const detect = vi.fn(() => ({ faceLandmarks: [], facialTransformationMatrixes: [] }));
const detectForVideo = vi.fn(() => ({ faceLandmarks: [], facialTransformationMatrixes: [] }));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: {
    createFromOptions: async (_fileset: unknown, opcoes: { runningMode?: string }) => {
      opcoesCriadas.push(opcoes);
      return { detect, detectForVideo, close: vi.fn() };
    },
  },
}));

import { createGazeEngine } from './engine';
import { EXPERIMENT } from '../config/experiment';

let quadros: FrameRequestCallback[] = [];

function videoFalso(): HTMLVideoElement {
  return { currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false } as unknown as HTMLVideoElement;
}

async function rodarUmQuadro(): Promise<void> {
  const engine = createGazeEngine('http://test/mediapipe');
  const video = videoFalso();
  await engine.start(video);
  // Um quadro novo: o engine só detecta quando o tempo do vídeo anda.
  (video as unknown as { currentTime: number }).currentTime = 1;
  const cb = quadros.shift();
  cb?.(performance.now());
  engine.stop();
}

const antes = EXPERIMENT.suavizacaoDoLandmarker;
beforeEach(() => {
  opcoesCriadas.length = 0;
  detect.mockClear();
  detectForVideo.mockClear();
  quadros = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    quadros.push(cb);
    return quadros.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  EXPERIMENT.suavizacaoDoLandmarker = antes;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('suavização interna do FaceLandmarker (M14)', { timeout: 20_000 }, () => {
  it('padrão: modo VIDEO, como sempre', async () => {
    EXPERIMENT.suavizacaoDoLandmarker = 'mediapipe';
    await rodarUmQuadro();
    expect(opcoesCriadas.at(-1)?.runningMode).toBe('VIDEO');
    expect(detectForVideo).toHaveBeenCalled();
    expect(detect).not.toHaveBeenCalled();
  });

  it("'desligada': modo IMAGE, e o quadro passa por detect()", async () => {
    EXPERIMENT.suavizacaoDoLandmarker = 'desligada';
    await rodarUmQuadro();
    expect(opcoesCriadas.at(-1)?.runningMode).toBe('IMAGE');
    expect(detect).toHaveBeenCalled();
    expect(detectForVideo).not.toHaveBeenCalled();
  });
});
