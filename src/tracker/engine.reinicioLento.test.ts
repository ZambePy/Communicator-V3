// Revisão do pipeline de 20/10/2026 — o reinício do modelo do rosto em WASM
// mantém o lado da calibração (448²), e a 448² o WASM é ~3,2× mais lento que a
// 224² (medido em 20/10/2026 num contêiner de 2 CPUs: 2,74–2,75 s contra
// 0,74–0,96 s). Acima de 2,5 s toda leitura chega vencida: o bloco angular vai
// zerado, o status fica `ready`, o estado `tracking`, sem faixa e sem aviso ao
// cuidador — e o modelo calibrado COM o bloco põe o olhar ~480 px fora do
// canto (no olho sintético abaixo), com a Emergência podendo ficar fora de
// alcance.
//
// Os testes da revisão (scratchpad/revisao2_pipeline/testes/
// reinicio448LentoSemAviso.test.ts) afirmavam esse comportamento; aqui, com o
// cliente REAL e a latência simulada no worker falso, a afirmação invertida:
//  - o engine vê a demora das primeiras respostas, refaz o worker pela política
//    (224²) e a troca de lado suspende a calibração — Emergência e recuperação,
//    faixa na tela, `olhar_reduzido` ao cuidador;
//  - com o status `ready` e as leituras vencendo por 10 s, o aviso do modelo do
//    olhar aparece (o caminho `modelo_do_olhar`);
//  - numa máquina em que 448² em WASM cabe no tempo, nada muda: a mesma saída.
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Rosto sintético parado no centro, com um tremor pequeno (sempre presente). */
function rosto(i: number): Array<{ x: number; y: number; z: number }> {
  const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (k: number, x: number, y: number) => { pts[k] = { x, y, z: 0 }; };
  const dx = 0.004 * Math.sin(i / 7);
  const dy = 0.003 * Math.cos(i / 11);
  set(33, 0.60, 0.45); set(133, 0.54, 0.45); set(159, 0.57, 0.435); set(145, 0.57, 0.465);
  set(263, 0.40, 0.45); set(362, 0.46, 0.45); set(386, 0.43, 0.435); set(374, 0.43, 0.465);
  const e = { x: 0.57 + dx, y: 0.45 + dy };
  const d = { x: 0.43 + dx, y: 0.45 + dy };
  set(468, e.x, e.y); set(469, e.x + 0.01, e.y); set(470, e.x, e.y - 0.01); set(471, e.x - 0.01, e.y); set(472, e.x, e.y + 0.01);
  set(473, d.x, d.y); set(474, d.x + 0.01, d.y); set(475, d.x, d.y - 0.01); set(476, d.x - 0.01, d.y); set(477, d.x, d.y + 0.01);
  set(1, 0.5, 0.55); set(10, 0.5, 0.30);
  return pts;
}
let quadro = 0;
let comRosto = true;

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: {
    createFromOptions: async () => ({
      detectForVideo: () => ({ faceLandmarks: comRosto ? [rosto(quadro)] : [], facialTransformationMatrixes: [] }),
      close: () => {},
    }),
  },
}));
// Luz boa: o caso normal.
vi.mock('../contraluz', async (original) => {
  const real = await original<typeof import('../contraluz')>();
  class MedidorDeContraluz {
    medir() { return { rosto: 0.5, fundo: 0.5, razao: 1, nivel: 'ok' as const }; }
    reiniciar() {}
    dispose() {}
    get medida() { return null; }
  }
  return { ...real, MedidorDeContraluz };
});
// O recorte de verdade precisa de um <video> com pixels; aqui ele só precisa
// ter o lado do canvas em vigor — é por ele que o worker falso sabe o lado.
vi.mock('../l2cs/crop', async (original) => {
  const real = await original<typeof import('../l2cs/crop')>();
  return {
    ...real,
    cropFaceToTensor: (_v: unknown, o: { context?: { canvas: { width: number } } }) => {
      const lado = o.context?.canvas.width ?? 224;
      return new Float32Array(3 * lado * lado);
    },
  };
});

