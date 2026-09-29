import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureReferenceStateForProfile,
  clearCalibration,
  completeCalibration,
  feedRawData,
  getCalibrationFitDiagnostics,
  getRuidoDaCalibracao,
  getTermosDaUltimaPredicao,
  mapGaze,
  restoreReferenceStateFromProfile,
  setCurrentFrameGeometry,
  setCurrentFrameOlhos,
  setCurrentFramePose,
  setPosicaoDaCamera,
  startCalibrationMode,
  startCollectingPoint,
} from './calibration';
import { EXPERIMENT } from './config/experiment';
import { RidgeRegressor } from './ridge';

/**
 * A fiação do V3 na calibração: fusão por covariância (M10), ruído medido
 * para o estimador de fixação (M9), estado persistido no perfil e a saída
 * 6DoF (M12) idêntica à clássica na postura de referência.
 *
 * λ fixo pelo mesmo motivo de `calibration.eyefusion.test.ts`: nada aqui
 * observa a escolha de λ, e a validação cruzada custaria minutos.
 */

const POSE = { yaw: 0.1, pitch: -0.05, roll: 0.01 };
const q = () => ({
  ...POSE,
  irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.24, contrastEstimate: 0.09, blurEstimate: 0,
  centroDosOlhosX: 0.5, centroDosOlhosY: 0.45,
});
const ALVOS = [[0.2, 0.2], [0.5, 0.2], [0.8, 0.2], [0.2, 0.5], [0.5, 0.5], [0.8, 0.5], [0.2, 0.8], [0.5, 0.8], [0.8, 0.8]];

let relogio = 0;
let flagsSalvas: Partial<typeof EXPERIMENT> = {};
let lambdaSalvo: number | null = null;

function calibrar(ruidoDireito: number) {
  let semente = 11;
  const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 - 0.5; };
  startCalibrationMode();
  for (const [x, y] of ALVOS) {
    startCollectingPoint(x, y, () => {});
    for (let i = 0; i < 40; i++) {
      const esq = Array.from({ length: 4 }, (_, d) =>
        Math.sin(d * 1.7 + 0.3) * x + Math.cos(d * 2.3 + 1.1) * y + rnd() * 0.004);
      const dir = Array.from({ length: 4 }, (_, d) =>
        Math.sin(d * 1.7 + 0.3) * x + Math.cos(d * 2.3 + 1.1) * y + rnd() * ruidoDireito);
      relogio += 80;
      feedRawData(esq, dir, q());
    }
  }
  let desfecho: unknown = null;
  completeCalibration((o) => { desfecho = o; });
  return desfecho as { ok: boolean };
}

function vetor(x: number, y: number) {
  return Array.from({ length: 4 }, (_, d) => Math.sin(d * 1.7 + 0.3) * x + Math.cos(d * 2.3 + 1.1) * y);
}

const persistirAntes = EXPERIMENT.persistirCalibracao;
beforeAll(() => {
  // jsdom não tem layout: sem isto o viewport mede 0 × 0 e toda predição sai 0.
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 1920 });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 1080 });
  EXPERIMENT.persistirCalibracao = false;
});
afterAll(() => {
  delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
  delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
  EXPERIMENT.persistirCalibracao = persistirAntes;
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  clearCalibration();
  relogio = 0;
  lambdaSalvo = RidgeRegressor.lambdaOverride;
  RidgeRegressor.lambdaOverride = 1e-3;
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
  flagsSalvas = {
    fusaoPorCovariancia: EXPERIMENT.fusaoPorCovariancia,
    estimadorDeFixacao: EXPERIMENT.estimadorDeFixacao,
    correcaoPorDwellKalman: EXPERIMENT.correcaoPorDwellKalman,
    saida6DoF: EXPERIMENT.saida6DoF,
  };
  // Geometria de rosto estável: 1280×720, 137 px entre os cantos (~60 cm).
  setCurrentFrameGeometry(137, 1280, 720, { x: 0.5, y: 0.55 }, 9);
  setCurrentFrameOlhos({ x: 640, y: 324 });
  setCurrentFramePose({ ...POSE });
});

afterEach(() => {
  Object.assign(EXPERIMENT, flagsSalvas);
  RidgeRegressor.lambdaOverride = lambdaSalvo;
  setPosicaoDaCamera(null);
  vi.restoreAllMocks();
  clearCalibration();
});

