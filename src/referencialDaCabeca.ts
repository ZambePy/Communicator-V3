/**
 * Olhar do L2CS no referencial da CABEÇA (M4 em docs/PESQUISA.md).
 *
 * ## O problema
 *
 * O vetor do Ridge mistura dois referenciais. O offset da íris é medido no
 * referencial da cabeça (`extractor.ts`); o ângulo do L2CS, não. O L2CS foi
 * treinado no Gaze360, que mede o olhar no referencial do RAIO câmera→olho:
 * olhar para a câmera vale (0, 0) de qualquer posição, e girar a cabeça com o
 * olhar parado no alvo quase não muda a saída. Depois, a compensação de pose
 * d·tan(Δ) é aplicada à saída inteira e aos rótulos de treino, como se tudo
 * estivesse no referencial da cabeça — e conta duas vezes a parte do L2CS.
 *
 * ## A correção
 *
 * Girar o vetor da rede para o referencial da cabeça antes de montar as
 * features. As duas famílias passam a obedecer à mesma lei, e o ruído da
 * rotação R entra na feature com um sinal e na compensação com o outro:
 * cancela em primeira ordem, porque as duas usam a MESMA pose suavizada.
 *
 *   1. Vetor do L2CS nos eixos OpenCV do raio (x à direita da imagem, y para
 *      baixo, z da câmera para o olho). Convenção da rede: yaw > 0 é olhar
 *      para a direita DA PESSOA (esquerda da imagem não espelhada), pitch > 0
 *      é para cima (`gazeto3d` do repositório do L2CS-Net):
 *          g = (−cos p·sin y, −sin p, −cos p·cos y)
 *   2. Do raio para a câmera: z_r aponta da câmera para o meio dos olhos,
 *      x_r = normalize((0, 1, 0) × z_r), y_r = z_r × x_r. Com o rosto no
 *      centro da imagem os dois referenciais coincidem; 10 cm abaixo do eixo
 *      a 60 cm, a diferença passa de 9° em pitch.
 *   3. Da câmera OpenCV para o espaço métrico do MediaPipe: (x, −y, −z).
 *   4. Para a cabeça: g_F = Rᵀ·g, com R a rotação da pose (canônico → câmera).
 *   5. yaw_h = atan2(g_F,x, g_F,z), pitch_h = asin(g_F,y).
 *
 * No resultado, yaw_h > 0 é olhar para a esquerda da pessoa e pitch_h > 0 é
 * para cima — o mesmo sentido do offset da íris no referencial da cabeça.
 * Girar a cabeça Δ com o olhar parado no alvo move yaw_h em −Δ, como a íris
 * (`referencialDaCabeca.test.ts` fecha os sinais caso a caso).
 */

import type { AnguloDeOlhar } from './l2cs/roll';

export interface EntradaDoReferencial {
  /** Olhar do L2CS já no referencial do vídeo não espelhado (rad, convenção do L2CS). */
  olhar: AnguloDeOlhar;
  /** Meio dos olhos, em px do vídeo. */
  olhoPx: { x: number; y: number };
  larguraVideo: number;
  alturaVideo: number;
  /** Campo de visão horizontal da câmera, em graus. */
  fovHorizontalDeg: number;
  /** Rotação da pose em linha-maior (`poseDaCabeca.matrizDaPose`). */
  rotacao: readonly number[];
}

function normalizar(v: [number, number, number]): [number, number, number] | null {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : null;
}

/** Olhar no referencial da cabeça. `null` quando alguma entrada não serve. */
export function olharNoReferencialDaCabeca(e: EntradaDoReferencial): AnguloDeOlhar | null {
  const { olhar, olhoPx, larguraVideo: w, alturaVideo: h, fovHorizontalDeg, rotacao: r } = e;
  if (!Number.isFinite(olhar.yaw) || !Number.isFinite(olhar.pitch)) return null;
  if (!(w > 0) || !(h > 0) || !Number.isFinite(olhoPx.x) || !Number.isFinite(olhoPx.y)) return null;
  if (!(fovHorizontalDeg > 0 && fovHorizontalDeg < 180) || r.length !== 9) return null;

  // 1. Vetor da rede no referencial do raio.
  const cp = Math.cos(olhar.pitch);
  const gx = -cp * Math.sin(olhar.yaw);
  const gy = -Math.sin(olhar.pitch);
  const gz = -cp * Math.cos(olhar.yaw);

  // 2. Base do raio nos eixos da câmera (centro óptico no meio da imagem).
  const f = w / 2 / Math.tan((fovHorizontalDeg * Math.PI) / 360);
  const zr = normalizar([(olhoPx.x - w / 2) / f, (olhoPx.y - h / 2) / f, 1]);
  if (!zr) return null;
  // (0, 1, 0) × z_r = (z_r,z, 0, −z_r,x)
  const xr = normalizar([zr[2], 0, -zr[0]]);
  if (!xr) return null;
  const yr: [number, number, number] = [
    zr[1] * xr[2] - zr[2] * xr[1],
    zr[2] * xr[0] - zr[0] * xr[2],
    zr[0] * xr[1] - zr[1] * xr[0],
  ];
  const cx = xr[0] * gx + yr[0] * gy + zr[0] * gz;
  const cy = xr[1] * gx + yr[1] * gy + zr[1] * gz;
  const cz = xr[2] * gx + yr[2] * gy + zr[2] * gz;

  // 3. OpenCV → espaço métrico do MediaPipe.
  const mx = cx;
  const my = -cy;
  const mz = -cz;

  // 4. Rᵀ·g: a coluna j de R vezes g.
  const fx = r[0] * mx + r[3] * my + r[6] * mz;
  const fy = r[1] * mx + r[4] * my + r[7] * mz;
  const fz = r[2] * mx + r[5] * my + r[8] * mz;

  // 5. Ângulos no referencial da cabeça.
  const yaw = Math.atan2(fx, fz);
  const pitch = Math.asin(Math.max(-1, Math.min(1, fy)));
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
  return { yaw, pitch };
}
