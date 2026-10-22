// Revisão do pipeline de 19/10/2026 — o supervisor do modelo reinicia o worker
// do rosto (a GPU caiu: sono e volta do notebook, driver que reiniciou). Antes,
// se o worker novo subia em WASM (o `auto` caindo sozinho na 1ª tentativa, ou o
// WASM forçado a partir da 2ª), a política trocava o recorte para 224² e
// `setL2csInputSizeEfetivo(224)` APAGAVA a calibração feita em 448² — e sem
// calibração o dwell bloqueia tudo, inclusive a Emergência. Com a janela fora
// do tamanho (calibração suspensa), o modelo sumia em silêncio, sem evento.
//
// Estes testes são os da revisão (scratchpad/revisao_pipeline/testes/
// reinicioWasmInvalida.test.ts) com a afirmação INVERTIDA: agora o reinício
// mantém o lado do perfil (WASM a 448², que o ONNX aceita) e a calibração
// continua valendo — a Emergência aciona depois do reinício.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: {
    createFromOptions: async () => ({
      detectForVideo: () => ({ faceLandmarks: [], facialTransformationMatrixes: [] }),
      close: () => {},
    }),
  },
}));

import { createGazeEngine, ESPERAS_DO_REINICIO_DO_MODELO_MS, type GazeEngine } from './engine';
import * as cal from '../calibration';
import { EXPERIMENT } from '../config/experiment';
import { INFERENCIAS_FALHAS_PARA_DESISTIR } from '../l2cs/client';
import { createDwellState, DEFAULT_DWELL_CONFIG, stepDwell } from '../interaction/dwell';
import type { L2CSModelMeta, L2CSWorkerRequest, L2CSWorkerResponse } from '../l2cs/types';

const META = JSON.parse(
  readFileSync(resolve(__dirname, '../../frontend/public/models/l2cs/l2cs.meta.json'), 'utf8'),
) as L2CSModelMeta;

class FakeWorker {
  static todos: FakeWorker[] = [];
  posted: L2CSWorkerRequest[] = [];
  terminado = false;
  private ouvintes: Record<string, Array<(ev: unknown) => void>> = {};
  constructor() { FakeWorker.todos.push(this); }
  addEventListener(tipo: string, fn: (ev: unknown) => void): void { (this.ouvintes[tipo] ??= []).push(fn); }
  removeEventListener(): void {}
  postMessage(msg: L2CSWorkerRequest): void { this.posted.push(msg); }
  terminate(): void { this.terminado = true; }
  responder(data: L2CSWorkerResponse): void { for (const fn of this.ouvintes.message ?? []) fn({ data }); }
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
let relogio = 0;
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
function coletar(alvo: { x: number; y: number }, f: (x: number, y: number) => number[], cb: (ok: boolean) => void = () => {}) {
  cal.startCollectingPoint(alvo.x, alvo.y, cb);
  const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(alvo.x, alvo.y));
  for (let ms = 0; ms <= dur + 200; ms += 33) {
    relogio += 33;
    cal.feedRawData(f(alvo.x, alvo.y), f(alvo.x, alvo.y), QUALIDADE);
  }
}
function calibrar() {
  const f = olho(gerador(7));
  expect(cal.startCalibrationMode()).toBe(true);
  for (const t of cal.getCalibrationTargets()) coletar(t, f);
  let ok: boolean | null = null;
  cal.completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
  expect(ok).toBe(true);
}
/** Onde o modelo põe o olhar numa grade de pontos de prova, sem ruído. */
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
      // O que o `emit` do engine faz com a amostra: suspensa, sai degradada.
      degraded: e.calibration.getSuspensao() !== null,
      uncalibrated: !e.calibration.isCalibrated(), eyeState: 'open',
    }, alvo, DEFAULT_DWELL_CONFIG);
    st = o.state;
    bloqueios.add(o.blockedBy);
    if (o.effect.type === 'click') cliques++;
  }
  return { cliques, bloqueios: [...bloqueios] };
}