import { createGazeEngine, ESPERAS_DO_REINICIO_DO_MODELO_MS, type GazeEngine } from './engine';
import * as cal from '../calibration';
import { EXPERIMENT } from '../config/experiment';
import { INFERENCIAS_FALHAS_PARA_DESISTIR, LATENCIA_MAXIMA_DO_LADO_FIXO_MS } from '../l2cs/client';
import { createDwellState, DEFAULT_DWELL_CONFIG, stepDwell } from '../interaction/dwell';
import type { L2CSModelMeta, L2CSWorkerRequest, L2CSWorkerResponse } from '../l2cs/types';
import { avisoDoModeloDoOlhar, SEM_LEITURA_VALIDA_PARA_AVISAR_MS } from '../../frontend/src/avisoDoModeloDoOlhar';

const META = JSON.parse(
  readFileSync(resolve(__dirname, '../../frontend/public/models/l2cs/l2cs.meta.json'), 'utf8'),
) as L2CSModelMeta;

let relogio = 0;
/** Latência simulada por lado do recorte (ms), como no WASM: 448² custa ~3,2× a 224². */
let latenciaPorLado: Record<number, number> = { 224: 850, 448: 2745 };

class FakeWorker {
  static todos: FakeWorker[] = [];
  posted: L2CSWorkerRequest[] = [];
  terminado = false;
  /** `ready` automático depois do `init` (o worker refeito pela troca de lado). */
  static prontoAutomatico: { provider: 'wasm' | 'webgpu'; aposMs: number } | null = null;
  private pendentes: { id: number; quando: number; lado: number }[] = [];
  private prontoEm: number | null = null;
  private ouvintes: Record<string, Array<(ev: unknown) => void>> = {};
  constructor() { FakeWorker.todos.push(this); }
  addEventListener(tipo: string, fn: (ev: unknown) => void): void { (this.ouvintes[tipo] ??= []).push(fn); }
  removeEventListener(): void {}
  postMessage(msg: L2CSWorkerRequest): void {
    this.posted.push(msg);
    if (msg.type === 'init' && FakeWorker.prontoAutomatico) this.prontoEm = relogio + FakeWorker.prontoAutomatico.aposMs;
    if (msg.type === 'infer') {
      const lado = Math.round(Math.sqrt(msg.tensor.length / 3));
      this.pendentes.push({ id: msg.id, quando: relogio + latenciaPorLado[lado], lado });
    }
  }
  terminate(): void { this.terminado = true; this.pendentes = []; }
  responder(data: L2CSWorkerResponse): void { for (const fn of this.ouvintes.message ?? []) fn({ data }); }
  /** Entrega o que já terminou no relógio virtual. */
  entregar(): void {
    if (this.terminado) return;
    if (this.prontoEm !== null && this.prontoEm <= relogio && FakeWorker.prontoAutomatico) {
      this.prontoEm = null;
      this.responder(pronto(FakeWorker.prontoAutomatico.provider));
    }
    const prontas = this.pendentes.filter((p) => p.quando <= relogio);
    this.pendentes = this.pendentes.filter((p) => p.quando > relogio);
    for (const p of prontas) {
      if (this.terminado) return;
      this.responder({
        type: 'result', id: p.id, yaw: 0.1 + 0.05 * Math.sin(relogio / 700), pitch: -0.05,
        confidence: 0.9, inferenceMs: latenciaPorLado[p.lado],
      });
    }
  }
  errarSempre(): void {
    for (let i = 0; i < INFERENCIAS_FALHAS_PARA_DESISTIR; i++) {
      this.responder({ type: 'infer_error', id: 900 + i, error: 'GPU device lost' });
    }
  }
  get init(): Extract<L2CSWorkerRequest, { type: 'init' }> | undefined {
    return this.posted.find((m): m is Extract<L2CSWorkerRequest, { type: 'init' }> => m.type === 'init');
  }
}
const pronto = (provider: 'webgpu' | 'wasm'): L2CSWorkerResponse => ({
  type: 'ready', meta: META, executionProvider: provider, requested: 'auto', fallback: provider === 'wasm',
  verificacao: { sha256Calculado: null, hashConfere: null },
});

