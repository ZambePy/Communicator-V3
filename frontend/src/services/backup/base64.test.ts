import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';
import { BLOCO_DA_DECODIFICACAO, deBase64, deBase64Async, ehBufferDeBytes, paraBase64, tamanhoDecodificado } from './base64';

// As gravações da voz viajam dentro do arquivo de backup em base64. O que se
// guarda aqui é a voz de alguém: um byte trocado é uma gravação estragada.

const bytesDe = (n: number, semente = 7) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + semente + (i >> 8)) & 0xff);

describe('paraBase64 / deBase64', () => {
  it('vetor conhecido: "Hello" é SGVsbG8= (conta feita à mão, não ida e volta do próprio código)', () => {
    expect(paraBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe('SGVsbG8=');
    expect([...deBase64('SGVsbG8=')!]).toEqual([72, 101, 108, 108, 111]);
  });

  it('os três tamanhos de sobra do último bloco (0, 1 e 2 bytes) fecham com o preenchimento certo', () => {
    expect(paraBase64(new Uint8Array([0]))).toBe('AA==');
    expect(paraBase64(new Uint8Array([0, 0]))).toBe('AAA=');
    expect(paraBase64(new Uint8Array([0, 0, 0]))).toBe('AAAA');
    expect(paraBase64(new Uint8Array(0))).toBe('');
  });

  it('volta byte a byte igual, com qualquer tamanho — inclusive acima do bloco de conversão', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100, 0x7fff, 0x8000, 0x8001, 70_001]) {
      const origem = bytesDe(n);
      const volta = deBase64(paraBase64(origem));
      expect(volta && Buffer.from(volta).equals(Buffer.from(origem)), `n=${n}`).toBe(true);
    }
  });

  it('os 256 valores de byte atravessam sem mudar (é áudio, não texto)', () => {
    const todos = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect([...deBase64(paraBase64(todos))!]).toEqual([...todos]);
  });

  it('aceita um ArrayBuffer inteiro e uma visão no meio de outro (o IPC entrega os dois)', () => {
    const grande = bytesDe(20);
    expect(paraBase64(grande.buffer)).toBe(paraBase64(grande));
    const visao = new Uint8Array(grande.buffer, 5, 10);
    expect([...deBase64(paraBase64(visao))!]).toEqual([...grande.slice(5, 15)]);
  });

  it('bytes criados em OUTRO contexto (o que uma ponte entre mundos pode entregar) não viram áudio vazio', () => {
    // `instanceof ArrayBuffer` é falso para o que vem de outro contexto: sem tratar isso, a conversão
    // lia `.buffer` de um ArrayBuffer (indefinido) e devolvia '' — uma gravação "salva" sem som.
    const OutroUint8 = runInNewContext('Uint8Array') as Uint8ArrayConstructor;
    const visao = new OutroUint8([72, 101, 108, 108, 111]);
    const inteiro = visao.buffer;
    expect(inteiro instanceof ArrayBuffer, 'premissa do teste: é de outro contexto').toBe(false);
    expect(paraBase64(inteiro)).toBe('SGVsbG8=');
    expect(paraBase64(visao)).toBe('SGVsbG8=');
  });

  it('um áudio de vários MB não estoura a pilha (String.fromCharCode(...bytes) estoura)', () => {
    const origem = bytesDe(6 * 1024 * 1024);
    const texto = paraBase64(origem);
    expect(texto.length).toBe(Math.ceil(origem.length / 3) * 4);
    const volta = deBase64(texto);
    expect(volta && volta.byteLength === origem.byteLength && Buffer.from(volta).equals(Buffer.from(origem))).toBe(true);
  });
});

describe('deBase64 recusa o que não é base64 — devolve null, não lança nem decide por conta própria', () => {
  it('tamanho que não fecha, letra de fora, preenchimento no meio, espaço e quebra de linha', () => {
    for (const ruim of ['abc', 'abcde', '!!!!', 'AA=A', '====', 'A===', 'AAAA AAAA', 'AAAA\nAAAA', 'AAAA=', 'SGVs bG8=', '😀😀😀😀']) {
      expect(deBase64(ruim), JSON.stringify(ruim)).toBeNull();
      expect(tamanhoDecodificado(ruim), JSON.stringify(ruim)).toBeNull();
    }
  });

  it('não é texto: devolve null', () => {
    for (const ruim of [null, undefined, 42, {}, []]) {
      expect(deBase64(ruim as never)).toBeNull();
      expect(tamanhoDecodificado(ruim as never)).toBeNull();
    }
  });
});

describe('ehBufferDeBytes — o que uma ponte pode entregar como "bytes"', () => {
  it('aceita ArrayBuffer e visões (inclusive de outro contexto); recusa texto, número, nulo e objeto comum', () => {
    const OutroUint8 = runInNewContext('Uint8Array') as Uint8ArrayConstructor;
    for (const bom of [new ArrayBuffer(2), new Uint8Array(2), Buffer.from('ab'), new OutroUint8(2), new OutroUint8(2).buffer]) {
      expect(ehBufferDeBytes(bom)).toBe(true);
    }
    // `new Uint8Array(3)` cria 3 zeros: um número que passasse por bytes viraria silêncio.
    for (const ruim of ['SGVsbG8=', 3, null, undefined, {}, [72, 101]]) {
      expect(ehBufferDeBytes(ruim), String(ruim)).toBe(false);
    }
  });
});

