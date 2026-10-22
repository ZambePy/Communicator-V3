import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -----------------------------------------------------------------------------
// A voz clonada e a voz guardada tocam por UM `AudioContext` (`tocarWav`). É
// nele que a saída escolhida para as chamadas (o cabo de áudio virtual) vale
// (roadmap 3, rodada 3, de 21/10/2026).
//
// O combinado de latência: aplicar a saída não pode atrasar o início da fala.
// Por isso ela é aplicada ao trocar o ajuste e ao criar o contexto — e o
// caminho da fala só espera quando uma troca AINDA está em andamento (a
// primeira fala depois de abrir o app ou de trocar o ajuste), com teto.
// -----------------------------------------------------------------------------

const decodificacoes: Array<(b: AudioBuffer) => void> = [];
const fontes: FonteFalsa[] = [];
const contextos: ContextoFalso[] = [];

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
  acabar() {
    this.onended?.();
  }
}

/** O que o teste faz com o `setSinkId` do próximo contexto. */
let comportamentoDoSinkId: (id: string) => Promise<void> = async () => undefined;

class ContextoFalso {
  state = 'running';
  destination = {};
  setSinkId = vi.fn((id: string) => comportamentoDoSinkId(id));
  constructor() {
    contextos.push(this);
  }
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

const BUFFER = {} as AudioBuffer;
const WAV = () => new ArrayBuffer(8);
const andar = async (n = 25) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};
/** Quantas microtarefas até a condição valer (teto de 50). */
const ticksAte = async (cond: () => boolean) => {
  let n = 0;
  while (!cond() && n < 50) {
    await Promise.resolve();
    n++;
  }
  return n;
};

/** Módulos novos a cada teste: o contexto e a saída em uso são estado de módulo. */
async function carregar() {
  vi.resetModules();
  const saida = await import('./saida');
  const local = await import('./local');
  return { saida, local };
}

beforeEach(() => {
  decodificacoes.length = 0;
  fontes.length = 0;
  contextos.length = 0;
  comportamentoDoSinkId = async () => undefined;
  vi.stubGlobal('AudioContext', ContextoFalso);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sem escolher saída nenhuma (quase todo mundo)', () => {
  it('o contexto nasce e toca sem nenhuma chamada a setSinkId', async () => {
    const { local } = await carregar();
    const p = local.tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    await andar();
    expect(contextos).toHaveLength(1);
    expect(contextos[0].setSinkId).not.toHaveBeenCalled();
    expect(fontes[0].iniciada).toBe(true);
    fontes[0].acabar();
    await expect(p).resolves.toBe(true);
  });
});