const flags = { eyeNet: EXPERIMENT.eyeNet, l2cs: EXPERIMENT.l2cs, persistir: EXPERIMENT.persistirCalibracao };
let engine: GazeEngine | null = null;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  FakeWorker.todos = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
  EXPERIMENT.eyeNet = 'off';
  EXPERIMENT.l2cs = 'auto';
  EXPERIMENT.persistirCalibracao = false;
  cal.setSessionGeometry(null);
  engine = createGazeEngine('http://teste/mediapipe');
  await engine.start({ currentTime: 0, videoWidth: 1280, videoHeight: 720, paused: false } as unknown as HTMLVideoElement);
  FakeWorker.todos[0].responder(pronto('webgpu'));
  await esvaziar();
  expect(cal.getL2csInputSizeEfetivo()).toBe(448);
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

/** A GPU caiu: o worker erra tudo, o supervisor reinicia e o worker novo sobe em WASM. */
async function gpuCaiEReiniciaEmWasm(e: GazeEngine) {
  FakeWorker.todos[0].errarSempre();
  expect(e.getL2CSStatus()).toBe('error');
  await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[0]);
  expect(FakeWorker.todos).toHaveLength(2);
  // 1ª tentativa, provider 'auto': sem WebGPU o worker cai para o WASM sozinho.
  FakeWorker.todos[1].responder(pronto('wasm'));
  await esvaziar();
  expect(e.getL2CSStatus()).toBe('ready');
}

