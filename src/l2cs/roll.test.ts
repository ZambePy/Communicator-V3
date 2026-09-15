import { describe, expect, it } from 'vitest';
import { computeSquareBBox, matrizDoRecorte } from './crop';
import { aplicarRollNoOlhar, desfazerRollNoOlhar } from './roll';

const deg = (d: number) => (d * Math.PI) / 180;

describe('desfazerRollNoOlhar', () => {
  it('roll zero, nulo ou não finito devolve a entrada intacta', () => {
    const o = { yaw: 0.2, pitch: -0.1 };
    expect(desfazerRollNoOlhar(o, 0, false)).toBe(o);
    expect(desfazerRollNoOlhar(o, null, true)).toBe(o);
    expect(desfazerRollNoOlhar(o, NaN, false)).toBe(o);
  });

  it('fecha o ciclo com aplicarRollNoOlhar, nos dois espelhamentos', () => {
    let semente = 7;
    const r = () => {
      semente = (semente * 1664525 + 1013904223) >>> 0;
      return semente / 0xffffffff - 0.5;
    };
    for (let i = 0; i < 200; i++) {
      const olhar = { yaw: r() * deg(70), pitch: r() * deg(50) };
      const roll = r() * deg(60);
      for (const espelhado of [false, true]) {
        const noRecorte = aplicarRollNoOlhar(olhar, roll, espelhado);
        const devolta = desfazerRollNoOlhar(noRecorte, roll, espelhado);
        expect(devolta.yaw).toBeCloseTo(olhar.yaw, 9);
        expect(devolta.pitch).toBeCloseTo(olhar.pitch, 9);
      }
    }
  });

  it('é consistente com a matriz do recorte: a direção que o recorte gira, isto desgira', () => {
    // A verdade de referência é `matrizDoRecorte`, não uma segunda dedução.
    // Uma direção no vídeo vira uma direção no canvas pela parte linear da
    // matriz; a rede devolve essa direção; desfazer tem de voltar à do vídeo.
    const landmarks = [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }];
    const bbox = computeSquareBBox(landmarks, 1280, 720);
    for (const espelhado of [false, true]) {
      for (const roll of [deg(-25), deg(12), deg(40)]) {
        const m = matrizDoRecorte(bbox, 448, espelhado, roll);
        // Parte linear normalizada (tira a escala k = 448/side).
        const k = 448 / bbox.side;
        const lin = (x: number, y: number) => ({ x: (m.a * x + m.c * y) / k, y: (m.b * x + m.d * y) / k });

        // Olhar no vídeo, como o pipeline SEM normalização de roll o veria
        // (já desespelhado — o L2CS sempre recebe imagem não espelhada).
        const noVideo = { yaw: deg(20), pitch: deg(-8) };
        const gx = Math.cos(noVideo.pitch) * Math.sin(noVideo.yaw);
        const gy = -Math.sin(noVideo.pitch);
        // No vídeo espelhado a componente x do olhar aparece invertida.
        const fonte = espelhado ? { x: -gx, y: gy } : { x: gx, y: gy };
        const noCanvas = lin(fonte.x, fonte.y);
        const gz = Math.cos(noVideo.pitch) * Math.cos(noVideo.yaw);
        const saidaDaRede = {
          yaw: Math.atan2(noCanvas.x, gz),
          pitch: Math.asin(-noCanvas.y),
        };

        const desfeito = desfazerRollNoOlhar(saidaDaRede, roll, espelhado);
        expect(desfeito.yaw, `espelhado=${espelhado} roll=${roll}`).toBeCloseTo(noVideo.yaw, 9);
        expect(desfeito.pitch, `espelhado=${espelhado} roll=${roll}`).toBeCloseTo(noVideo.pitch, 9);
      }
    }
  });

  it('cabeça deitada 90° para a direita: "olhar para a direita" do recorte é olhar para baixo no vídeo', () => {
    // Sem espelho, roll = +90° (linha dos olhos apontando para baixo na
    // imagem). A rede vê o rosto nivelado e diz "20° para a direita"; no vídeo
    // isso é 20° para baixo.
    const d = desfazerRollNoOlhar({ yaw: deg(20), pitch: 0 }, deg(90), false);
    expect(d.yaw).toBeCloseTo(0, 9);
    expect(d.pitch).toBeCloseTo(deg(-20), 9);
  });

  it('não produz NaN em pitch de ±90°', () => {
    const d = desfazerRollNoOlhar({ yaw: 0, pitch: deg(90) }, deg(30), false);
    expect(Number.isFinite(d.yaw)).toBe(true);
    expect(Number.isFinite(d.pitch)).toBe(true);
  });
});
