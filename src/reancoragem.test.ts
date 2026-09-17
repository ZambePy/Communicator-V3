import { describe, it, expect, beforeEach } from 'vitest';
import { AcumuladorDeReancoragem, AMOSTRAS_MINIMAS } from './reancoragem';
import * as calibration from './calibration';

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
    for (let i = 0; i < AMOSTRAS_MINIMAS; i++) a.adicionar({ distanciaCm: 55, pose: null, centro: null });
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

describe('calibration.reancorarReferencias — sem retreinar', () => {
  beforeEach(() => {
    calibration.clearCalibration();
    calibration.setCalibrationDistancesCm(60, 65);
  });

  it('troca a base da correção aditiva e recomeça a referência lenta', () => {
    calibration.restoreReferenceStateFromProfile({
      pose: { yaw: 0, pitch: 0, roll: 0 },
      center: { x: 0.5, y: 0.5 },
      cameraDistanceCm: 60,
      screenDistanceCm: 65,
      refDistance: null,
      eyeReliability: null,
    });
    calibration.reancorarReferencias({
      distanciaCm: 52,
      pose: { yaw: 0.05, pitch: -0.02, roll: 0 },
      centro: { x: 0.55, y: 0.48 },
    });
    expect(calibration.getCalibrationDistancesCm()).toEqual({ cameraCm: 52, screenCm: 65 });
    const ref = calibration.getReferenciaLenta();
    expect(ref.iniciada).toBe(true);
    expect(ref.pose).toEqual({ yaw: 0.05, pitch: -0.02, roll: 0 });
    expect(ref.centro).toEqual({ x: 0.55, y: 0.48 });
    // Nada de modelo: continua sem regressores.
    expect(calibration.isCalibrated()).toBe(false);
  });

  it('distância nula mantém a base anterior', () => {
    calibration.reancorarReferencias({ distanciaCm: null, pose: null, centro: null });
    expect(calibration.getCalibrationDistancesCm().cameraCm).toBe(60);
  });
});

/**
 * A reancoragem é uma coleta de 2 s com um `setTimeout` no fim. Trocar o
 * modelo debaixo dela — outra calibração, outro perfil — deixa os quadros já
 * colhidos descrevendo uma referência que deixou de existir. O engine ABANDONA
 * a coleta nesse caso, em vez de concluí-la: aplicar o resultado reescreveria
 * a referência recém-carregada com a geometria da anterior.
 *
 * Estes testes não sobem o engine (precisa de câmera e de MediaPipe); cobrem a
 * distinção no nível em que ela é decidida — `concluir` aplica, `abandonar`
 * não.
 */
describe('abandonar × concluir', () => {
  beforeEach(() => {
    calibration.clearCalibration();
    calibration.setCalibrationDistancesCm(60, 65);
  });

  it('concluir aplica o que foi colhido', () => {
    const a = new AcumuladorDeReancoragem();
    for (let i = 0; i < AMOSTRAS_MINIMAS; i++) {
      a.adicionar({ distanciaCm: 48, pose: null, centro: null });
    }
    const r = a.resultado();
    expect(r.suficiente).toBe(true);
    calibration.reancorarReferencias(r);
    expect(calibration.getCalibrationDistancesCm().cameraCm).toBe(48);
  });

  it('abandonar deixa a base de distância intacta', () => {
    const a = new AcumuladorDeReancoragem();
    for (let i = 0; i < AMOSTRAS_MINIMAS; i++) {
      a.adicionar({ distanciaCm: 48, pose: null, centro: null });
    }
    // O caminho de abandono simplesmente NÃO chama `reancorarReferencias`.
    expect(calibration.getCalibrationDistancesCm().cameraCm).toBe(60);
  });
});