describe('tamanhoDecodificado', () => {
  it('diz quantos bytes o texto vira SEM decodificar — é a conta do limite do backup', () => {
    expect(tamanhoDecodificado('')).toBe(0);
    expect(tamanhoDecodificado('AA==')).toBe(1);
    expect(tamanhoDecodificado('AAA=')).toBe(2);
    expect(tamanhoDecodificado('AAAA')).toBe(3);
    expect(tamanhoDecodificado('SGVsbG8=')).toBe(5);
    for (const n of [0, 1, 2, 3, 10, 1000, 70_001]) expect(tamanhoDecodificado(paraBase64(bytesDe(n))), `n=${n}`).toBe(n);
  });
});

// -----------------------------------------------------------------------------
// Rodada de correção 1 (21/10/2026), Minor 7: decodificar um backup de dezenas de MB
// numa tacada só trava a janela (cada clique, cada animação, o rastreio do olhar).
// `deBase64Async` faz o MESMO que `deBase64`, em blocos, cedendo a vez entre eles.
// -----------------------------------------------------------------------------

describe('deBase64Async — o mesmo resultado de deBase64, sem prender a janela', () => {
  const semEspera = async () => {};

  it('o bloco de leitura é múltiplo de 4 (um grupo de base64 nunca é cortado ao meio)', () => {
    expect(BLOCO_DA_DECODIFICACAO % 4).toBe(0);
  });

  it('volta byte a byte igual, inclusive com vários blocos e com cada sobra do último (0, 1 e 2 bytes)', async () => {
    const bloco = (BLOCO_DA_DECODIFICACAO / 4) * 3; // bytes que enchem exatamente um bloco
    for (const n of [0, 1, 2, 3, 100, bloco - 1, bloco, bloco + 1, bloco + 2, 3 * bloco, 3 * bloco + 1, 3 * bloco + 2, 1_000_003]) {
      const origem = bytesDe(n);
      const volta = await deBase64Async(paraBase64(origem), semEspera);
      expect(volta && volta.byteLength === n && Buffer.from(volta).equals(Buffer.from(origem)), `n=${n}`).toBe(true);
    }
  });

  it('vetor conhecido: "Hello" é SGVsbG8= (conta feita à mão)', async () => {
    expect([...(await deBase64Async('SGVsbG8=', semEspera))!]).toEqual([72, 101, 108, 108, 111]);
  });

  it('recusa o mesmo que deBase64: devolve null, nunca lança nem "conserta"', async () => {
    const ruins: unknown[] = ['abc', 'abcde', '!!!!', 'AA=A', '====', 'A===', 'AAAA AAAA', 'AAAA\nAAAA', 'AAAA=', 'SGVs bG8=', '😀😀😀😀', null, undefined, 42, {}, []];
    for (const ruim of ruins) {
      expect(deBase64(ruim), JSON.stringify(ruim)).toBeNull();
      expect(await deBase64Async(ruim, semEspera), JSON.stringify(ruim)).toBeNull();
    }
  });

  it('o defeito que só aparece num bloco do meio ou do fim é pego: letra de fora, "=" no meio de um bloco e "=" colado ao fim de um bloco que não é o último', async () => {
    const um = 'A'.repeat(BLOCO_DA_DECODIFICACAO);
    const casos: Record<string, string> = {
      'letra de fora no 2º bloco': `${um}${'A'.repeat(BLOCO_DA_DECODIFICACAO - 4)}!AAA${um}`,
      'letra de fora no último bloco': `${um}${um}AA!A`,
      '"=" no fim do 1º bloco, com mais texto depois': `${'A'.repeat(BLOCO_DA_DECODIFICACAO - 1)}=AAAA`,
      '"=" no meio do 2º bloco': `${um}AA==AAAA${'A'.repeat(BLOCO_DA_DECODIFICACAO - 8)}`,
      'preenchimento demais no fim': `${um}A===`,
    };
    for (const [rotulo, texto] of Object.entries(casos)) {
      expect(texto.length % 4, `premissa: ${rotulo}`).toBe(0);
      expect(deBase64(texto), `sync: ${rotulo}`).toBeNull();
      expect(await deBase64Async(texto, semEspera), rotulo).toBeNull();
    }
  });

  it('cede a vez entre os blocos (e só entre eles): n blocos, n-1 esperas', async () => {
    const texto = paraBase64(bytesDe(((4 * BLOCO_DA_DECODIFICACAO) / 4) * 3)); // exatamente 4 blocos de texto
    expect(texto.length).toBe(4 * BLOCO_DA_DECODIFICACAO);
    const ceder = vi.fn(async () => {});

    expect(await deBase64Async(texto, ceder)).not.toBeNull();

    expect(ceder).toHaveBeenCalledTimes(3);
    ceder.mockClear();
    await deBase64Async('SGVsbG8=', ceder); // cabe num bloco só: nada a ceder
    expect(ceder).not.toHaveBeenCalled();
  });

  it('com a espera de verdade, os temporizadores da janela rodam durante a decodificação (a de uma tacada só os deixa parados)', async () => {
    const texto = paraBase64(bytesDe(6 * 1024 * 1024)); // ~8 MB de texto: dezenas de blocos
    let batidas = 0;
    let rodando = true;
    const batida = () => { if (!rodando) return; batidas++; setTimeout(batida, 0); };
    setTimeout(batida, 0);

    const volta = await deBase64Async(texto);
    rodando = false;

    expect(volta?.byteLength).toBe(6 * 1024 * 1024);
    expect(batidas).toBeGreaterThan(0);
  });
});