const W = 1920, H = 1080;
function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}
const olho = (rnd: () => number) => (x: number, y: number) => [
  (x - 0.5) * 0.08 + rnd() * 0.0008,
  (y - 0.5) * 0.05 + rnd() * 0.0008,
  Math.tan((x - 0.5) * 0.9) + rnd() * 0.003,
  Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
];
const semRuido = olho(() => 0);
const QUALIDADE = {
  yaw: 0, pitch: 0, roll: 0, irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0,
};
function calibrar() {
  const f = olho(gerador(7));
  expect(cal.startCalibrationMode()).toBe(true);
  for (const t of cal.getCalibrationTargets()) {
    cal.startCollectingPoint(t.x, t.y, () => {});
    const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(t.x, t.y));
    for (let ms = 0; ms <= dur + 200; ms += 33) { relogio += 33; cal.feedRawData(f(t.x, t.y), f(t.x, t.y), QUALIDADE); }
  }
  let ok: boolean | null = null;
  cal.completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
  expect(ok).toBe(true);
}
function sonda(): ({ x: number; y: number } | null)[] {
  const out: ({ x: number; y: number } | null)[] = [];
  for (const y of [0.05, 0.3, 0.5, 0.7, 0.95]) {
    for (const x of [0.05, 0.3, 0.5, 0.7, 0.95]) out.push(cal.mapGaze(semRuido(x, y), semRuido(x, y)));
  }
  return out;
}
async function esvaziar() { for (let i = 0; i < 6; i++) await Promise.resolve(); }

/** Cinco segundos de olhar firme na Emergência, como o dwell do app os vê. */
function olharParaAEmergencia(e: GazeEngine): { cliques: number; bloqueios: (string | null)[] } {
  let st = createDwellState();
  const alvo = { key: 'emergencia', customDwellMs: null, isEmergency: true, isRecovery: false, isDisabled: false };
  let cliques = 0;
  const bloqueios = new Set<string | null>();
  for (let t = 0; t <= 5000; t += 33) {
    const o = stepDwell(st, {
      x: 100, y: 100, timestamp: 10_000 + t, hasFace: true,
      degraded: e.calibration.getSuspensao() !== null,
      uncalibrated: !e.calibration.isCalibrated(), eyeState: 'open',
    }, alvo, DEFAULT_DWELL_CONFIG);
    st = o.state;
    bloqueios.add(o.blockedBy);
    if (o.effect.type === 'click') cliques++;
  }
  return { cliques, bloqueios: [...bloqueios] };
}

let fila: FrameRequestCallback[] = [];
const video = { currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false };

interface Amostra {
  t: number; stalePct: number; inputSize: number; status: string; semLeituraValidaMs: number;
  /** A calibração estava suspensa pelo recorte neste quadro. */
  suspensaPeloRecorte: boolean;
}
/**
 * `ms` de laço a 30 fps, com o worker falso entregando no relógio virtual.
 * Devolve, por quadro, o que o diagnóstico do engine diz.
 */
async function rodarQuadros(e: GazeEngine, ms: number): Promise<Amostra[]> {
  const out: Amostra[] = [];
  const fim = relogio + ms;
  while (relogio < fim) {
    relogio += 33;
    quadro++;
    video.currentTime += 1 / 30;
    for (const w of FakeWorker.todos) w.entregar();
    await esvaziar();
    const q = fila;
    fila = [];
    for (const cb of q) cb(relogio);
    const d = e.getDiagnostics().l2cs;
    out.push({
      t: relogio, stalePct: d.stalePct, inputSize: d.inputSize, status: d.status,
      semLeituraValidaMs: d.semLeituraValidaMs ?? 0,
      suspensaPeloRecorte: Boolean(e.calibration.getSuspensao()?.recorte),
    });
  }
  return out;
}
const fracaoValida = (a: Amostra[]) => (a.length === 0 ? Number.NaN : 1 - a.reduce((s, x) => s + x.stalePct, 0) / (100 * a.length));

const flags = { eyeNet: EXPERIMENT.eyeNet, l2cs: EXPERIMENT.l2cs, persistir: EXPERIMENT.persistirCalibracao };
let engine: GazeEngine | null = null;
const medidas: string[] = [];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  FakeWorker.todos = [];
  FakeWorker.prontoAutomatico = null;
  latenciaPorLado = { 224: 850, 448: 2745 };
  fila = [];
  quadro = 0;
  comRosto = true;
  relogio = 1000;
  video.currentTime = 0;
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { fila.push(cb); return fila.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
  vi.spyOn(Date, 'now').mockImplementation(() => 1_760_000_000_000 + relogio);
  EXPERIMENT.eyeNet = 'off';
  EXPERIMENT.l2cs = 'auto';
  EXPERIMENT.persistirCalibracao = false;
  cal.setSessionGeometry(null);
  engine = createGazeEngine('http://teste/mediapipe');
  await engine.start(video as unknown as HTMLVideoElement);
});

