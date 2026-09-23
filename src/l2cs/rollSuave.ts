/**
 * Roll da cabeça SUAVIZADO para o recorte do L2CS.
 *
 * O roll bruto do MediaPipe treme alguns décimos de grau entre quadros. Se o
 * recorte girar exatamente esse valor, a IMAGEM que a rede vê treme junto —
 * e a rede, que é sensível a pixel, devolve um ângulo que treme por causa do
 * recorte, não do olho. A contra-rotação da saída (`roll.ts`) usa o mesmo
 * valor, então a geometria fecha; o que ela não desfaz é o ruído que a rede
 * acrescenta por ver uma imagem diferente a cada quadro.
 *
 * A saída é um EMA com constante de tempo `TAU_MS`: uma inclinação real da
 * cabeça (cadeira reclinando, ~1 s) entra quase inteira; o tremor de 33 ms,
 * não. Como o recorte e a contra-rotação recebem o MESMO valor suavizado, o
 * atraso do EMA não introduz erro geométrico — só muda em torno de qual roll
 * a imagem está nivelada, e esse roll continua sendo cancelado exatamente.
 *
 * Pura por chamada: quem chama guarda o estado devolvido.
 */

export const TAU_MS = 150;

export interface EstadoDoRoll {
  valor: number;
  tMs: number;
}

/** Devolve o novo estado. `null` de entrada = primeiro quadro com rosto: adota o bruto. */
export function suavizarRoll(
  anterior: EstadoDoRoll | null,
  rollBrutoRad: number,
  agoraMs: number,
  tauMs: number = TAU_MS,
): EstadoDoRoll {
  if (!Number.isFinite(rollBrutoRad)) return anterior ?? { valor: 0, tMs: agoraMs };
  if (!anterior || !Number.isFinite(anterior.valor)) return { valor: rollBrutoRad, tMs: agoraMs };
  const dt = Math.max(0, agoraMs - anterior.tMs);
  if (dt === 0) return anterior;
  const alpha = 1 - Math.exp(-dt / Math.max(1, tauMs));
  return { valor: anterior.valor + alpha * (rollBrutoRad - anterior.valor), tMs: agoraMs };
}
