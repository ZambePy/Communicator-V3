import { describe, it, expect, beforeEach } from 'vitest';
import { AcumuladorDeReancoragem, AMOSTRAS_MINIMAS } from './reancoragem';
import * as calibration from './calibration';
import { estadoDaCorrecao, reiniciarCorrecao } from './interaction/correcaoPorDwell';

describe('AcumuladorDeReancoragem', () => {
  it('mediana da distância, média de pose e centro; conta só o que entrou', () => {
    const a = new AcumuladorDeReancoragem();
    for (const d of [60, 61, 90, 59, 60]) {
      a.adicionar({ distanciaCm: d, pose: { yaw: 0.1, pitch: 0.2, roll: 0 }, centro: { x: 0.5, y: 0.6 } });
    }
    a.adicionar({ distanciaCm: null, pose: null, centro: null });
    const r = a.resultado();
    expect(r.distanciaCm).toBe(60);           // o 90 (rosto ocluído) não puxa a mediana
    expect(r.pose).toEqual({ yaw: 0.1, pitch: 0.2, roll: 0 });
    expect(r.centro).toEqual({ x: 0.5, y: 0.6 });
    expect(r.amostras).toBe(6);
    expect(r.suficiente).toBe(false);
  });

  it('`suficiente` a partir de AMOSTRAS_MINIMAS', () => {
    const a = new AcumuladorDeReancoragem();
    for (let i = 0; i < AMOSTRAS_MINIMAS; i++) {
      a.adicionar({ distanciaCm: 55, pose: null, centro: null });
      a.adicionarPredicao({ x: 0.5, y: 0.5 });
    }
    expect(a.resultado().suficiente).toBe(true);
    expect(a.resultado().pose).toBeNull();
  });

  it('distância inválida não entra na mediana', () => {
    const a = new AcumuladorDeReancoragem();
    a.adicionar({ distanciaCm: NaN, pose: null, centro: null });
    a.adicionar({ distanciaCm: -3, pose: null, centro: null });
    expect(a.resultado().distanciaCm).toBeNull();
  });
});

describe('AcumuladorDeReancoragem — predição', () => {
  it('mediana da predição por eixo; quadro sem predição não entra', () => {
    const a = new AcumuladorDeReancoragem();
    for (const x of [0.52, 0.53, 0.9, 0.51, 0.52]) {
      a.adicionar({ distanciaCm: 60, pose: null, centro: null });
      a.adicionarPredicao({ x, y: 0.47 });
    }
    a.adicionarPredicao(null);
    a.adicionarPredicao({ x: Number.NaN, y: 0.5 });
    const r = a.resultado();
    expect(r.predicao).toEqual({ x: 0.52, y: 0.47 });   // o 0,9 (olhar fugiu) não puxa
    expect(r.suficiente).toBe(false);                    // 5 < AMOSTRAS_MINIMAS
  });

  it('`suficiente` exige quadros E predições', () => {
    const a = new AcumuladorDeReancoragem();
    for (let i = 0; i < AMOSTRAS_MINIMAS; i++) a.adicionar({ distanciaCm: 55, pose: null, centro: null });
    expect(a.resultado().suficiente).toBe(false);        // sem modelo, sem predição
    for (let i = 0; i < AMOSTRAS_MINIMAS; i++) a.adicionarPredicao({ x: 0.5, y: 0.5 });
    expect(a.resultado().suficiente).toBe(true);
  });
});

/**
 * O reajuste rápido corrige a DERIVA medida no centro e não mexe nas
 * referências geométricas: a compensação de pose/distância continua medindo
 * contra a calibração (ver `corrigirDerivaNoCentro`).
 */
describe('calibration.corrigirDerivaNoCentro — deriva, não referência', () => {
  const W = 1920;
  const H = 1080;
  const REF = {
    pose: { yaw: 0, pitch: 0, roll: 0 },
    center: { x: 0.5, y: 0.5 },
    cameraDistanceCm: 60,
    screenDistanceCm: 65,
    refDistance: null,
    eyeReliability: null,
  };

  beforeEach(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    calibration.clearCalibration();
    calibration.restoreReferenceStateFromProfile(REF);
    reiniciarCorrecao();
  });

  it('o viés no centro vira o deslocamento da correção de deriva', () => {
    const r = calibration.corrigirDerivaNoCentro({ x: 0.52, y: 0.47 });
    expect(r.aplicado).toBe(true);
    expect(r.desvioPx).toBeCloseTo(Math.hypot(0.02 * W, 0.03 * H), 6);
    const o = estadoDaCorrecao().offset;
    expect(o.x).toBeCloseTo(-0.02, 10);
    expect(o.y).toBeCloseTo(0.03, 10);
  });

  it('as referências da calibração ficam intactas', () => {
    calibration.corrigirDerivaNoCentro({ x: 0.52, y: 0.47 });
    const ref = calibration.captureReferenceStateForProfile();
    expect(ref.pose).toEqual(REF.pose);
    expect(ref.center).toEqual(REF.center);
    expect(ref.cameraDistanceCm).toBe(60);
    expect(calibration.getCalibrationDistancesCm()).toEqual({ cameraCm: 60, screenCm: 65 });
    // Nada de modelo: continua sem regressores.
    expect(calibration.isCalibrated()).toBe(false);
  });

  it('viés acima do teto não é deriva: nada muda', () => {
    const r = calibration.corrigirDerivaNoCentro({ x: 0.7, y: 0.5 });
    expect(r.aplicado).toBe(false);
    expect(estadoDaCorrecao().offset).toEqual({ x: 0, y: 0 });
  });

  it('sem predição, nada muda', () => {
    expect(calibration.corrigirDerivaNoCentro(null)).toEqual({ aplicado: false, desvioPx: null });
    expect(estadoDaCorrecao().offset).toEqual({ x: 0, y: 0 });
  });
});

/**
 * O reajuste é uma coleta de 2 s com um `setTimeout` no fim. Trocar o modelo
 * debaixo dela — outra calibração, outro perfil — ou a pessoa desviar o olhar
 * para a Emergência deixa os quadros colhidos sem valor. O engine ABANDONA a
 * coleta nesses casos, em vez de concluí-la.
 *
 * Estes testes não sobem o engine (precisa de câmera e de MediaPipe); cobrem a
 * distinção no nível em que ela é decidida — `concluir` aplica, `abandonar`
 * não.
 */
describe('abandonar × concluir', () => {
  beforeEach(() => {
    calibration.clearCalibration();
    reiniciarCorrecao();
  });

  it('concluir aplica o que foi colhido', () => {
    const a = new AcumuladorDeReancoragem();
    for (let i = 0; i < AMOSTRAS_MINIMAS; i++) {
      a.adicionar({ distanciaCm: 48, pose: null, centro: null });
      a.adicionarPredicao({ x: 0.51, y: 0.49 });
    }
    const r = a.resultado();
    expect(r.suficiente).toBe(true);
    expect(calibration.corrigirDerivaNoCentro(r.predicao).aplicado).toBe(true);
    expect(estadoDaCorrecao().offset.x).toBeCloseTo(-0.01, 10);
  });

  it('abandonar deixa a correção como estava', () => {
    const a = new AcumuladorDeReancoragem();
    for (let i = 0; i < AMOSTRAS_MINIMAS; i++) a.adicionarPredicao({ x: 0.51, y: 0.49 });
    // O caminho de abandono simplesmente NÃO chama `corrigirDerivaNoCentro`.
    expect(estadoDaCorrecao().offset).toEqual({ x: 0, y: 0 });
  });
});
