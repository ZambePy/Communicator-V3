import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MatrizDoRecorte, Point2D } from '../l2cs/crop';
import {
  ALTURA_DO_OLHO,
  FATOR_DO_OLHO,
  LARGURA_DO_OLHO,
  anguloDaLinhaDosCantos,
  matrizDoRecorteDoOlho,
  precisaEspelhar,
  preprocessarOlho,
  type LadoDoOlho,
} from './recorte';

const CAMINHO = resolve(__dirname, '../../fixtures/recorte-olho.json');

function aplicar(m: MatrizDoRecorte, p: Point2D): Point2D {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

describe('geometria do recorte do olho', () => {
  it('o centro dos cantos cai no centro do canvas', () => {
    const r = matrizDoRecorteDoOlho({
      cantoInterno: { x: 500, y: 300 }, cantoExterno: { x: 560, y: 310 }, olho: 'direito', isMirrored: false,
    });
    const c = aplicar(r.matriz, { x: 530, y: 305 });
    expect(c.x).toBeCloseTo(LARGURA_DO_OLHO / 2, 9);
    expect(c.y).toBeCloseTo(ALTURA_DO_OLHO / 2, 9);
  });

  it('a linha dos cantos sai horizontal e ocupa 1/FATOR da largura, nos dois olhos e espelhamentos', () => {
    const olhos: LadoDoOlho[] = ['esquerdo', 'direito'];
    for (const olho of olhos) {
      for (const isMirrored of [false, true]) {
        // Olho direito da pessoa numa imagem não espelhada: externo à ESQUERDA.
        const paraEsquerda = (olho === 'direito') !== isMirrored;
        const interno = { x: 640, y: 360 };
        const externo = { x: 640 + (paraEsquerda ? -50 : 50), y: 360 + 12 };
        const r = matrizDoRecorteDoOlho({ cantoInterno: interno, cantoExterno: externo, olho, isMirrored });
        const a = aplicar(r.matriz, interno);
        const b = aplicar(r.matriz, externo);
        expect(a.y, `${olho} espelhado=${isMirrored}`).toBeCloseTo(b.y, 9);
        expect(Math.abs(b.x - a.x)).toBeCloseTo(LARGURA_DO_OLHO / FATOR_DO_OLHO, 9);
        // Canônico: o canto EXTERNO fica à esquerda do canvas, sempre.
        expect(b.x, `${olho} espelhado=${isMirrored}`).toBeLessThan(a.x);
      }
    }
  });

  it('o flip é o ou-exclusivo entre lado e espelhamento', () => {
    expect(precisaEspelhar('direito', false)).toBe(false);
    expect(precisaEspelhar('esquerdo', false)).toBe(true);
    expect(precisaEspelhar('direito', true)).toBe(true);
    expect(precisaEspelhar('esquerdo', true)).toBe(false);
  });

  it('o ângulo da linha é dobrado para (−90°, 90°]', () => {
    expect(anguloDaLinhaDosCantos({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(0, 12);
    expect(anguloDaLinhaDosCantos({ x: 0, y: 0 }, { x: -10, y: -1 })).toBeCloseTo(Math.atan2(1, 10), 12);
    expect(anguloDaLinhaDosCantos({ x: 0, y: 0 }, { x: 10, y: 1 })).toBeCloseTo(Math.atan2(1, 10), 12);
  });

  it('um ponto ACIMA da linha dos cantos fica acima no canvas, com ou sem flip', () => {
    // O flip é só horizontal: "cima" não pode virar "baixo" em nenhum caso,
    // senão a pálpebra superior treinada num lado sai no outro.
    for (const olho of ['esquerdo', 'direito'] as const) {
      for (const isMirrored of [false, true]) {
        const interno = { x: 100, y: 100 };
        const externo = { x: 160, y: 100 };
        const r = matrizDoRecorteDoOlho({ cantoInterno: interno, cantoExterno: externo, olho, isMirrored });
        const acima = aplicar(r.matriz, { x: 130, y: 90 });
        expect(acima.y).toBeLessThan(ALTURA_DO_OLHO / 2);
      }
    }
  });

  it('cantos coincidentes lançam em vez de dividir por zero', () => {
    expect(() =>
      matrizDoRecorteDoOlho({ cantoInterno: { x: 1, y: 1 }, cantoExterno: { x: 1, y: 1 }, olho: 'direito', isMirrored: false }),
    ).toThrow(/coincidentes/);
  });

  it('pré-processamento normaliza ImageNet em CHW', () => {
    const rgba = new Uint8ClampedArray(LARGURA_DO_OLHO * ALTURA_DO_OLHO * 4);
    for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 255; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 255; }
    const t = preprocessarOlho(rgba);
    const px = LARGURA_DO_OLHO * ALTURA_DO_OLHO;
    expect(t.length).toBe(3 * px);
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 6);
    expect(t[px]).toBeCloseTo((0 - 0.456) / 0.224, 6);
    expect(() => preprocessarOlho(new Uint8ClampedArray(10))).toThrow();
  });
});

interface Caso {
  nome: string;
  cantoInterno: Point2D;
  cantoExterno: Point2D;
  isMirrored: boolean;
  olho: 'left' | 'right';
  flip: boolean;
  matriz: MatrizDoRecorte;
  pontos: { origem: Point2D; canvas: Point2D }[];
  largura: number;
  altura: number;
  fator: number;
}

function lcg(semente: number) {
  let e = semente >>> 0;
  return () => {
    e = (e * 1664525 + 1013904223) >>> 0;
    return e / 0xffffffff;
  };
}

function gerar(): { versao: 1; convencao: string; casos: Caso[] } {
  const r = lcg(915);
  const casos: Caso[] = [];
  let n = 0;
  for (const olho of ['esquerdo', 'direito'] as const) {
    for (const isMirrored of [false, true]) {
      for (let i = 0; i < 6; i++) {
        n++;
        const cx = 300 + r() * 700;
        const cy = 200 + r() * 300;
        const meia = 15 + r() * 25;
        const ang = (r() - 0.5) * 0.6;
        const paraEsquerda = (olho === 'direito') !== isMirrored;
        const dir = paraEsquerda ? -1 : 1;
        const cantoInterno = { x: cx - dir * meia * Math.cos(ang), y: cy - dir * meia * Math.sin(ang) };
        const cantoExterno = { x: cx + dir * meia * Math.cos(ang), y: cy + dir * meia * Math.sin(ang) };
        const rec = matrizDoRecorteDoOlho({ cantoInterno, cantoExterno, olho, isMirrored });
        const origens = [
          { x: cx, y: cy },
          cantoInterno,
          cantoExterno,
          { x: cx, y: cy - meia },
        ];
        casos.push({
          nome: `${olho}_${isMirrored ? 'espelhado' : 'direto'}_${n}`,
          cantoInterno,
          cantoExterno,
          isMirrored,
          olho: olho === 'esquerdo' ? 'left' : 'right',
          flip: rec.flip,
          matriz: rec.matriz,
          pontos: origens.map((o) => ({ origem: o, canvas: aplicar(rec.matriz, o) })),
          largura: LARGURA_DO_OLHO,
          altura: ALTURA_DO_OLHO,
          fator: FATOR_DO_OLHO,
        });
      }
    }
  }
  return {
    versao: 1,
    convencao:
      'centro = ponto médio dos cantos; largura na imagem = |externo−interno|·fator; altura = largura·(64/96); ' +
      'rotação por −ângulo da linha dos cantos (dobrado para (−90°,90°]); flip horizontal = isMirrored XOR (olho==left), ' +
      'para todo olho parecer um olho DIREITO da pessoa em imagem não espelhada; M = T(W/2,H/2)·S(sx,1)·R(θ)·S(k)·T(−c). ' +
      'Em OpenCV: cv2.warpAffine(img, [[a,c,e],[b,d,f]], (96,64), INTER_LINEAR, borderValue=0). Pré-processamento ImageNet, NCHW 3×64×96.',
    casos,
  };
}

describe('fixtures do recorte do olho (contrato com o treino)', () => {
  it('existe e a implementação bate com o arquivo', () => {
    if (process.env.GERAR_FIXTURES === '1' || !existsSync(CAMINHO)) {
      mkdirSync(dirname(CAMINHO), { recursive: true });
      writeFileSync(CAMINHO, JSON.stringify(gerar(), null, 2) + '\n');
    }
    const arquivo = JSON.parse(readFileSync(CAMINHO, 'utf8')) as ReturnType<typeof gerar>;
    expect(arquivo.casos.length).toBe(24);
    for (const caso of arquivo.casos) {
      const rec = matrizDoRecorteDoOlho({
        cantoInterno: caso.cantoInterno,
        cantoExterno: caso.cantoExterno,
        olho: caso.olho === 'left' ? 'esquerdo' : 'direito',
        isMirrored: caso.isMirrored,
        largura: caso.largura,
        altura: caso.altura,
        fator: caso.fator,
      });
      expect(rec.flip, caso.nome).toBe(caso.flip);
      for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        expect(rec.matriz[k], `${caso.nome}.${k}`).toBeCloseTo(caso.matriz[k], 6);
      }
      for (const p of caso.pontos) {
        const c = aplicar(rec.matriz, p.origem);
        expect(c.x, caso.nome).toBeCloseTo(p.canvas.x, 6);
        expect(c.y, caso.nome).toBeCloseTo(p.canvas.y, 6);
      }
    }
  });
});
