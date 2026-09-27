import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Recuperação do detector em LAÇO (CORE-4).
 *
 * Antes, depois de uma perda de contexto WebGL o engine tentava recriar o
 * `FaceLandmarker` UMA vez. Se essa tentativa falhasse — a GPU ainda saindo de
 * um TDR ou de um resume —, o estado ficava em `error` para sempre: sem nova
 * tentativa, sem rAF, e só fechar e abrir o app devolvia o olhar ao paciente.
 */

/** Quais delegates o teste deixa funcionar. */
const permitido = { GPU: true, CPU: true };
/** Criações pedidas, com o delegate de cada uma. */
const criacoes: string[] = [];
let detectDeveLancar = false;

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: {
    createFromOptions: async (_v: unknown, opcoes: { baseOptions: { delegate: 'GPU' | 'CPU' } }) => {
      const delegate = opcoes.baseOptions.delegate;
      criacoes.push(delegate);
      if (!permitido[delegate]) throw new Error(`WebGL: CONTEXT_LOST_WEBGL (${delegate})`);
      return {
        detectForVideo: () => {
          if (detectDeveLancar) throw new Error('detectForVideo: contexto WebGL perdido');
          return { faceLandmarks: [], facialTransformationMatrixes: [] };
        },
        close: () => {},
      };
    },
  },
}));

import { createGazeEngine, ESPERAS_DA_RECUPERACAO_MS, type GazeEngine } from './engine';
import { LOOP_ERROR_FATAL_THRESHOLD } from './loopGuard';

let rafFila: FrameRequestCallback[] = [];
let engine: GazeEngine | null = null;

function videoFalso(): HTMLVideoElement {
  let t = 0;
  return {
    get currentTime() { return (t += 0.033); },
    videoWidth: 1280,
    videoHeight: 720,
    paused: false,
  } as unknown as HTMLVideoElement;
}

/** Roda `n` quadros do laço, drenando a fila de rAF. */
function quadros(n: number): void {
  for (let i = 0; i < n; i++) {
    const cb = rafFila.shift();
    if (!cb) return;
    cb(performance.now());
  }
}

/** Deixa as microtarefas (criação assíncrona do detector) correrem. */
async function drenar(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  permitido.GPU = true;
  permitido.CPU = true;
  criacoes.length = 0;
  detectDeveLancar = false;
  rafFila = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafFila.push(cb); return rafFila.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { rafFila = []; });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  engine?.dispose();
  engine = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Engine rodando (boot normal, na GPU) e então com o contexto WebGL perdido
 * (detector lançando). `gpu`/`cpu` dizem o que funciona DEPOIS da perda.
 */
async function engineComContextoPerdido(depois: { gpu: boolean; cpu: boolean }): Promise<GazeEngine> {
  engine = createGazeEngine('http://teste/mediapipe');
  await engine.start(videoFalso());
  expect(engine.getState()).toBe('tracking');
  permitido.GPU = depois.gpu;
  permitido.CPU = depois.cpu;
  detectDeveLancar = true;
  quadros(LOOP_ERROR_FATAL_THRESHOLD + 2);
  await drenar();
  return engine;
}

describe('engine — recuperação do detector em laço (CORE-4)', () => {
  it('a primeira tentativa falhou: a próxima vem sozinha e o rastreamento volta', async () => {
    // A GPU ainda está voltando.
    const e = await engineComContextoPerdido({ gpu: false, cpu: false });
    expect(e.getState()).toBe('error');
    const depoisDaPrimeira = criacoes.length;

    // A GPU volta; o detector recriado funciona.
    permitido.GPU = true;
    detectDeveLancar = false;
    await vi.advanceTimersByTimeAsync(ESPERAS_DA_RECUPERACAO_MS[0]);
    await drenar();

    expect(criacoes.length).toBeGreaterThan(depoisDaPrimeira);
    expect(e.getState()).toBe('tracking');
    // E o laço de quadros foi rearmado: sem isto o estado seria uma mentira.
    expect(rafFila.length).toBeGreaterThan(0);
  });

  it('continua tentando com espera crescente enquanto o detector não sobe', async () => {
    const e = await engineComContextoPerdido({ gpu: false, cpu: false });
    const inicio = criacoes.length;
    let total = 0;
    for (const espera of ESPERAS_DA_RECUPERACAO_MS) {
      total += espera;
      await vi.advanceTimersByTimeAsync(espera);
      await drenar();
    }
    // Mais uma no teto (30 s), para provar que o laço não para.
    await vi.advanceTimersByTimeAsync(ESPERAS_DA_RECUPERACAO_MS[ESPERAS_DA_RECUPERACAO_MS.length - 1]);
    await drenar();
    expect(criacoes.length - inicio).toBeGreaterThanOrEqual(ESPERAS_DA_RECUPERACAO_MS.length + 1);
    expect(e.getState()).toBe('error');
    expect(e.getDiagnostics().loop.tentativasDeRecuperacao).toBeGreaterThan(ESPERAS_DA_RECUPERACAO_MS.length);
    expect(total).toBeGreaterThan(0);
  });

  it('depois de falhas seguidas na GPU, o detector passa para a CPU', async () => {
    // A GPU não volta mais; a CPU funciona.
    const e = await engineComContextoPerdido({ gpu: false, cpu: true });
    detectDeveLancar = false;
    await vi.advanceTimersByTimeAsync(ESPERAS_DA_RECUPERACAO_MS[0]);
    await drenar();
    expect(criacoes).toContain('CPU');
    expect(e.getState()).toBe('tracking');
    expect(e.getDiagnostics().loop.delegate).toBe('CPU');
  });

  it('no boot, a GPU recusada cai direto para a CPU em vez de falhar o start', async () => {
    permitido.GPU = false;
    engine = createGazeEngine('http://teste/mediapipe');
    await engine.start(videoFalso());
    expect(criacoes).toEqual(['GPU', 'CPU']);
    expect(engine.getState()).toBe('tracking');
    expect(engine.getDiagnostics().loop.delegate).toBe('CPU');
  });

  it('stop() cancela a tentativa agendada', async () => {
    const e = await engineComContextoPerdido({ gpu: false, cpu: false });
    const antes = criacoes.length;
    e.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    await drenar();
    expect(criacoes.length).toBe(antes);
    expect(e.getState()).toBe('idle');
  });
});
