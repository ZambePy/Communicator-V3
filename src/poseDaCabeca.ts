/**
 * Pose da cabeça: ângulos de Euler a partir da matriz facial do MediaPipe e o
 * caminho de volta, dos ângulos para a matriz de rotação.
 *
 * A matriz do FaceLandmarker leva o modelo canônico do rosto para o espaço
 * métrico da câmera (mão direita, câmera olhando para −Z, y para cima) e chega
 * em coluna-maior: R_ij = m[4j + i]. Ela vem de um Procrustes COM escala, então
 * o bloco 3×3 não é uma rotação pura; os ângulos tirados dele, sim.
 *
 * A decomposição é R = R_y(yaw)·R_x(pitch)·R_z(roll), a mesma que o
 * `extractor.ts` usa desde sempre:
 *
 *     pitch = asin(−R₁₂)    yaw = atan2(R₀₂, R₂₂)    roll = atan2(R₁₀, R₁₁)
 *
 * yaw > 0 é a cabeça virada para a esquerda da pessoa, pitch > 0 é a cabeça
 * para baixo, roll > 0 sobe o lado direito da imagem. Reconstruir a matriz a
 * partir dos ângulos dá uma rotação pura (sem a escala do Procrustes), que é o
 * que o referencial da cabeça precisa (`referencialDaCabeca.ts`).
 */

export interface PoseDaCabeca {
  yaw: number;
  pitch: number;
  roll: number;
}

/** Ângulos da matriz facial (coluna-maior, 16 números). `null` se inválida. */
export function eulerDaMatriz(m: ArrayLike<number> | null | undefined): PoseDaCabeca | null {
  if (!m || m.length !== 16) return null;
  const r02 = m[8];
  const r10 = m[1];
  const r11 = m[5];
  const r12 = m[9];
  const r22 = m[10];
  if (![r02, r10, r11, r12, r22].every(Number.isFinite)) return null;
  // A escala do Procrustes multiplica as três colunas por igual: ela some no
  // atan2, mas não no asin. Divide pela norma da terceira coluna antes.
  const s = Math.hypot(m[8], m[9], m[10]);
  if (!(s > 0)) return null;
  // Clamp antes do asin: |R₁₂| ligeiramente > 1 por ponto flutuante daria NaN.
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r12 / s)));
  const yaw = Math.atan2(r02, r22);
  const roll = Math.atan2(r10, r11);
  return { yaw, pitch, roll };
}

/**
 * Matriz de rotação R = R_y(yaw)·R_x(pitch)·R_z(roll), em LINHA-maior
 * (`r[3i + j]` = R_ij), do canônico do rosto para o espaço métrico da câmera.
 */
export function matrizDaPose(p: PoseDaCabeca): number[] {
  const cy = Math.cos(p.yaw);
  const sy = Math.sin(p.yaw);
  const cp = Math.cos(p.pitch);
  const sp = Math.sin(p.pitch);
  const cr = Math.cos(p.roll);
  const sr = Math.sin(p.roll);
  // R_y·R_x (calculado à mão para não alocar):
  //   [ cy,  sy·sp, sy·cp ]
  //   [ 0,   cp,    −sp   ]
  //   [ −sy, cy·sp, cy·cp ]
  // vezes R_z = [[cr, −sr, 0], [sr, cr, 0], [0, 0, 1]].
  return [
    cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp,
    cp * sr, cp * cr, -sp,
    -sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp,
  ];
}
