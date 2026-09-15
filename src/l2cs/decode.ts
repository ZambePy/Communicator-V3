// Decodificação de logits → ângulo em graus/radianos.
// Isolado do worker para permitir teste unitário em Node (sem WebGL/WASM).
//
// Dois espaços de bins convivem aqui, e a escolha errada dá um erro sem
// sintoma: o checkpoint Gaze360 tem 90 bins de 4° em −180°…+176°, um espaço
// CIRCULAR (o bin 0 e o bin 89 são vizinhos); um modelo retreinado para tela
// tem, por exemplo, 30 bins de 3° em −45°…+42°, um espaço LINEAR — ali a
// média circular de uma distribuição difusa apontaria para um ângulo que não
// existe no modelo. Quem decide é `modoDeDecodificacao`, a partir da meta.

export type ModoDeDecodificacao = 'circular' | 'linear';

/**
 * Circular quando os bins fecham a volta (`bins × largura ≥ 360°`); linear
 * caso contrário. A meta pode declarar `decoding` explicitamente; a inferência
 * pela cobertura existe para o checkpoint antigo, cuja meta não declara.
 */
export function modoDeDecodificacao(meta: {
  outputBins: number;
  binWidth: number;
  decoding?: ModoDeDecodificacao | null;
}): ModoDeDecodificacao {
  if (meta.decoding === 'circular' || meta.decoding === 'linear') return meta.decoding;
  return meta.outputBins * meta.binWidth >= 360 - 1e-9 ? 'circular' : 'linear';
}

export function softmax(logits: ArrayLike<number>): Float64Array {
  const n = logits.length;
  let maxV = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i] > maxV) maxV = logits[i];
  const out = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(logits[i] - maxV);
    out[i] = e;
    sum += e;
  }
  const inv = 1 / sum;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

/**
 * Ângulo (expectativa CIRCULAR sobre os bins) e confiança da softmax.
 *
 * Os bins do Gaze360 cobrem −180°…+176°, um espaço circular: o bin 0 (−180°)
 * e o bin 89 (+176°) são VIZINHOS, separados por 4°. A média linear ignorava
 * isso: um crop degenerado (preto, congelado) produz distribuição difusa com
 * massa nas duas pontas, e `(−180 + 176)/2 = −2°` passava em `isGazePlausible`
 * como "olhando bem para o centro". A média circular soma os vetores
 * unitários ponderados pela probabilidade e devolve o `atan2` da resultante.
 *
 * Quando a distribuição é genuinamente uniforme, a resultante tem norma ~0 e
 * o ângulo é arbitrário. Quem rejeita esse caso é o gate de confiança em
 * `buildL2CSBlock`, usando `confidence = 1 − H/H_max` (H = −Σ p·log(p)):
 * 0 = uniforme, 1 = massa num único bin.
 */
export function decodeAngleWithConfidence(
  logits: ArrayLike<number>,
  binWidth: number,
  binOffset: number,
  modo: ModoDeDecodificacao = 'circular',
): { deg: number; confidence: number } {
  const probs = softmax(logits);
  let sx = 0;
  let sy = 0;
  // Esperança LINEAR: Σ p·ângulo. É a conta do treino (o valor esperado da
  // softmax que entra na perda MSE), e é a certa quando os bins não fecham a
  // volta.
  let esperancaDeg = 0;
  let entropy = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    const deg = i * binWidth + binOffset;
    const rad = (deg * Math.PI) / 180;
    sx += p * Math.cos(rad);
    sy += p * Math.sin(rad);
    esperancaDeg += p * deg;
    // p > 0 sempre (softmax numericamente estável nunca emite 0 exato desde
    // que os logits sejam finitos), mas guarda contra p ~ 0 por underflow —
    // p·log(p) → 0 no limite p → 0+, então tratar como 0 é a extensão correta.
    if (p > 0) entropy -= p * Math.log(p);
  }
  const maxEntropy = Math.log(probs.length);
  // Bins ≤ 1 → sem incerteza a medir; retorna 1 por convenção (não há distribuição).
  const confidence = maxEntropy > 0 ? 1 - entropy / maxEntropy : 1;
  // Clamp final por segurança contra ruído de ponto flutuante (0-ε ou 1+ε).
  const clamped = confidence < 0 ? 0 : confidence > 1 ? 1 : confidence;
  const deg = modo === 'linear' ? esperancaDeg : (Math.atan2(sy, sx) * 180) / Math.PI;
  return { deg, confidence: clamped };
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