afterEach(() => {
  engine?.dispose();
  engine = null;
  cal.clearCalibration();
  EXPERIMENT.eyeNet = flags.eyeNet;
  EXPERIMENT.l2cs = flags.l2cs;
  EXPERIMENT.persistirCalibracao = flags.persistir;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Sobe em WebGPU (448²), calibra, a GPU cai e o reinício sobe em WASM mantendo 448². */
async function calibradoEmWebgpuEReiniciadoEmWasm(e: GazeEngine) {
  FakeWorker.todos[0].responder(pronto('webgpu'));
  await esvaziar();
  expect(cal.getL2csInputSizeEfetivo()).toBe(448);
  calibrar();
  FakeWorker.todos[0].errarSempre();
  expect(e.getL2CSStatus()).toBe('error');
  await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[0]);
  expect(FakeWorker.todos).toHaveLength(2);
  FakeWorker.todos[1].responder(pronto('wasm'));
  await esvaziar();
  expect(e.getL2CSStatus()).toBe('ready');
  expect(FakeWorker.todos[1].init?.teste).toEqual({ porProvider: { webgpu: 448, wasm: 448 } });
  expect(e.getDiagnostics().l2cs.inputSize).toBe(448);
}

describe('reinício em WASM mantendo 448² numa máquina lenta (revisão de 20/10/2026)', () => {
  it('a 2,745 s por resposta, o engine volta para 224² em segundos, suspende a calibração e a Emergência aciona', async () => {
    const e = engine!;
    await calibradoEmWebgpuEReiniciadoEmWasm(e);
    const invalidacoes: string[] = [];
    e.calibration.onInvalidated((ev) => invalidacoes.push(ev.reason));
    FakeWorker.prontoAutomatico = { provider: 'wasm', aposMs: 1000 };
    const inicio = relogio;

    const amostras = await rodarQuadros(e, 60_000);

    // O worker foi refeito UMA vez, pela política (sem lado fixo), em WASM.
    expect(FakeWorker.todos).toHaveLength(3);
    expect(FakeWorker.todos[1].terminado).toBe(true);
    expect(FakeWorker.todos[2].init?.provider).toBe('wasm');
    expect(FakeWorker.todos[2].init?.teste).toEqual({ porProvider: { webgpu: 448, wasm: 224 } });
    const troca = amostras.find((a) => a.inputSize === 224 && a.status === 'ready');
    expect(troca).toBeDefined();
    const segundosAteATroca = (troca!.t - inicio) / 1000;
    // Duas respostas de 2,745 s e a carga do worker novo (1 s): bem antes dos
    // 10 s do aviso de leituras vencidas.
    expect(segundosAteATroca).toBeLessThan(8);
    expect(e.getDiagnostics().l2cs.inputSize).toBe(224);
    expect(e.getDiagnostics().l2cs.executionProvider).toBe('wasm');
    expect(e.getL2CSStatus()).toBe('ready');
    // A troca não é uma falha: o contador de tentativas não andou.
    expect(e.getDiagnostics().l2cs.reinicio?.tentativas).toBe(1);

    // A calibração de 448² fica, SUSPENSA pelo recorte — o estado seguro.
    expect(cal.getL2csInputSizeEfetivo()).toBe(224);
    expect(e.calibration.isCalibrated()).toBe(true);
    expect(invalidacoes).toEqual([]);
    expect(e.calibration.getSuspensao()?.recorte).toEqual({ calibracao: 448, atual: 224 });
    const { cliques, bloqueios } = olharParaAEmergencia(e);
    expect(cliques).toBeGreaterThanOrEqual(1);
    expect(bloqueios).not.toContain('uncalibrated');

    // Medição: leituras válidas antes e depois da troca.
    const antes = amostras.filter((a) => a.t < troca!.t);
    const depois = amostras.filter((a) => a.t >= troca!.t + 2000);
    const total = fracaoValida(amostras);
    medidas.push(
      `448² a 2745 ms após o reinício: troca para 224² em ${segundosAteATroca.toFixed(1)} s; leituras válidas ` +
      `${(fracaoValida(antes) * 100).toFixed(0)} % antes da troca, ${(fracaoValida(depois) * 100).toFixed(0)} % depois ` +
      `(224² a 850 ms), ${(total * 100).toFixed(0)} % nos 60 s (antes da correção: 0 % nos 60 s)`,
    );
    expect(fracaoValida(antes)).toBeLessThan(0.05);
    expect(fracaoValida(depois)).toBeGreaterThan(0.95);
    expect(total).toBeGreaterThan(0.8);
    // Nenhum aviso de "modelo lento": a troca veio antes dos 10 s, e as leituras voltaram.
    expect(Math.max(...amostras.map((a) => a.semLeituraValidaMs))).toBeLessThan(SEM_LEITURA_VALIDA_PARA_AVISAR_MS);
    expect(avisoDoModeloDoOlhar(e.getDiagnostics(), e.getState())).toBeNull();
  });

  it('numa falha seguinte do worker, o reinício já sobe em 224²: o lado lento não é fixado de novo', async () => {
    const e = engine!;
    await calibradoEmWebgpuEReiniciadoEmWasm(e);
    FakeWorker.prontoAutomatico = { provider: 'wasm', aposMs: 1000 };
    await rodarQuadros(e, 15_000);
    expect(FakeWorker.todos).toHaveLength(3);
    // O worker de 224² morre: o reinício (WASM forçado na 2ª tentativa) segue a política.
    FakeWorker.todos[2].errarSempre();
    await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[1]);
    expect(FakeWorker.todos).toHaveLength(4);
    expect(FakeWorker.todos[3].init?.teste).toEqual({ porProvider: { webgpu: 448, wasm: 224 } });
    const amostras = await rodarQuadros(e, 10_000);
    // Nenhum recorte de 448² enviado ao worker novo, e a calibração suspensa em
    // TODOS os quadros: sem a trava, o lado fixo voltaria a 448², a suspensão
    // sairia e o olhar inteiro voltaria com o bloco angular zerado até a vigia
    // decidir de novo.
    const lados = FakeWorker.todos[3].posted.flatMap((m) => (m.type === 'infer' ? [Math.round(Math.sqrt(m.tensor.length / 3))] : []));
    expect(lados.length).toBeGreaterThan(0);
    expect(new Set(lados)).toEqual(new Set([224]));
    expect(amostras.every((a) => a.suspensaPeloRecorte)).toBe(true);
    expect(e.calibration.getSuspensao()?.recorte).toEqual({ calibracao: 448, atual: 224 });
    expect(e.getL2CSStatus()).toBe('ready');
    expect(e.getDiagnostics().l2cs.inputSize).toBe(224);
  });

  it('num PC em que 448² em WASM leva 0,6 s, nada muda: fica em 448², sem suspensão, a mesma saída', async () => {
    latenciaPorLado = { 224: 200, 448: 600 };
    const e = engine!;
    await calibradoEmWebgpuEReiniciadoEmWasm(e);
    const antes = sonda();
    const amostras = await rodarQuadros(e, 30_000);
    expect(FakeWorker.todos).toHaveLength(2);
    expect(e.getDiagnostics().l2cs.inputSize).toBe(448);
    expect(cal.getL2csInputSizeEfetivo()).toBe(448);
    expect(e.calibration.getSuspensao()).toBeNull();
    expect(sonda()).toEqual(antes);
    expect(fracaoValida(amostras.slice(60))).toBeGreaterThan(0.95);
    expect(avisoDoModeloDoOlhar(e.getDiagnostics(), e.getState())).toBeNull();
    medidas.push(`448² a 600 ms após o reinício: sem troca, ${(fracaoValida(amostras.slice(60)) * 100).toFixed(0)} % de leituras válidas`);
  });

  it('o operador forçou 448² em WASM (condição de medição): a vigia não troca o que ele pediu', async () => {
    EXPERIMENT.l2cs = 'wasm';
    const e = engine!;
    FakeWorker.todos[0].responder(pronto('wasm'));
    await esvaziar();
    expect(cal.getL2csInputSizeEfetivo()).toBe(448);
    calibrar();
    FakeWorker.todos[0].errarSempre();
    await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[0]);
    FakeWorker.todos[1].responder(pronto('wasm'));
    await esvaziar();
    await rodarQuadros(e, 15_000);
    expect(FakeWorker.todos).toHaveLength(2);
    expect(e.getDiagnostics().l2cs.inputSize).toBe(448);
    expect(e.calibration.getSuspensao()).toBeNull();
  });
});

