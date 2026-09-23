// Replay de uma gravação real (.jsonl do gravador de sessão) pelo núcleo de
// calibração DE VERDADE — o mesmo `calibration.ts` que roda no app.
//
// Para que serve: medir uma mudança de acurácia com o código TypeScript, e não
// com uma réplica. A gravação traz, por quadro, os landmarks, a pose, as
// features já extraídas e o alvo que estava na tela; o replay refaz a sequência
// de chamadas que o engine faz a cada quadro (geometria → pose → referência
// lenta → coleta → `mapGaze`), treina com a coleta de calibração e mede o erro
// de `mapGaze` nos alvos do teste de precisão.
//
// O que ele NÃO refaz: MediaPipe, L2CS e extração de features (vêm prontos da
// gravação), filtros temporais (One Euro, estabilizador) e a correção por
// dwell (o teste de precisão não tem dwell). Por isso o número comparável é o
// `preFilter` gravado — a entrada do filtro, que é a saída de `mapGaze`.
//
// Uso: só dentro de um teste com timers falsos (`vi.useFakeTimers`), porque a
// coleta de calibração mede o tempo com `performance.now()` e fecha pontos por
// `setTimeout`. Ver `src/replayDeGravacao.test.ts`.

import { vi } from 'vitest';
import * as calibration from '../calibration';
import { EXPERIMENT, type ExperimentConfig } from '../config/experiment';
import { MedidorDeEscalaFacial } from '../escalaMetrica';
import { FEATURE_VECTOR_ID } from '../extractor';
import { NARIZ_PONTA, OLHO_DIREITO, OLHO_ESQUERDO } from '../faceLandmarks';
import { reiniciarCorrecao } from '../interaction/correcaoPorDwell';

export interface CabecalhoDaGravacao {
  formatVersion?: number;
  featureVectorId?: string;
  resolution: { w: number; h: number };
  videoResolution?: { w: number; h: number };
}

export interface QuadroGravado {
  captureTs: number;
  hasFace?: boolean;
  blink?: boolean;
  landmarks?: number[];
  featuresLeft?: number[];
  featuresRight?: number[];
  quality?: Record<string, number | undefined>;
  l2cs?: { valid?: boolean };
  preFilter?: { x: number; y: number };
  target?: { kind?: string; xPx: number; yPx: number; label?: string };
}

export interface Gravacao {
  cabecalho: CabecalhoDaGravacao;
  quadros: QuadroGravado[];
}

/** Lê o texto de um .jsonl do gravador: 1ª linha cabeçalho, depois um quadro por linha. */
export function lerGravacao(texto: string): Gravacao {
  const linhas = texto.split('\n').filter((l) => l.trim().length > 0);
  if (linhas.length < 2) throw new Error('gravação vazia');
  const cabecalho = JSON.parse(linhas[0]) as CabecalhoDaGravacao;
  const quadros = linhas.slice(1).map((l) => JSON.parse(l) as QuadroGravado);
  return { cabecalho, quadros };
}

/** Janela descartada no início de cada alvo do teste (a mesma do protocolo). */
const ACOMODACAO_MS = 600;

export interface OpcoesDoReplay {
  /**
   * Simula a calibração de 13 pontos: a 1ª metade dos quadros úteis de cada
   * alvo de CANTO do teste de precisão entra como ponto extra de calibração, e
   * só a 2ª metade é avaliada. É o protocolo otimista "o canto é ponto de
   * calibração" — o canto volta a ser olhado segundos depois, não minutos.
   */
  cantosNaCalibracao?: boolean;
  /** Flags do EXPERIMENT durante o replay (restauradas no fim). */
  experimento?: Partial<ExperimentConfig>;
  /** Diagonal e distância do posto (padrão: os defaults do app). */
  diagonalPol?: number;
  distanciaCm?: number;
}

export interface ErroPorAlvo {
  rotulo: string;
  alvo: { x: number; y: number };
  quadros: number;
  erroMedioPx: number;
  vies: { x: number; y: number };
}

