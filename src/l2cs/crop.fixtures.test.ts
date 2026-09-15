import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeSquareBBox, matrizDoRecorte, type MatrizDoRecorte, type Point2D } from './crop';

/**
 * Fixtures do recorte — o contrato entre este código e o treino em Python.
 *
 * O V2 retreina o L2CS-Net, e o modo de falha silencioso de um retreino é
 * treinar com um recorte e inferir com outro: a rede aprende uma convenção de
 * enquadramento e recebe outra em produção, e o erro aparece como "o modelo
 * novo ficou pior" sem nenhuma pista de por quê. A defesa é um arquivo de
 * casos que os DOIS lados leem: aqui ele trava a implementação TypeScript;
 * em `Communicator V2/tests/test_recorte.py` ele trava a porta em Python.
 *
 * Regenerar (só quando a convenção mudar de propósito, e aí o Python precisa
 * ser revisto junto):  GERAR_FIXTURES=1 npx vitest run src/l2cs/crop.fixtures
 */

const CAMINHO = resolve(__dirname, '../../fixtures/recorte-l2cs.json');

interface Caso {
  nome: string;
  imageWidth: number;
  imageHeight: number;
  expandFactor: number;
  size: number;
  isMirrored: boolean;
  rollRad: number | null;
  landmarks: Point2D[];
  bbox: { x: number; y: number; side: number };
  matriz: MatrizDoRecorte;
  /** Pontos da imagem de origem (px) e onde caem no canvas — para o lado
   *  Python verificar a APLICAÇÃO da matriz, não só os coeficientes. */
  pontos: { origem: Point2D; canvas: Point2D }[];
}

interface Arquivo {
  versao: 1;
  convencao: string;
  casos: Caso[];
}

function lcg(semente: number) {
  let e = semente >>> 0;
  return () => {
    e = (e * 1664525 + 1013904223) >>> 0;
    return e / 0xffffffff;
  };
}

/** Rosto plausível: nuvem de pontos num retângulo com a proporção de um rosto. */
function rosto(r: () => number, cx: number, cy: number, largura: number): Point2D[] {
  const altura = largura * 1.3;
  const pts: Point2D[] = [];
  for (let i = 0; i < 40; i++) {
    pts.push({ x: cx + (r() - 0.5) * largura, y: cy + (r() - 0.5) * altura });
  }
  return pts;
}

function aplicar(m: MatrizDoRecorte, p: Point2D): Point2D {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

function arredondar(v: number): number {
  return Math.round(v * 1e9) / 1e9;
}

function gerar(): Arquivo {
  const r = lcg(20260915);
  const resolucoes: [number, number][] = [[1280, 720], [640, 480], [1920, 1080]];
  const rolls: (number | null)[] = [null, -0.3, 0.17, 0.5];
  const casos: Caso[] = [];
  let n = 0;
  for (const [w, h] of resolucoes) {
    for (const size of [448, 224]) {
      for (const isMirrored of [false, true]) {
        for (const rollRad of rolls) {
          n++;
          const landmarks = rosto(r, 0.35 + r() * 0.3, 0.35 + r() * 0.3, 0.15 + r() * 0.15);
          const expandFactor = 1.4;
          const bbox = computeSquareBBox(landmarks, w, h, expandFactor);
          const matriz = matrizDoRecorte(bbox, size, isMirrored, rollRad);
          const cx = bbox.x + bbox.side / 2;
          const cy = bbox.y + bbox.side / 2;
          const origens: Point2D[] = [
            { x: cx, y: cy },
            { x: cx + bbox.side * 0.25, y: cy },
            { x: cx, y: cy - bbox.side * 0.25 },
            { x: bbox.x, y: bbox.y },
          ];
          casos.push({
            nome: `${w}x${h}_${size}_${isMirrored ? 'espelhado' : 'direto'}_roll${rollRad ?? 'null'}_${n}`,
            imageWidth: w,
            imageHeight: h,
            expandFactor,
            size,
            isMirrored,
            rollRad,
            // Sem arredondar: JSON guarda o double exato, e é dele que a bbox
            // renasce nos dois lados. Arredondar aqui propagava 1e-9 × 1280 px
            // para os coeficientes de translação.
            landmarks,
            bbox: { x: arredondar(bbox.x), y: arredondar(bbox.y), side: arredondar(bbox.side) },
            matriz: Object.fromEntries(
              Object.entries(matriz).map(([k, v]) => [k, arredondar(v)]),
            ) as unknown as MatrizDoRecorte,
            pontos: origens.map((o) => {
              const c = aplicar(matriz, o);
              return {
                origem: { x: arredondar(o.x), y: arredondar(o.y) },
                canvas: { x: arredondar(c.x), y: arredondar(c.y) },
              };
            }),
          });
        }
      }
    }
  }
  return {
    versao: 1,
    convencao:
      'M = T(size/2) · S(sx,1) · R(-roll) · S(size/side) · T(-centro). Ponto de origem (px) → ' +
      'canvas: x\' = a·x + c·y + e, y\' = b·x + d·y + f. Em OpenCV: cv2.warpAffine(img, [[a,c,e],[b,d,f]], (size,size), ' +
      'flags=INTER_LINEAR, borderValue=0). bbox = quadrado centrado na bbox dos landmarks, lado = max(w,h)·expandFactor. ' +
      'Landmarks em [0,1] relativos à imagem. Pré-processamento: RGB/255, média ImageNet [0.485,0.456,0.406], desvio [0.229,0.224,0.225], NCHW.',
    casos,
  };
}

describe('fixtures do recorte compartilhado com o treino', () => {
  it('existe e a implementação bate com o arquivo, coeficiente a coeficiente', () => {
    if (process.env.GERAR_FIXTURES === '1' || !existsSync(CAMINHO)) {
      mkdirSync(dirname(CAMINHO), { recursive: true });
      writeFileSync(CAMINHO, JSON.stringify(gerar(), null, 2) + '\n');
    }
    const arquivo = JSON.parse(readFileSync(CAMINHO, 'utf8')) as Arquivo;
    expect(arquivo.versao).toBe(1);
    expect(arquivo.casos.length).toBeGreaterThanOrEqual(24);

    for (const caso of arquivo.casos) {
      const bbox = computeSquareBBox(caso.landmarks, caso.imageWidth, caso.imageHeight, caso.expandFactor);
      expect(bbox.x, caso.nome).toBeCloseTo(caso.bbox.x, 6);
      expect(bbox.y, caso.nome).toBeCloseTo(caso.bbox.y, 6);
      expect(bbox.side, caso.nome).toBeCloseTo(caso.bbox.side, 6);

      const m = matrizDoRecorte(bbox, caso.size, caso.isMirrored, caso.rollRad);
      for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
        expect(m[k], `${caso.nome}.${k}`).toBeCloseTo(caso.matriz[k], 6);
      }
      for (const p of caso.pontos) {
        const c = aplicar(m, p.origem);
        expect(c.x, caso.nome).toBeCloseTo(p.canvas.x, 6);
        expect(c.y, caso.nome).toBeCloseTo(p.canvas.y, 6);
      }
    }
  });

  it('o centro da bbox cai no centro do canvas em todos os casos', () => {
    const arquivo = JSON.parse(readFileSync(CAMINHO, 'utf8')) as Arquivo;
    for (const caso of arquivo.casos) {
      const centro = caso.pontos[0];
      expect(centro.canvas.x, caso.nome).toBeCloseTo(caso.size / 2, 6);
      expect(centro.canvas.y, caso.nome).toBeCloseTo(caso.size / 2, 6);
    }
  });
});
