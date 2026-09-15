// Desfaz, no ângulo de olhar, a rotação que o recorte aplicou à imagem.
//
// A sprint S6 passou a cancelar o roll da cabeça no recorte do L2CS: a rede
// recebe um rosto nivelado, que é o que ela viu no treino. Mas a saída dela
// então vem no referencial do RECORTE — girado em relação ao vídeo. Sem
// desfazer essa rotação, um olhar fixo no mesmo ponto da tela muda de
// yaw/pitch conforme a cabeça inclina, e o Ridge, calibrado com a cabeça
// reta, lê isso como olhar para outro lugar. Era exatamente o erro que a S6
// queria eliminar, reaparecendo do lado de fora da rede.
//
// A conta é a inversa da de `matrizDoRecorte`, e o espelhamento entra pelo
// mesmo motivo de lá: conjugar uma rotação por uma reflexão inverte o sentido.
// Sem espelho, o recorte girou por θ = −roll e aqui se gira por +roll; com
// espelho, o recorte efetivo (depois de desespelhar) girou por +roll, e aqui
// se gira por −roll. O sinal do determinante troca; o módulo do ângulo, não.
//
// Convenção dos ângulos (l2cs.meta.json): yaw > 0 = olhar para a DIREITA da
// imagem não espelhada; pitch > 0 = olhar para CIMA. No plano da imagem o eixo
// y cresce para BAIXO, e é nesse plano que a rotação acontece.

export interface AnguloDeOlhar {
  yaw: number;
  pitch: number;
}

/**
 * Leva (yaw, pitch) do referencial do recorte nivelado para o do vídeo.
 *
 * `rollRad` é o mesmo valor passado a `cropFaceToTensor`; `isMirrored`, o
 * mesmo flag. Roll nulo ou não finito devolve a entrada intacta, que é o
 * comportamento de antes da S6.
 */
export function desfazerRollNoOlhar(
  olhar: AnguloDeOlhar,
  rollRad: number | null | undefined,
  isMirrored: boolean,
): AnguloDeOlhar {
  if (typeof rollRad !== 'number' || !Number.isFinite(rollRad) || rollRad === 0) return olhar;
  if (!Number.isFinite(olhar.yaw) || !Number.isFinite(olhar.pitch)) return olhar;

  // Vetor unitário do olhar em coordenadas de imagem: x para a direita, y para
  // BAIXO (por isso −sin(pitch)), z magnitude para a frente.
  const cp = Math.cos(olhar.pitch);
  const gx = cp * Math.sin(olhar.yaw);
  const gy = -Math.sin(olhar.pitch);
  const gz = cp * Math.cos(olhar.yaw);

  const phi = isMirrored ? -rollRad : rollRad;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  // Mesma forma de matriz que o recorte usa: [x'; y'] = [[c, −s], [s, c]]·[x; y].
  const rx = c * gx - s * gy;
  const ry = s * gx + c * gy;

  const pitch = Math.asin(Math.max(-1, Math.min(1, -ry)));
  const yaw = Math.atan2(rx, gz);
  return { yaw, pitch };
}

/**
 * Sentido inverso — o que o recorte faz com uma direção do vídeo. Existe para
 * o teste fechar o ciclo e para o treino (Communicator V2) girar o rótulo
 * junto com a imagem pela mesma conta.
 */
export function aplicarRollNoOlhar(
  olhar: AnguloDeOlhar,
  rollRad: number | null | undefined,
  isMirrored: boolean,
): AnguloDeOlhar {
  if (typeof rollRad !== 'number' || !Number.isFinite(rollRad) || rollRad === 0) return olhar;
  return desfazerRollNoOlhar(olhar, -rollRad, isMirrored);
}
