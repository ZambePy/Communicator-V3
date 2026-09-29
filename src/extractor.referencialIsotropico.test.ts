import { describe, expect, it } from 'vitest';
import { extractCompactFeatures, type Point3D } from './extractor';
import { EXPERIMENT } from './config/experiment';
import { OLHO_ESQUERDO, OLHO_DIREITO, IRIS_ESQUERDA, IRIS_DIREITA, TESTA_TOPO } from './faceLandmarks';

// M2 (docs/PESQUISA.md §1.8, F3): o referencial da cabeça montado nas
// coordenadas normalizadas do MediaPipe (x/W, y/H) não é uma rotação rígida
// numa imagem 16:9. Com a cabeça inclinada (roll), parte do olhar vertical
// vaza para o offset horizontal da íris. Em pixels, não vaza.

const W = 1920;
const H = 1080;

/**
 * Rosto sintético desenhado em PIXELS, com o olhar para baixo (íris 8 px
 * abaixo do meio do olho, no referencial da cabeça), inclinado `rollDeg` e
 * convertido para o espaço normalizado do MediaPipe.
 */
function rostoInclinado(rollDeg: number): Point3D[] {
  const cx = 960;
  const cy = 540;
  const a = (rollDeg * Math.PI) / 180;
  const girar = (x: number, y: number) => ({
    x: cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
    y: cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a),
  });
  const p: Point3D[] = Array.from({ length: 478 }, () => ({ x: cx / W, y: cy / H, z: 0 }));
  const por = (i: number, x: number, y: number) => {
    const q = girar(x, y);
    p[i] = { x: q.x / W, y: q.y / H, z: 0 };
  };
  const olho = (
    o: { interno: number; externo: number; superior: number; inferior: number },
    iris: { centro: number; direita: number; superior: number; esquerda: number; inferior: number },
    ex: number, lado: -1 | 1,
  ) => {
    por(o.externo, ex + lado * 30, cy);
    por(o.interno, ex - lado * 30, cy);
    por(o.superior, ex, cy - 10);
    por(o.inferior, ex, cy + 10);
    const iy = cy + 8;
    por(iris.centro, ex, iy);
    por(iris.direita, ex + 10, iy);
    por(iris.esquerda, ex - 10, iy);
    por(iris.superior, ex, iy - 10);
    por(iris.inferior, ex, iy + 10);
  };
  olho(OLHO_ESQUERDO, IRIS_ESQUERDA, cx - 60, -1);
  olho(OLHO_DIREITO, IRIS_DIREITA, cx + 60, 1);
  por(TESTA_TOPO, cx, cy - 180);
  return p;
}

function offsets(rollDeg: number, isotropico: boolean) {
  const antes = EXPERIMENT.referencialIsotropico;
  EXPERIMENT.referencialIsotropico = isotropico;
  try {
    const r = extractCompactFeatures(rostoInclinado(rollDeg), undefined, { yaw: 0, pitch: 0, valid: true }, undefined, W, H);
    return { x: r.featuresLeft[0], y: r.featuresLeft[1] };
  } finally {
    EXPERIMENT.referencialIsotropico = antes;
  }
}

describe('referencial da cabeça isotrópico (M2)', () => {
  it('com a cabeça inclinada, o olhar vertical não vaza para o offset horizontal', () => {
    const iso = offsets(5, true);
    expect(Math.abs(iso.x)).toBeLessThan(1e-9);
    // 8 px de íris sobre 180 px entre os cantos externos; o y do referencial
    // aponta para o topo da cabeça, então olhar para baixo é negativo.
    expect(iso.y).toBeCloseTo(-8 / 180, 9);
  });

  it('no referencial anisotrópico de antes, vaza', () => {
    const anis = offsets(5, false);
    expect(Math.abs(anis.x)).toBeGreaterThan(1e-3);
  });

  it('sem inclinação os dois dão a mesma direção', () => {
    const iso = offsets(0, true);
    const anis = offsets(0, false);
    expect(Math.abs(iso.x)).toBeLessThan(1e-9);
    expect(Math.abs(anis.x)).toBeLessThan(1e-9);
    expect(Math.sign(iso.y)).toBe(Math.sign(anis.y));
  });
});