describe('com uma saída escolhida (o cabo das chamadas)', () => {
  it('o contexto é criado já ao aplicar o ajuste, e a primeira fala não mexe mais na saída', async () => {
    const { saida, local } = await carregar();
    local.usarSaidaDaVoz('cabo1');
    // Antes de qualquer fala: o contexto já existe e já foi para o cabo.
    expect(contextos).toHaveLength(1);
    expect(contextos[0].setSinkId).toHaveBeenCalledTimes(1);
    expect(contextos[0].setSinkId).toHaveBeenCalledWith('cabo1');
    await andar();
    expect(saida.saidaDaVozPerdida()).toBe(false);

    const p = local.tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    await andar();
    expect(contextos).toHaveLength(1);
    expect(contextos[0].setSinkId).toHaveBeenCalledTimes(1);
    expect(fontes[0].iniciada).toBe(true);
    fontes[0].acabar();
    await expect(p).resolves.toBe(true);
  });

  it('com a troca já terminada, a fala começa na MESMA microtarefa de quem nunca escolheu saída', async () => {
    // Referência: sem saída escolhida.
    const referencia = await carregar();
    void referencia.local.tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    const semSaida = await ticksAte(() => fontes[0]?.iniciada === true);

    // Com o cabo escolhido e a troca terminada.
    decodificacoes.length = 0;
    fontes.length = 0;
    contextos.length = 0;
    const { local } = await carregar();
    local.usarSaidaDaVoz('cabo1');
    await andar();
    void local.tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    const comSaida = await ticksAte(() => fontes[0]?.iniciada === true);

    expect(semSaida).toBeLessThan(50);
    expect(comSaida).toBe(semSaida);
  });

  it('a fala que chega no meio da troca espera por ela (para não sair pelo alto-falante da sala)', async () => {
    let abrir!: () => void;
    comportamentoDoSinkId = () => new Promise<void>((r) => { abrir = r; });
    const { local } = await carregar();
    local.usarSaidaDaVoz('cabo1');
    const p = local.tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    await andar();
    // O áudio já está decodificado, mas o cabo ainda não abriu: a fonte não parte.
    expect(fontes).toHaveLength(0);
    abrir();
    await andar();
    expect(fontes[0].iniciada).toBe(true);
    fontes[0].acabar();
    await expect(p).resolves.toBe(true);
  });

  it('se a troca trava, a fala parte quando o teto acaba (nunca fica muda)', async () => {
    vi.useFakeTimers();
    comportamentoDoSinkId = () => new Promise<void>(() => {});
    const { saida, local } = await carregar();
    local.usarSaidaDaVoz('cabo1');
    const p = local.tocarWav(WAV());
    await vi.advanceTimersByTimeAsync(0);
    decodificacoes[0](BUFFER);
    await vi.advanceTimersByTimeAsync(saida.TETO_DA_TROCA_DE_SAIDA_MS - 10);
    expect(fontes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(20);
    expect(fontes[0].iniciada).toBe(true);
    fontes[0].acabar();
    await expect(p).resolves.toBe(true);
  });

  it('parar a voz durante a espera da troca encerra a fala sem tocar', async () => {
    let abrir!: () => void;
    comportamentoDoSinkId = () => new Promise<void>((r) => { abrir = r; });
    const { local } = await carregar();
    local.usarSaidaDaVoz('cabo1');
    const p = local.tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    await andar();
    local.pararVozClonada();
    await expect(p).resolves.toBe(false);
    abrir();
    await andar();
    expect(fontes).toHaveLength(0);
  });

  it('uma fala nova durante a espera da troca vence: a anterior não toca', async () => {
    let abrir!: () => void;
    comportamentoDoSinkId = () => new Promise<void>((r) => { abrir = r; });
    const { local } = await carregar();
    local.usarSaidaDaVoz('cabo1');
    const primeira = local.tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    await andar();
    const segunda = local.tocarWav(WAV());
    await expect(primeira).resolves.toBe(false);
    await andar();
    decodificacoes[1](BUFFER);
    abrir();
    await andar();
    expect(fontes.filter((f) => f.iniciada)).toHaveLength(1);
    fontes[0].acabar();
    await expect(segunda).resolves.toBe(true);
  });

  it('o cabo sumiu (desinstalado): a fala NÃO quebra — sai pela saída padrão, e a perda é registrada', async () => {
    comportamentoDoSinkId = (id) =>
      id === 'cabo1' ? Promise.reject(new DOMException('Requested device not found', 'NotFoundError')) : Promise.resolve();
    const { saida, local } = await carregar();
    local.usarSaidaDaVoz('cabo1');
    const p = local.tocarWav(WAV());
    await andar();
    decodificacoes[0](BUFFER);
    await andar();
    // Tentou o cabo, voltou ao padrão, e a frase tocou.
    expect(contextos[0].setSinkId.mock.calls.map((c) => c[0])).toEqual(['cabo1', '']);
    expect(saida.saidaDaVozPerdida()).toBe(true);
    expect(fontes[0].iniciada).toBe(true);
    fontes[0].acabar();
    await expect(p).resolves.toBe(true);
  });

  it('trocar o ajuste depois volta o contexto que já existe para a saída padrão', async () => {
    const { local } = await carregar();
    local.usarSaidaDaVoz('cabo1');
    await andar();
    local.usarSaidaDaVoz(null);
    expect(contextos).toHaveLength(1);
    expect(contextos[0].setSinkId).toHaveBeenLastCalledWith('');
  });

  it('o contexto é criado uma vez só, mesmo com o ajuste repetido e várias falas', async () => {
    const { local } = await carregar();
    local.usarSaidaDaVoz('cabo1');
    local.usarSaidaDaVoz('cabo1');
    await andar();
    void local.tocarWav(WAV());
    await andar();
    void local.tocarWav(WAV());
    await andar();
    expect(contextos).toHaveLength(1);
    expect(contextos[0].setSinkId).toHaveBeenCalledTimes(1);
  });

  it('sem Web Audio no computador, aplicar o ajuste não lança (a primeira fala é que explica)', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { local } = await carregar();
    expect(() => local.usarSaidaDaVoz('cabo1')).not.toThrow();
  });

  it('um AudioContext que lança ao nascer não derruba quem aplica o ajuste', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('muitos contextos abertos');
        }
      },
    );
    const { local } = await carregar();
    expect(() => local.usarSaidaDaVoz('cabo1')).not.toThrow();
  });
});
