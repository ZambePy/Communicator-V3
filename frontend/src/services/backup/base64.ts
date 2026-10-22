/**
 * Base64 das gravações da voz dentro do arquivo de backup (rodada 3, 21/10/2026).
 *
 * `btoa`/`atob` do navegador trabalham com texto "binário"; áudio de vários MB
 * não pode passar por `String.fromCharCode(...bytes)` (estoura a pilha), então a
 * conversão é em blocos. A leitura é ESTRITA — tamanho que fecha, só as letras
 * do alfabeto, preenchimento só no fim — e devolve `null` no que não for base64:
 * um backup estragado tem de ser recusado, não "consertado" por `atob`.
 *
 * `deBase64Async` (rodada de correção 1, 21/10/2026) faz o mesmo em blocos, cedendo a
 * vez à janela entre eles: um backup com a voz tem dezenas de MB de texto, e
 * decodificá-lo numa tacada só travava cliques, animações e o rastreio do olhar.
 */

const BLOCO = 0x8000;
/** O alfabeto, e o preenchimento só no fim. Classe de caracteres simples: linear mesmo em dezenas de MB. */
const ALFABETO = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * São bytes de verdade? Não usa `instanceof`: o que vem de uma ponte entre mundos
 * (o preload do Electron) pode ser de outro contexto, e aí `instanceof` dá falso
 * mesmo para um `ArrayBuffer` legítimo. E recusa número e texto, que
 * `new Uint8Array(3)` aceitaria como "3 bytes de silêncio".
 */
export function ehBufferDeBytes(x: unknown): x is ArrayBuffer | ArrayBufferView {
  return ArrayBuffer.isView(x) || Object.prototype.toString.call(x) === '[object ArrayBuffer]';
}

export function paraBase64(bytes: ArrayBuffer | ArrayBufferView): string {
  const origem = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes);
  const pedacos: string[] = [];
  for (let i = 0; i < origem.length; i += BLOCO) {
    pedacos.push(String.fromCharCode(...origem.subarray(i, i + BLOCO)));
  }
  return btoa(pedacos.join(''));
}

function ehBase64(texto: unknown): texto is string {
  return typeof texto === 'string' && texto.length % 4 === 0 && ALFABETO.test(texto);
}

/** Quantos bytes o texto vira, sem decodificar. `null` se não for base64. */
export function tamanhoDecodificado(texto: unknown): number | null {
  if (!ehBase64(texto)) return null;
  const preenchimento = texto.endsWith('==') ? 2 : texto.endsWith('=') ? 1 : 0;
  return (texto.length / 4) * 3 - preenchimento;
}

export function deBase64(texto: unknown): Uint8Array | null {
  if (!ehBase64(texto)) return null;
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Tamanho de cada bloco de texto da leitura em partes, em caracteres. Múltiplo de 4:
 * um grupo de base64 nunca é cortado ao meio, então cada bloco decodifica sozinho.
 */
export const BLOCO_DA_DECODIFICACAO = 262_144;
/** O alfabeto SEM preenchimento: é o que vale em todo bloco que não é o último. */
const SO_ALFABETO = /^[A-Za-z0-9+/]*$/;

const cederAVez = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * O mesmo de `deBase64` — mesma leitura estrita, `null` no que não for base64 —, mas em
 * blocos de `BLOCO_DA_DECODIFICACAO` caracteres e esperando (`ceder`, por padrão um
 * `setTimeout(0)`) entre um bloco e o seguinte, para a janela continuar respondendo.
 * Preenchimento (`=`) só vale no último bloco.
 */
export async function deBase64Async(texto: unknown, ceder: () => Promise<void> = cederAVez): Promise<Uint8Array | null> {
  if (typeof texto !== 'string' || texto.length % 4 !== 0) return null;
  const n = texto.length;
  const preenchimento = texto.endsWith('==') ? 2 : texto.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((n / 4) * 3 - preenchimento);
  let escrito = 0;
  for (let inicio = 0; inicio < n; inicio += BLOCO_DA_DECODIFICACAO) {
    const fim = Math.min(n, inicio + BLOCO_DA_DECODIFICACAO);
    const ehOUltimo = fim === n;
    const pedaco = texto.slice(inicio, fim);
    if (!(ehOUltimo ? ALFABETO : SO_ALFABETO).test(pedaco)) return null;
    const binario = atob(pedaco);
    for (let i = 0; i < binario.length; i++) bytes[escrito + i] = binario.charCodeAt(i);
    escrito += binario.length;
    if (!ehOUltimo) await ceder();
  }
  return bytes;
}
