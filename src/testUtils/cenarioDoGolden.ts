// Cenário determinístico para conferir que o pipeline anterior continua o
// mesmo, bit a bit, dentro da base de código do V2 (`pipeline: 'base'`).
//
// Roda o extractor sobre rostos sintéticos e uma calibração completa, com
// pose e distância variando, até o `mapGaze`. Só usa funções que já existiam
// em e731357 (a beta de 27/09, de onde o V2 partiu): o MESMO arquivo, copiado
// para uma cópia daquele commit, gera `golden-pipeline-base.json`; o teste
// `golden.pipelineBase.test.ts` roda este cenário no código de hoje com as
// flags do V3 desligadas e compara número por número. Regenerar o JSON a
// partir do código de hoje esconderia exatamente o que ele existe para mostrar.

import { vi } from 'vitest';
import * as calib from '../calibration';
import { extractFeatures } from '../featurePipeline';
import type { Point3D } from '../extractor';
import { EXPERIMENT } from '../config/experiment';

export interface ResultadoDoGolden {
  /** Vetores projetados de cada rosto sintético (olho esquerdo, direito). */
  extractor: { l: number[]; r: number[] }[];
  /** Alvos da calibração, em fração da tela. */
  alvos: { x: number; y: number }[];
  /** Erros do ajuste: treino, LOO e LOO por alvo, em px. */
  ajuste: { treino: number; loo: number; porAlvo: number[] };
  /** Predições do `mapGaze` numa grade 5×5, em três posturas. */
  predicoes: ({ x: number; y: number } | null)[];
}

const W = 1920;
const H = 1080;

/** mulberry32: a mesma sequência em qualquer máquina. */
function prng(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) - 0.5;
  };
}

/** Rosto com os 478 landmarks, deslocado e esticado de leve. */
function rosto(dx: number, dy: number, escala: number): Point3D[] {
  return Array.from({ length: 478 }, (_, i) => ({
    x: 0.5 + dx + Math.sin(i * 0.7) * 0.02 * escala,
    y: 0.5 + dy + Math.cos(i * 0.9) * 0.02 * escala,
    z: Math.sin(i * 0.3) * 0.01 * escala,
  }));
}

/** Matriz facial 4×4 em coluna-maior (como a do MediaPipe) de R = Ry·Rx·Rz. */
function matrizFacial(yaw: number, pitch: number, roll: number): Float32Array {
  const [cy, sy, cp, sp, cr, sr] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), Math.cos(roll), Math.sin(roll)];
  const ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]];
  const rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  const mul = (a: number[][], b: number[][]) =>
    a.map((l) => [0, 1, 2].map((j) => l[0] * b[0][j] + l[1] * b[1][j] + l[2] * b[2][j]));
  const r = mul(mul(ry, rx), rz);
  const m = new Float32Array(16);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[4 * j + i] = r[i][j];
  m[12] = 1.5;
  m[13] = -2;
  m[14] = -55;
  m[15] = 1;
  return m;
}

/** Olho sintético do teste de correção local: satura embaixo, expande num canto. */
function olho(x: number, y: number, rnd: () => number): number[] {
  const ys = Math.min(y, 0.84);
  const expande = x > 0.9 && y < 0.1 ? 1.25 : 1;
  return [
    (x - 0.5) * 0.08 * expande + rnd() * 0.0008,
    (ys - 0.5) * 0.05 + rnd() * 0.0008,
    Math.tan((x - 0.5) * 0.9 * expande) + rnd() * 0.003,
    Math.tan((ys - 0.5) * 0.5) + rnd() * 0.003,
  ];
}

function qualidade(yaw: number, pitch: number, roll: number) {
  return {
    yaw, pitch, roll,
    irisVisibilityPercentage: 1, detectorConfidence: 0.99,
    brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0,
  };
}

