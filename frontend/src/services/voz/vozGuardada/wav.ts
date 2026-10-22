/**
 * WAV PCM 16 bits mono — o formato das gravações da voz guardada.
 *
 * Não o WebM/Opus que o `MediaRecorder` entrega: WAV toca em qualquer lugar,
 * o motor da voz clonada lê sem conversão, e é sem perda — a gravação de
 * alguém que talvez não consiga gravar de novo não pode passar por um codec
 * com perda na hora de guardar.
 */

/** Mistura os canais num só (média). */
export function paraMono(canais: readonly Float32Array[]): Float32Array {
  if (canais.length === 0) return new Float32Array(0);
  if (canais.length === 1) return canais[0];
  const n = Math.min(...canais.map((c) => c.length));
  const saida = new Float32Array(n);
  for (const c of canais) for (let i = 0; i < n; i++) saida[i] += c[i] / canais.length;
  return saida;
}

export function codificarWav(amostras: Float32Array, taxa: number): ArrayBuffer {
  const n = amostras.length;
  const taxaInteira = Math.max(1, Math.round(taxa));
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const escrever = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i));
  };
  escrever(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  escrever(8, 'WAVE');
  escrever(12, 'fmt ');
  v.setUint32(16, 16, true); // tamanho do bloco fmt
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, taxaInteira, true);
  v.setUint32(28, taxaInteira * 2, true); // bytes por segundo
  v.setUint16(32, 2, true); // bytes por amostra
  v.setUint16(34, 16, true); // bits
  escrever(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Number.isFinite(amostras[i]) ? Math.max(-1, Math.min(1, amostras[i])) : 0;
    v.setInt16(44 + i * 2, x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff), true);
  }
  return buf;
}

/**
 * Lê um WAV PCM de 16 bits (mono ou estéreo, misturado em mono). Procura os
 * blocos pelo nome — arquivos de outros programas trazem blocos extras entre
 * o `fmt ` e o `data`. `null` para qualquer outra coisa.
 */
export function lerWav(buf: ArrayBuffer): { amostras: Float32Array; taxa: number } | null {
  if (buf.byteLength < 44) return null;
  const v = new DataView(buf);
  const tag = (pos: number) => String.fromCharCode(v.getUint8(pos), v.getUint8(pos + 1), v.getUint8(pos + 2), v.getUint8(pos + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let pos = 12;
  let canais = 0;
  let taxa = 0;
  let bits = 0;
  let formato = 0;
  while (pos + 8 <= buf.byteLength) {
    const nome = tag(pos);
    const tamanho = v.getUint32(pos + 4, true);
    const corpo = pos + 8;
    if (nome === 'fmt ' && corpo + 16 <= buf.byteLength) {
      formato = v.getUint16(corpo, true);
      canais = v.getUint16(corpo + 2, true);
      taxa = v.getUint32(corpo + 4, true);
      bits = v.getUint16(corpo + 14, true);
    } else if (nome === 'data') {
      if (formato !== 1 || bits !== 16 || canais < 1 || !(taxa > 0)) return null;
      const bytes = Math.min(tamanho, buf.byteLength - corpo);
      const quadros = Math.floor(bytes / (2 * canais));
      const porCanal = Array.from({ length: canais }, () => new Float32Array(quadros));
      for (let i = 0; i < quadros; i++) {
        for (let c = 0; c < canais; c++) {
          const s = v.getInt16(corpo + (i * canais + c) * 2, true);
          porCanal[c][i] = s < 0 ? s / 0x8000 : s / 0x7fff;
        }
      }
      return { amostras: paraMono(porCanal), taxa };
    }
    pos = corpo + tamanho + (tamanho % 2);
  }
  return null;
}
