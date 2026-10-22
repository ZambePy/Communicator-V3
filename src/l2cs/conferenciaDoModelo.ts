// Conferência entre a meta (.meta.json) e o modelo ONNX carregado.
//
// Puro e fora do worker de propósito: o worker roda o ONNX Runtime e não é
// testável no vitest; o que ele decide sobre "esta saída combina com a meta?"
// é, e é o que precisa de teste.
//
// Relato de 19/10/2026: a meta incompatível só era descoberta na primeira
// inferência real, depois do `ready`. O status ficava `ready`, o bloco angular
// saía sempre zerado e a calibração falhava culpando os óculos. Agora o worker
// roda uma inferência de teste no `init` e estas funções dizem, em português,
// o que não bate — e isso chega à tela como "o modelo não carregou".

import type { EntradaDeTeste, L2CSModelMeta } from './types';

/**
 * Meta e modelo não combinam (grade de bins, nomes das saídas, lado do
 * recorte). É defeito de arquivo, não de provider: trocar WebGPU por WASM não
 * resolve, e o worker não tenta.
 */
export class ErroDeCompatibilidade extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeCompatibilidade';
  }
}

/** Lança se o ONNX declara lados aceitos e `lado` não é um deles. */
export function conferirLadoAceito(meta: Pick<L2CSModelMeta, 'supportedInputSizes'>, lado: number): void {
  const lados = meta.supportedInputSizes;
  if (Array.isArray(lados) && lados.length > 0 && !lados.includes(lado)) {
    throw new ErroDeCompatibilidade(
      `o modelo aceita recorte de ${lados.join(' ou ')} px, mas recebeu ${lado} px ` +
      `(confira src/l2cs/modelos.ts e a flag l2csInputSize).`,
    );
  }
}

/** Forma `[1, 3, altura, largura]` do tensor de teste para o provider ativo. */
export function formaDaEntradaDeTeste(
  teste: EntradaDeTeste,
  ativo: 'webgpu' | 'wasm',
  meta: Pick<L2CSModelMeta, 'supportedInputSizes'>,
): [number, number, number, number] {
  if ('dims' in teste) {
    const [h, w] = teste.dims;
    if (!(Number.isInteger(h) && h > 0 && Number.isInteger(w) && w > 0)) {
      throw new ErroDeCompatibilidade(`dimensões de teste inválidas (${String(h)}×${String(w)}).`);
    }
    return [1, 3, h, w];
  }
  const lado = teste.porProvider[ativo];
  if (!(Number.isInteger(lado) && lado > 0)) {
    throw new ErroDeCompatibilidade(`lado de teste inválido para '${ativo}' (${String(lado)}).`);
  }
  conferirLadoAceito(meta, lado);
  return [1, 3, lado, lado];
}

/**
 * Confere as saídas de uma inferência contra a meta: os dois nomes existem e
 * cada um tem `outputBins` valores. Lança `ErroDeCompatibilidade` com a frase
 * que diz o que mudar.
 */
export function conferirSaidas(
  out: Record<string, { data: ArrayLike<number> } | undefined>,
  meta: Pick<L2CSModelMeta, 'outputBins' | 'outputTensorNames'>,
): void {
  const yaw = out[meta.outputTensorNames.yaw];
  const pitch = out[meta.outputTensorNames.pitch];
  if (!yaw || !pitch) {
    throw new ErroDeCompatibilidade(
      `saídas '${meta.outputTensorNames.yaw}'/'${meta.outputTensorNames.pitch}' ausentes; ` +
      `o modelo expõe [${Object.keys(out).join(', ')}]. Atualize a meta (.meta.json) do modelo carregado.`,
    );
  }
  const nYaw = yaw.data.length;
  const nPitch = pitch.data.length;
  if (nYaw !== meta.outputBins || nPitch !== meta.outputBins) {
    throw new ErroDeCompatibilidade(
      `a meta declara ${meta.outputBins} bins, mas o modelo devolveu ${nYaw} (yaw) e ${nPitch} (pitch). ` +
      `Atualize a meta (.meta.json) do modelo carregado.`,
    );
  }
}