export function rodarCenario(): ResultadoDoGolden {
  let relogio = 0;
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
  const agora = vi.spyOn(performance, 'now').mockImplementation(() => relogio);
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const persistir = EXPERIMENT.persistirCalibracao;
  EXPERIMENT.persistirCalibracao = false;
  try {
    // ── extractor ─────────────────────────────────────────────────────
    const extractor: ResultadoDoGolden['extractor'] = [];
    const casos: [number, number, number, number, number, number, number, number][] = [
      // dx, dy, escala, yaw, pitch, roll, yaw do L2CS, pitch do L2CS
      [0, 0, 1, 0, 0, 0, 0.05, -0.03],
      [0.03, -0.02, 1.1, 0.12, -0.05, 0.08, -0.2, 0.1],
      [-0.04, 0.03, 0.9, -0.15, 0.1, -0.12, 0.3, -0.25],
      [0.01, 0.01, 1.05, 0.05, 0.2, 0.15, 0.1, 0.4],
    ];
    for (const [dx, dy, esc, yaw, pitch, roll, gy, gp] of casos) {
      const r = extractFeatures(rosto(dx, dy, esc), matrizFacial(yaw, pitch, roll), { yaw: gy, pitch: gp, valid: true, confidence: 0.9 }, W, H);
      extractor.push({ l: r.featuresLeft, r: r.featuresRight });
    }

    // ── calibração ───────────────────────────────────────────────────
    const rnd = prng(20260929);
    calib.clearCalibration();
    calib.startCalibrationMode();
    const alvos = calib.getCalibrationTargets().map((t) => ({ x: t.x, y: t.y }));
    for (const t of alvos) {
      calib.startCollectingPoint(t.x, t.y, () => {});
      const dur = calib.duracaoTotalDoPonto(calib.getCollectionMsForPoint(t.x, t.y));
      for (let ms = 0; ms <= dur + 200; ms += 33) {
        relogio += 33;
        const pose = { yaw: 0.04 + rnd() * 0.02, pitch: -0.03 + rnd() * 0.02, roll: 0.01 + rnd() * 0.01 };
        calib.setCurrentFramePose(pose);
        calib.setCurrentFrameGeometry(250 + rnd() * 4, W, H, { x: 0.5 + rnd() * 0.004, y: 0.45 + rnd() * 0.004 });
        calib.feedRawData(olho(t.x, t.y, rnd), olho(t.x, t.y, rnd), qualidade(pose.yaw, pose.pitch, pose.roll));
      }
    }
    calib.completeCalibration(() => {});
    const fit = calib.getCalibrationFitDiagnostics();
    const ajuste = {
      treino: fit?.trainErrorPx ?? Number.NaN,
      loo: fit?.looErrorPx ?? Number.NaN,
      porAlvo: (fit?.looByTarget ?? []).map((a) => a.errorPx),
    };

    // ── predição, em três posturas ─────────────────────────────────────
    const zero = () => 0;
    const predicoes: ResultadoDoGolden['predicoes'] = [];
    const posturas = [
      { pose: { yaw: 0.04, pitch: -0.03, roll: 0.01 }, iod: 252, centro: { x: 0.5, y: 0.45 } },
      { pose: { yaw: 0.12, pitch: -0.08, roll: 0.05 }, iod: 240, centro: { x: 0.53, y: 0.47 } },
      { pose: { yaw: -0.06, pitch: 0.05, roll: -0.04 }, iod: 265, centro: { x: 0.47, y: 0.43 } },
    ];
    for (const { pose, iod, centro } of posturas) {
      relogio += 1000;
      calib.setCurrentFramePose(pose);
      calib.setCurrentFrameGeometry(iod, W, H, centro);
      for (const y of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          const p = calib.mapGaze(olho(x, y, zero), olho(x, y, zero));
          predicoes.push(p ? { x: p.x, y: p.y } : null);
        }
      }
    }
    return { extractor, alvos, ajuste, predicoes };
  } finally {
    calib.clearCalibration();
    EXPERIMENT.persistirCalibracao = persistir;
    agora.mockRestore();
    log.mockRestore();
    aviso.mockRestore();
  }
}