export interface ResultadoDoReplay {
  porAlvo: ErroPorAlvo[];
  /** Média dos alvos internos (rótulo P*). */
  internoPx: number;
  /** Média dos alvos de canto (rótulo B*). */
  cantosPx: number;
  /** Mediana de |mapGaze − preFilter gravado| nos quadros avaliados. */
  diferencaParaGravadoPx: number | null;
  /** Amostras aceitas no treino. */
  amostrasDeTreino: number;
}

type Ponto3 = { x: number; y: number; z: number };

function comoLandmarks(plano: number[]): Ponto3[] {
  const out: Ponto3[] = [];
  for (let i = 0; i + 2 < plano.length; i += 3) out.push({ x: plano[i], y: plano[i + 1], z: plano[i + 2] });
  return out;
}

function dist3(a: Ponto3, b: Ponto3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** EAR por olho como o extractor calcula (3D, escala isotrópica). */
function earPorOlho(lm: Ponto3[], vw: number, vh: number): { left: number; right: number } {
  const aspecto = vw > 0 && vh > 0 ? vh / vw : 1;
  const e = (o: typeof OLHO_ESQUERDO) =>
    (dist3(lm[o.superior], lm[o.inferior]) / (dist3(lm[o.externo], lm[o.interno]) + 1e-9)) * aspecto;
  return { left: e(OLHO_ESQUERDO), right: e(OLHO_DIREITO) };
}

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Roda a gravação pelo núcleo de calibração e devolve o erro por alvo do teste
 * de precisão. Precisa de `vi.useFakeTimers({ toFake: [..., 'performance'] })`.
 */
export function reproduzirGravacao(g: Gravacao, opcoes: OpcoesDoReplay = {}): ResultadoDoReplay {
  const { cabecalho, quadros } = g;
  if (cabecalho.featureVectorId && cabecalho.featureVectorId !== FEATURE_VECTOR_ID) {
    throw new Error(
      `gravação com vetor ${cabecalho.featureVectorId}, núcleo em ${FEATURE_VECTOR_ID}: ` +
      'as features gravadas não servem para este modelo',
    );
  }
  const W = cabecalho.resolution.w;
  const H = cabecalho.resolution.h;
  const vw = cabecalho.videoResolution?.w ?? W;
  const vh = cabecalho.videoResolution?.h ?? H;

  // Viewport do app = resolução gravada: `mapGaze` converte para px com ela.
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });

  const salvas: Partial<ExperimentConfig> = {};
  const aplicar = { persistirCalibracao: false, ...opcoes.experimento } as Partial<ExperimentConfig>;
  for (const k of Object.keys(aplicar) as (keyof ExperimentConfig)[]) {
    (salvas as Record<string, unknown>)[k] = EXPERIMENT[k];
    (EXPERIMENT as unknown as Record<string, unknown>)[k] = aplicar[k];
  }

  try {
    calibration.clearCalibration();
    reiniciarCorrecao();
    const geometry = {
      screenWidthPx: W,
      screenHeightPx: H,
      screenDiagonalIn: opcoes.diagonalPol ?? calibration.DEFAULT_SCREEN_DIAGONAL_IN,
      viewingDistanceCm: opcoes.distanciaCm ?? calibration.DEFAULT_VIEWING_DISTANCE_CM,
    };

    // ── separa as fases ────────────────────────────────────────────────
    const t0 = quadros[0]?.captureTs ?? 0;
    let ultimoDaCalibracao = -1;
    quadros.forEach((q, i) => { if (q.target?.kind === 'calibration') ultimoDaCalibracao = i; });
    if (ultimoDaCalibracao < 0) throw new Error('gravação sem fase de calibração');

    // Quadros úteis por alvo do teste (≥ 600 ms do início do alvo).
    const inicioDoAlvo = new Map<string, number>();
    const uteisPorAlvo = new Map<string, number[]>();
    quadros.forEach((q, i) => {
      if (q.target?.kind !== 'accuracy' || !q.target.label) return;
      const r = q.target.label;
      if (!inicioDoAlvo.has(r)) inicioDoAlvo.set(r, q.captureTs);
      if (q.captureTs - (inicioDoAlvo.get(r) as number) >= ACOMODACAO_MS) {
        const l = uteisPorAlvo.get(r) ?? [];
        l.push(i);
        uteisPorAlvo.set(r, l);
      }
    });
    const ehCanto = (r: string) => r.startsWith('B');
    const avaliados = new Set<number>();
    const extrasDeCalibracao: { rotulo: string; indices: number[] }[] = [];
    for (const [r, idx] of uteisPorAlvo) {
      if (opcoes.cantosNaCalibracao && ehCanto(r)) {
        const metade = idx.length >> 1;
        // O ponto extra vai do início do alvo (a acomodação a própria coleta
        // descarta) até o fim da 1ª metade útil.
        const inicio = quadros.findIndex((q) => q.target?.kind === 'accuracy' && q.target.label === r);
        const fim = idx[metade - 1];
        const indices: number[] = [];
        for (let i = inicio; i <= fim; i++) indices.push(i);
        extrasDeCalibracao.push({ rotulo: r, indices });
        idx.slice(metade).forEach((i) => avaliados.add(i));
      } else {
        idx.forEach((i) => avaliados.add(i));
      }
    }

    // ── alimentação por quadro, como o engine ─────────────────────────
    const medidor = new MedidorDeEscalaFacial();
    // Relógio do replay. Anda com o tempo gravado mais um deslocamento que
    // cresce quando o replay precisa de tempo que a gravação não tem (fechar
    // um ponto pelo timeout, encaixar os cantos extras).
    let relogio = 0;
    let deslocamento = 0;
    const avancarPara = (t: number) => {
      if (t > relogio) {
        vi.advanceTimersByTime(t - relogio);
        relogio = t;
      }
    };
    const pular = (ms: number) => {
      vi.advanceTimersByTime(ms);
      relogio += ms;
      deslocamento += ms;
    };
    const alimentar = (q: QuadroGravado, tMs: number): { fl: number[]; fr: number[]; pesos: { left: number; right: number } } | null => {
      if (!q.hasFace || !q.landmarks || q.landmarks.length < 478 * 3) {
        calibration.alimentarReferenciaLenta(tMs, false);
        return null;
      }
      const lm = comoLandmarks(q.landmarks);
      const e = lm[OLHO_ESQUERDO.externo];
      const d = lm[OLHO_DIREITO.externo];
      const iodPx = Math.hypot((e.x - d.x) * vw, (e.y - d.y) * vh);
      const centro = { x: lm[NARIZ_PONTA].x, y: lm[NARIZ_PONTA].y };
      const qual = q.quality ?? {};
      const GRAUS = 180 / Math.PI;
      medidor.adicionar({
        landmarks: lm,
        cantalPx: iodPx,
        videoWidth: vw,
        videoHeight: vh,
        yawDeg: typeof qual.yaw === 'number' ? qual.yaw * GRAUS : undefined,
        pitchDeg: typeof qual.pitch === 'number' ? qual.pitch * GRAUS : undefined,
      });
      calibration.setCurrentFrameGeometry(iodPx, vw, vh, centro, medidor.cantalOuPadraoCm());
      const fl = q.featuresLeft;
      const fr = q.featuresRight;
      if (q.blink || !fl || !fr || fl.length === 0) return null;
      const pose = typeof qual.yaw === 'number' && typeof qual.pitch === 'number' && typeof qual.roll === 'number'
        ? { yaw: qual.yaw, pitch: qual.pitch, roll: qual.roll }
        : null;
      calibration.setCurrentFramePose(pose);
      calibration.alimentarReferenciaLenta(tMs, q.l2cs?.valid !== false);
      calibration.feedRawData(fl, fr, { ...qual, faceCenterX: centro.x, faceCenterY: centro.y, iodPx });
      const ear = earPorOlho(lm, vw, vh);
      const EAR_ABERTO = 0.25;
      return {
        fl, fr,
        pesos: {
          left: Math.max(0, Math.min(1, ear.left / EAR_ABERTO)),
          right: Math.max(0, Math.min(1, ear.right / EAR_ABERTO)),
        },
      };
    };

    // ── fase 1: calibração ─────────────────────────────────────────────
    if (!calibration.startCalibrationMode({ geometry })) throw new Error('calibração recusada');
    let alvoAtual: string | null = null;
    const fecharPontoPendente = () => {
      // Coleta ainda aberta quando a gravação troca de alvo: o timeout duro
      // fecha o ponto — é o que aconteceria sem quadros novos.
      if (calibration.getCurrentTargetPx() !== null) pular(8000);
    };
    const iniciarPonto = (x: number, y: number) => {
      fecharPontoPendente();
      calibration.startCollectingPoint(x, y, () => undefined);
    };

    for (let i = 0; i <= ultimoDaCalibracao; i++) {
      const q = quadros[i];
      avancarPara(q.captureTs - t0 + deslocamento);
      if (q.target?.kind === 'calibration') {
        const chave = `${q.target.xPx.toFixed(1)},${q.target.yPx.toFixed(1)}`;
        if (chave !== alvoAtual) {
          iniciarPonto(q.target.xPx / W, q.target.yPx / H);
          alvoAtual = chave;
        }
      }
      alimentar(q, relogio);
    }
    for (const extra of extrasDeCalibracao) {
      const primeiro = quadros[extra.indices[0]];
      const alvo = primeiro.target as NonNullable<QuadroGravado['target']>;
      pular(500);
      iniciarPonto(alvo.xPx / W, alvo.yPx / H);
      // Depois de `iniciarPonto`: fechar o ponto anterior pode ter andado o relógio.
      const base = relogio;
      alvoAtual = extra.rotulo;
      for (const i of extra.indices) {
        avancarPara(base + (quadros[i].captureTs - primeiro.captureTs));
        alimentar(quadros[i], relogio);
      }
    }
    fecharPontoPendente();
    let resultado: { ok: boolean; reason?: string } | null = null;
    calibration.completeCalibration((o) => { resultado = o as { ok: boolean; reason?: string }; });
    const r = resultado as { ok: boolean; reason?: string } | null;
    if (!r || r.ok === false) throw new Error(`treino falhou: ${r?.reason ?? 'sem resultado'}`);
    const amostrasDeTreino = calibration.getSampleCount();

    // ── fase 2: uso (tudo depois da calibração, em ordem) ─────────────
    // A fase de uso continua de onde o relógio parou, com os intervalos gravados.
    const offset = relogio - (quadros[ultimoDaCalibracao].captureTs - t0);
    const erros = new Map<string, { dx: number[]; dy: number[]; alvo: { x: number; y: number } }>();
    const diferencas: number[] = [];
    for (let i = ultimoDaCalibracao + 1; i < quadros.length; i++) {
      const q = quadros[i];
      avancarPara(q.captureTs - t0 + offset);
      const f = alimentar(q, relogio);
      if (!f) continue;
      const p = calibration.mapGaze(f.fl, f.fr, f.pesos);
      if (!p || !avaliados.has(i) || !q.target?.label) continue;
      const rotulo = q.target.label;
      const e = erros.get(rotulo) ?? { dx: [], dy: [], alvo: { x: q.target.xPx, y: q.target.yPx } };
      e.dx.push(p.x - q.target.xPx);
      e.dy.push(p.y - q.target.yPx);
      erros.set(rotulo, e);
      if (q.preFilter) diferencas.push(Math.hypot(p.x - q.preFilter.x, p.y - q.preFilter.y));
    }

    const porAlvo: ErroPorAlvo[] = [...erros.entries()]
      .map(([rotulo, e]) => ({
        rotulo,
        alvo: e.alvo,
        quadros: e.dx.length,
        erroMedioPx: e.dx.reduce((s, dx, k) => s + Math.hypot(dx, e.dy[k]), 0) / e.dx.length,
        vies: {
          x: e.dx.reduce((s, v) => s + v, 0) / e.dx.length,
          y: e.dy.reduce((s, v) => s + v, 0) / e.dy.length,
        },
      }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
    const media = (l: ErroPorAlvo[]) => (l.length ? l.reduce((s, a) => s + a.erroMedioPx, 0) / l.length : NaN);
    return {
      porAlvo,
      internoPx: media(porAlvo.filter((a) => a.rotulo.startsWith('P'))),
      cantosPx: media(porAlvo.filter((a) => a.rotulo.startsWith('B'))),
      diferencaParaGravadoPx: mediana(diferencas),
      amostrasDeTreino,
    };
  } finally {
    for (const k of Object.keys(salvas) as (keyof ExperimentConfig)[]) {
      (EXPERIMENT as unknown as Record<string, unknown>)[k] = salvas[k];
    }
  }
}