describe('supervisor do modelo × calibração em uso', () => {
  it('reinício que sobe em WASM mantém o recorte de 448² e a calibração — e a Emergência aciona', async () => {
    const e = engine!;
    calibrar();
    expect(e.calibration.isCalibrated()).toBe(true);
    const antes = sonda();
    const invalidacoes: string[] = [];
    e.calibration.onInvalidated((ev) => invalidacoes.push(ev.reason));

    await gpuCaiEReiniciaEmWasm(e);

    // O worker novo foi pedido com o lado do perfil para os DOIS providers: a
    // inferência de teste do `init` roda 448² também no WASM.
    expect(FakeWorker.todos[1].init?.teste).toEqual({ porProvider: { webgpu: 448, wasm: 448 } });
    expect(e.getDiagnostics().l2cs.executionProvider).toBe('wasm');
    expect(e.getDiagnostics().l2cs.inputSize).toBe(448);
    expect(cal.getL2csInputSizeEfetivo()).toBe(448);
    expect(invalidacoes).toEqual([]);
    expect(e.calibration.isCalibrated()).toBe(true);
    expect(e.calibration.getSuspensao()).toBeNull();
    // O mesmo modelo: a saída do `mapGaze` é a de antes do reinício, bit a bit.
    expect(sonda()).toEqual(antes);

    const { cliques, bloqueios } = olharParaAEmergencia(e);
    expect(cliques).toBeGreaterThanOrEqual(1);
    expect(bloqueios).not.toContain('uncalibrated');
  });

  it('a 2ª tentativa (WASM forçado) também pede 448², e a calibração continua', async () => {
    const e = engine!;
    calibrar();
    const antes = sonda();
    FakeWorker.todos[0].errarSempre();
    await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[0]);
    FakeWorker.todos[1].responder({ type: 'init_error', error: 'requestAdapter falhou' });
    await esvaziar();
    await vi.advanceTimersByTimeAsync(ESPERAS_DO_REINICIO_DO_MODELO_MS[1]);
    expect(FakeWorker.todos).toHaveLength(3);
    expect(FakeWorker.todos[2].init?.provider).toBe('wasm');
    expect(FakeWorker.todos[2].init?.teste).toEqual({ porProvider: { webgpu: 448, wasm: 448 } });
    FakeWorker.todos[2].responder(pronto('wasm'));
    await esvaziar();
    expect(e.getL2CSStatus()).toBe('ready');
    expect(cal.getL2csInputSizeEfetivo()).toBe(448);
    expect(e.calibration.isCalibrated()).toBe(true);
    expect(sonda()).toEqual(antes);
  });

  it('janela fora do tamanho (calibração SUSPENSA) + reinício em WASM: a calibração fica, suspensa, e volta com a janela', async () => {
    const e = engine!;
    calibrar();
    expect(e.calibration.isCalibrated()).toBe(true);
    let largura = 1600;
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => largura });
    const eventosDaSuspensao: (string | null)[] = [];
    cal.onSuspensaoDaCalibracao((s) => eventosDaSuspensao.push(s ? 'suspensa' : null));
    cal.checarMudancaDeViewport(largura, H);
    expect(eventosDaSuspensao).toEqual(['suspensa']);

    const invalidacoes: string[] = [];
    e.calibration.onInvalidated((ev) => invalidacoes.push(ev.reason));
    await gpuCaiEReiniciaEmWasm(e);

    expect(e.calibration.isCalibrated()).toBe(true);
    expect(invalidacoes).toEqual([]);
    // A faixa continua certa: suspensa, e a Emergência aciona (dwell mais longo).
    expect(eventosDaSuspensao).toEqual(['suspensa']);
    expect(cal.getSuspensaoDaCalibracao()).not.toBeNull();
    const { cliques, bloqueios } = olharParaAEmergencia(e);
    expect(cliques).toBeGreaterThanOrEqual(1);
    expect(bloqueios).not.toContain('uncalibrated');

    // A janela volta ao tamanho: a calibração volta a valer inteira.
    largura = W;
    cal.checarMudancaDeViewport(largura, H);
    expect(e.calibration.isCalibrated()).toBe(true);
    expect(eventosDaSuspensao).toEqual(['suspensa', null]);
  });

  it('reinício em WASM no MEIO de uma calibração nova: a coleta segue no mesmo lado e o perfil sai com 448', async () => {
    const e = engine!;
    const f = olho(gerador(5));
    expect(cal.startCalibrationMode()).toBe(true);
    const alvos = cal.getCalibrationTargets();
    alvos.slice(0, 6).forEach((t) => coletar(t, f));
    const amostrasAntes = cal.getSampleCount();
    expect(amostrasAntes).toBeGreaterThan(0);

    await gpuCaiEReiniciaEmWasm(e);
    expect(FakeWorker.todos[1].init?.teste).toEqual({ porProvider: { webgpu: 448, wasm: 448 } });
    expect(cal.getL2csInputSizeEfetivo()).toBe(448);
    expect(e.calibration.getCalibrationMode()).not.toBeNull();
    alvos.slice(6).forEach((t) => coletar(t, f));
    let ok: boolean | null = null;
    cal.completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
    expect(ok).toBe(true);
    expect(cal.chaveDoContextoAtual()).toContain('l2cs448');
    expect(cal.isCalibrated()).toBe(true);
  });

  it('o mesmo reinício no MEIO de uma recoleta: a rodada continua e o ponto em coleta fecha', async () => {
    const e = engine!;
    calibrar();
    const canto = { x: 0.05, y: 0.05 };
    expect(cal.iniciarRecoletaDeAlvos([canto])).toHaveLength(1);
    const f = olho(gerador(11));
    let chamado = 0;
    cal.startCollectingPoint(canto.x, canto.y, () => { chamado++; });
    for (let i = 0; i < 10; i++) { relogio += 33; cal.feedRawData(f(canto.x, canto.y), f(canto.x, canto.y), QUALIDADE); }

    await gpuCaiEReiniciaEmWasm(e);

    for (let i = 0; i < 300; i++) { relogio += 33; cal.feedRawData(f(canto.x, canto.y), f(canto.x, canto.y), QUALIDADE); }
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chamado).toBe(1);
    expect(cal.recoletaEmAndamento()).toBe(true);
    expect(e.calibration.isCalibrated()).toBe(true);
    const r = cal.concluirRecoletaDeAlvos();
    expect(r.motivo).not.toBe('sem_rodada');
    expect(cal.isCalibrated()).toBe(true);
  });

  it('sem calibração em uso, o reinício segue a política de sempre (WASM a 224²)', async () => {
    const e = engine!;
    expect(e.calibration.isCalibrated()).toBe(false);
    await gpuCaiEReiniciaEmWasm(e);
    expect(FakeWorker.todos[1].init?.teste).toEqual({ porProvider: { webgpu: 448, wasm: 224 } });
    expect(cal.getL2csInputSizeEfetivo()).toBe(224);
    expect(e.getDiagnostics().l2cs.inputSize).toBe(224);
  });
});