describe('status `ready` com toda leitura vencida (revisão de 20/10/2026)', () => {
  it('a 2,745 s por resposta já na primeira carga: depois de 10 s com rosto, o aviso do modelo do olhar aparece', async () => {
    latenciaPorLado = { 224: 2745, 448: 8000 };
    const e = engine!;
    FakeWorker.todos[0].responder(pronto('wasm'));
    await esvaziar();
    expect(cal.getL2csInputSizeEfetivo()).toBe(224);
    calibrar();
    const amostras = await rodarQuadros(e, 9_000);
    expect(e.getL2CSStatus()).toBe('ready');
    expect(avisoDoModeloDoOlhar(e.getDiagnostics(), e.getState())).toBeNull();
    // Sem rosto o tempo não soma: o problema aí é outro (e tem aviso próprio).
    comRosto = false;
    await rodarQuadros(e, 5_000);
    const parado = e.getDiagnostics().l2cs.semLeituraValidaMs ?? 0;
    expect(parado).toBeLessThan(SEM_LEITURA_VALIDA_PARA_AVISAR_MS);
    comRosto = true;
    const depois = await rodarQuadros(e, 3_000);
    const d = e.getDiagnostics();
    expect(d.l2cs.status).toBe('ready');
    expect(d.l2cs.semLeituraValidaMs ?? 0).toBeGreaterThanOrEqual(SEM_LEITURA_VALIDA_PARA_AVISAR_MS);
    const aviso = avisoDoModeloDoOlhar(d, e.getState());
    expect(aviso?.titulo).toBe('O modelo do olhar está lento neste computador');
    expect(aviso?.detalhe).toMatch(/íris/);
    expect(fracaoValida([...amostras, ...depois])).toBeLessThan(0.05);
    medidas.push(`224² a 2745 ms na primeira carga: aviso com ${((d.l2cs.semLeituraValidaMs ?? 0) / 1000).toFixed(1)} s sem leitura válida (antes da correção: nenhum aviso)`);
  });

  it('uma leitura válida zera a contagem: um modelo normal nunca chega perto dos 10 s', async () => {
    latenciaPorLado = { 224: 850, 448: 2745 };
    const e = engine!;
    FakeWorker.todos[0].responder(pronto('wasm'));
    await esvaziar();
    calibrar();
    const amostras = await rodarQuadros(e, 20_000);
    expect(Math.max(...amostras.map((a) => a.semLeituraValidaMs))).toBeLessThan(2 * 850 + 200);
    expect(avisoDoModeloDoOlhar(e.getDiagnostics(), e.getState())).toBeNull();
  });
});

