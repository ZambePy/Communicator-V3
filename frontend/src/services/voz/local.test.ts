import { describe, it, expect, vi, beforeEach } from 'vitest';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 14): duas frases
// seguidas tocavam SOBREPOSTAS. O `pararVozClonada()` da frase nova rodava
// antes de a anterior terminar de decodificar; sem nada em `tocando` para
// parar, a anterior chegava ao `start()` depois — junto com a nova.
// -----------------------------------------------------------------------------

/** Um `decodeAudioData` que o teste resolve na ordem que quiser. */
const decodificacoes: Array<(b: AudioBuffer) => void> = [];
const fontes: FonteFalsa[] = [];

class FonteFalsa {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  iniciada = false;
  parada = false;
  connect() {}
  start() {
    this.iniciada = true;
  }
  stop() {
    this.parada = true;
  }
  /** O áudio chegou ao fim. */
  acabar() {
    this.onended?.();
  }
}

class ContextoFalso {
  state = 'running';
  destination = {};
  resume() {
    return Promise.resolve();
  }
  decodeAudioData() {
    return new Promise<AudioBuffer>((resolve) => decodificacoes.push(resolve));
  }
  createBufferSource() {
    const f = new FonteFalsa();
    fontes.push(f);
    return f;
  }
}

vi.stubGlobal('AudioContext', ContextoFalso);

const { tocarWav, pararVozClonada } = await import('./local');

const BUFFER = {} as AudioBuffer;
const WAV = () => new ArrayBuffer(8);
/** Deixa as promessas encadeadas andarem. */
const andar = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  pararVozClonada();
  decodificacoes.length = 0;
  fontes.length = 0;
});

describe('tocarWav', () => {
  it('uma frase sozinha toca e resolve `true` quando acaba', async () => {
    const p = tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    await andar();
    expect(fontes).toHaveLength(1);
    expect(fontes[0].iniciada).toBe(true);
    fontes[0].acabar();
    await expect(p).resolves.toBe(true);
  });

  it('a frase nova chega durante a decodificação da anterior: a anterior NÃO toca', async () => {
    const primeira = tocarWav(WAV());
    await andar();
    const segunda = tocarWav(WAV());
    await andar();
    // A primeira foi encerrada na hora, sem som.
    await expect(primeira).resolves.toBe(false);
    // As duas decodificações terminam — a primeira DEPOIS do pedido da segunda.
    decodificacoes[0](BUFFER);
    decodificacoes[1](BUFFER);
    await andar();
    // Só UMA fonte foi iniciada: a da segunda frase.
    expect(fontes.filter((f) => f.iniciada)).toHaveLength(1);
    expect(fontes).toHaveLength(1);
    fontes[0].acabar();
    await expect(segunda).resolves.toBe(true);
  });

  it('a decodificação da anterior termina por último: mesmo assim ela não toca', async () => {
    void tocarWav(WAV());
    await andar();
    const segunda = tocarWav(WAV());
    await andar();
    decodificacoes[1](BUFFER);
    await andar();
    decodificacoes[0](BUFFER);
    await andar();
    expect(fontes.filter((f) => f.iniciada)).toHaveLength(1);
    fontes[0].acabar();
    await expect(segunda).resolves.toBe(true);
  });

  it('pararVozClonada durante a decodificação: resolve `false` e nada toca depois', async () => {
    const p = tocarWav(WAV());
    await andar();
    pararVozClonada();
    await expect(p).resolves.toBe(false);
    decodificacoes[0](BUFFER);
    await andar();
    expect(fontes).toHaveLength(0);
  });

  it('interrompida no meio do som: resolve `true` (o som saiu) e a fonte é parada', async () => {
    const p = tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    await andar();
    pararVozClonada();
    await expect(p).resolves.toBe(true);
    expect(fontes[0].parada).toBe(true);
  });

  it('aoComecar é chamado quando o som sai, não antes', async () => {
    const aoComecar = vi.fn();
    const p = tocarWav(WAV(), aoComecar);
    await andar();
    expect(aoComecar).not.toHaveBeenCalled();
    decodificacoes[0](BUFFER);
    await andar();
    expect(aoComecar).toHaveBeenCalledTimes(1);
    fontes[0].acabar();
    await p;
  });
});