describe('fusão por covariância (M10)', { timeout: 20_000 }, () => {
  it('medida no LOO: o olho menos ruidoso pesa mais, e o mapGaze usa esses pesos', () => {
    EXPERIMENT.fusaoPorCovariancia = true;
    expect(calibrar(0.06).ok).toBe(true);
    const f = getCalibrationFitDiagnostics()!.fusao;
    expect(f).not.toBeNull();
    expect(f!.pesoEsquerdo.x).toBeGreaterThan(0.5);
    expect(f!.pesoEsquerdo.y).toBeGreaterThan(0.5);
    expect(mapGaze(vetor(0.5, 0.5), vetor(0.5, 0.5))).not.toBeNull();
    const t = getTermosDaUltimaPredicao()!;
    // O fundido é a combinação com o peso medido, eixo a eixo.
    const w = f!.pesoEsquerdo.x;
    expect(t.fundido.x).toBeCloseTo(w * t.esquerdo.x + (1 - w) * t.direito.x, 9);
    expect(captureReferenceStateForProfile().fusao).toBeTruthy();
  });

  it('com a flag desligada não há fusão medida, e o perfil fica sem o campo', () => {
    EXPERIMENT.fusaoPorCovariancia = false;
    expect(calibrar(0.06).ok).toBe(true);
    expect(getCalibrationFitDiagnostics()!.fusao).toBeNull();
    expect('fusao' in captureReferenceStateForProfile()).toBe(false);
  });
});

describe('ruído da calibração (M9)', { timeout: 20_000 }, () => {
  it('medido quando o estimador de fixação está ligado', () => {
    EXPERIMENT.estimadorDeFixacao = true;
    expect(calibrar(0.004).ok).toBe(true);
    const r = getRuidoDaCalibracao();
    expect(r).not.toBeNull();
    expect(r!.alvos.length).toBeGreaterThanOrEqual(5);
    expect(r!.rho1).toBeGreaterThanOrEqual(0);
    expect(captureReferenceStateForProfile().ruido).toBeTruthy();
  });

  it('sem nenhum consumidor, não é medido', () => {
    EXPERIMENT.estimadorDeFixacao = false;
    EXPERIMENT.correcaoPorDwellKalman = false;
    expect(calibrar(0.004).ok).toBe(true);
    expect(getRuidoDaCalibracao()).toBeNull();
  });

  it('volta do perfil validado; lixo vira null', () => {
    EXPERIMENT.estimadorDeFixacao = true;
    expect(calibrar(0.004).ok).toBe(true);
    const ref = captureReferenceStateForProfile();
    restoreReferenceStateFromProfile(null);
    expect(getRuidoDaCalibracao()).toBeNull();
    restoreReferenceStateFromProfile(ref);
    expect(getRuidoDaCalibracao()).toEqual(ref.ruido);
    restoreReferenceStateFromProfile({ ...ref, ruido: { rho1: 'x', alvos: [] } as never });
    expect(getRuidoDaCalibracao()).toBeNull();
  });
});

describe('saída 6DoF (M12)', { timeout: 30_000 }, () => {
  function predizer() {
    const p = mapGaze(vetor(0.3, 0.7), vetor(0.3, 0.7));
    expect(p).not.toBeNull();
    return p!;
  }

  it('idêntica ao caminho clássico na postura da calibração; diferente fora dela', () => {
    EXPERIMENT.saida6DoF = false;
    expect(calibrar(0.004).ok).toBe(true);
    const classica = predizer();
    setCurrentFramePose({ ...POSE, pitch: POSE.pitch + 0.08 });
    const classicaFora = predizer();
    setCurrentFramePose({ ...POSE });

    clearCalibration();
    relogio = 0;
    EXPERIMENT.saida6DoF = true;
    setPosicaoDaCamera('topo');
    expect(calibrar(0.004).ok).toBe(true);
    expect(captureReferenceStateForProfile().olhoCm).toBeTruthy();
    const seisDoF = predizer();
    expect(seisDoF.x).toBeCloseTo(classica.x, 6);
    expect(seisDoF.y).toBeCloseTo(classica.y, 6);

    setCurrentFramePose({ ...POSE, pitch: POSE.pitch + 0.08 });
    const seisDoFFora = predizer();
    // Cabeça 4,6° para baixo: os dois corrigem para baixo, mas não igual.
    expect(seisDoFFora.y).toBeGreaterThan(seisDoF.y);
    expect(Math.abs(seisDoFFora.y - classicaFora.y)).toBeGreaterThan(0.5);
  });

  it('sem a pergunta da câmera respondida, fica no caminho clássico', () => {
    EXPERIMENT.saida6DoF = true;
    setPosicaoDaCamera(null);
    expect(calibrar(0.004).ok).toBe(true);
    const a = predizer();
    EXPERIMENT.saida6DoF = false;
    const b = predizer();
    expect(a).toEqual(b);
  });
});