describe('por que suspender: o modelo calibrado com o bloco angular, quando ele chega zerado', () => {
  it('no olho sintético, o canto sai centenas de pixels do lugar e o centro fica', () => {
    calibrar();
    const linhas: string[] = [];
    let desvioCanto = 0;
    let desvioCentro = 0;
    for (const [x, y] of [[0.95, 0.05], [0.5, 0.5], [0.05, 0.95]] as const) {
      const f = semRuido(x, y);
      const comBloco = cal.mapGaze(f, [...f])!;
      const z = [f[0], f[1], 0, 0];
      const semBloco = cal.mapGaze(z, [...z])!;
      const desvio = Math.hypot(semBloco.x - comBloco.x, semBloco.y - comBloco.y);
      if (x === 0.5) desvioCentro = desvio; else desvioCanto = Math.max(desvioCanto, desvio);
      linhas.push(`alvo (${x},${y}) = (${(x * W).toFixed(0)},${(y * H).toFixed(0)}) px → com o bloco (${comBloco.x.toFixed(0)},${comBloco.y.toFixed(0)}), zerado (${semBloco.x.toFixed(0)},${semBloco.y.toFixed(0)})`);
    }
    medidas.push(linhas.join('\n'));
    expect(desvioCanto).toBeGreaterThan(300);
    expect(desvioCentro).toBeLessThan(5);
    // O limite da vigia é o ponto em que esse deslocamento começa a aparecer.
    expect(LATENCIA_MAXIMA_DO_LADO_FIXO_MS).toBe(1250);
  });
});

// Os números das medições, para o relatório da revisão de 20/10/2026:
//   IRISFLOW_MEDIDAS=<arquivo> npx vitest run src/tracker/engine.reinicioLento.test.ts
afterAll(() => {
  if (process.env.IRISFLOW_MEDIDAS) writeFileSync(process.env.IRISFLOW_MEDIDAS, medidas.join('\n') + '\n');
});
