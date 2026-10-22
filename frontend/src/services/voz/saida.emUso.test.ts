import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EVENTO_DA_SAIDA_DA_VOZ,
  TETO_DA_TROCA_DE_SAIDA_MS,
  definirSaidaDaVoz,
  esperaDaTrocaDeSaida,
  registrarAlvoDaVoz,
  saidaDaVozEscolhida,
  saidaDaVozPerdida,
  sinalDeTeste,
  _redefinirSaida,
  type DetalheDaSaidaDaVoz,
} from './saida';
import { lerWav } from './vozGuardada/wav';

// -----------------------------------------------------------------------------
// A saída da voz EM USO (roadmap 3, rodada 3): o ajuste escolhido em
// Configurações vale para o `AudioContext` por onde a voz clonada e a voz
// guardada tocam — aplicado ao trocar o ajuste e ao criar o contexto, nunca no
// meio do caminho da fala — e, se o aparelho escolhido some (cabo
// desinstalado), a voz volta para a saída padrão, a tela avisa UMA vez e a
// fala não quebra.
// -----------------------------------------------------------------------------

type Alvo = AudioContext & { setSinkId: ReturnType<typeof vi.fn> };

/** Um contexto de mentira cujo `setSinkId` o teste controla. */
const novoAlvo = (impl: (id: string) => Promise<void> = async () => undefined): Alvo =>
  ({ setSinkId: vi.fn(impl) }) as unknown as Alvo;

const naoEncontrado = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));

/** Deixa as promessas encadeadas andarem. */
const andar = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};

const eventos: boolean[] = [];
const ouvir = (e: Event) => eventos.push((e as CustomEvent<DetalheDaSaidaDaVoz>).detail.perdida);
let aviso: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _redefinirSaida();
  eventos.length = 0;
  window.addEventListener(EVENTO_DA_SAIDA_DA_VOZ, ouvir);
  aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  window.removeEventListener(EVENTO_DA_SAIDA_DA_VOZ, ouvir);
  _redefinirSaida();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a saída padrão não mexe em nada', () => {
  it('com a saída padrão, registrar o contexto não chama setSinkId e não há espera', () => {
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    expect(ctx.setSinkId).not.toHaveBeenCalled();
    expect(esperaDaTrocaDeSaida()).toBeNull();
    expect(saidaDaVozEscolhida()).toBeNull();
    expect(saidaDaVozPerdida()).toBe(false);
  });

  it('escolher a padrão de novo (já era) não chama setSinkId', async () => {
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz(null);
    await andar();
    expect(ctx.setSinkId).not.toHaveBeenCalled();
  });
});

describe('trocar o ajuste', () => {
  it('manda o contexto que já existe para o aparelho escolhido', async () => {
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    // Na hora, sem esperar nada: o setSinkId sai dentro da própria chamada.
    expect(ctx.setSinkId).toHaveBeenCalledTimes(1);
    expect(ctx.setSinkId).toHaveBeenCalledWith('cabo1');
    await andar();
    expect(saidaDaVozEscolhida()).toBe('cabo1');
    expect(saidaDaVozPerdida()).toBe(false);
    expect(eventos).toEqual([]);
  });

  it('um contexto criado DEPOIS da escolha já nasce na saída escolhida', async () => {
    definirSaidaDaVoz('cabo1');
    await andar();
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    expect(ctx.setSinkId).toHaveBeenCalledWith('cabo1');
  });

  it('voltar à saída padrão devolve o contexto ao alto-falante do sistema', async () => {
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    definirSaidaDaVoz(null);
    expect(ctx.setSinkId).toHaveBeenLastCalledWith('');
    await andar();
    expect(saidaDaVozEscolhida()).toBeNull();
  });

  it('a mesma escolha duas vezes não troca de novo (o React repete efeitos)', async () => {
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    definirSaidaDaVoz('cabo1');
    await andar();
    definirSaidaDaVoz('cabo1');
    expect(ctx.setSinkId).toHaveBeenCalledTimes(1);
  });

  it('um valor inválido do disco vira a saída padrão', async () => {
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('   ');
    definirSaidaDaVoz(42 as never);
    await andar();
    expect(ctx.setSinkId).not.toHaveBeenCalled();
    expect(saidaDaVozEscolhida()).toBeNull();
  });

  it('quem desfaz o registro deixa de ser trocado', async () => {
    const ctx = novoAlvo();
    const soltar = registrarAlvoDaVoz(ctx);
    soltar();
    definirSaidaDaVoz('cabo1');
    expect(ctx.setSinkId).not.toHaveBeenCalled();
  });

  it('enquanto a troca está em andamento há uma espera; depois dela, não', async () => {
    let terminar!: () => void;
    const ctx = novoAlvo(() => new Promise<void>((r) => { terminar = r; }));
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    const espera = esperaDaTrocaDeSaida();
    expect(espera).not.toBeNull();
    terminar();
    await expect(espera).resolves.toBeUndefined();
    await andar();
    expect(esperaDaTrocaDeSaida()).toBeNull();
  });

  it('a espera tem teto: um setSinkId que trava não prende a fala', async () => {
    vi.useFakeTimers();
    const ctx = novoAlvo(() => new Promise<void>(() => {}));
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    let esperou = false;
    void esperaDaTrocaDeSaida()!.then(() => { esperou = true; });
    await vi.advanceTimersByTimeAsync(TETO_DA_TROCA_DE_SAIDA_MS - 1);
    expect(esperou).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(esperou).toBe(true);
  });
});

describe('o aparelho escolhido sumiu (cabo desinstalado)', () => {
  /** O 'cabo1' não abre; a saída padrão ('') sempre abre. */
  const semOCabo = () => novoAlvo((id) => (id === 'cabo1' ? naoEncontrado() : Promise.resolve()));

  it('volta para a saída padrão, avisa uma vez e a escolha fica guardada', async () => {
    const ctx = semOCabo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    // Tentou o cabo e, como não abriu, devolveu o contexto à saída padrão.
    expect(ctx.setSinkId.mock.calls.map((c) => c[0])).toEqual(['cabo1', '']);
    expect(saidaDaVozPerdida()).toBe(true);
    // O ajuste continua valendo: se o cabo voltar, a voz volta para ele.
    expect(saidaDaVozEscolhida()).toBe('cabo1');
    // Um aviso na tela, um no console.
    expect(eventos).toEqual([true]);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain('[voz]');
  });

  it('não repete o aviso a cada contexto novo: o aparelho que não abre nem é tentado de novo', async () => {
    const ctx = semOCabo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    const outro = semOCabo();
    registrarAlvoDaVoz(outro);
    await andar();
    // O contexto novo nem tentou o cabo: já se sabe que ele não abre.
    expect(outro.setSinkId).not.toHaveBeenCalled();
    expect(eventos).toEqual([true]);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('os outros motivos de recusa (permissão, aparelho ocupado) também voltam ao padrão', async () => {
    const ctx = novoAlvo((id) => (id === 'cabo1' ? Promise.reject(new DOMException('não', 'NotAllowedError')) : Promise.resolve()));
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    expect(ctx.setSinkId).toHaveBeenLastCalledWith('');
    expect(saidaDaVozPerdida()).toBe(true);
  });

  it('o runtime sem setSinkId: a escolha não pode ser cumprida, e isso aparece', async () => {
    const ctx = {} as unknown as AudioContext;
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    expect(saidaDaVozPerdida()).toBe(true);
    expect(eventos).toEqual([true]);
  });

  it('escolher outro aparelho tira o aviso e aplica o novo', async () => {
    const ctx = semOCabo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    definirSaidaDaVoz('fone1');
    await andar();
    expect(ctx.setSinkId).toHaveBeenLastCalledWith('fone1');
    expect(saidaDaVozPerdida()).toBe(false);
    expect(eventos).toEqual([true, false]);
  });

  it('escolher a saída padrão também tira o aviso', async () => {
    const ctx = semOCabo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    definirSaidaDaVoz(null);
    await andar();
    expect(saidaDaVozPerdida()).toBe(false);
    expect(eventos).toEqual([true, false]);
  });

  it('escolher de novo o mesmo aparelho, estando ele fora, tenta outra vez', async () => {
    let aberto = false;
    const ctx = novoAlvo((id) => (id === 'cabo1' && !aberto ? naoEncontrado() : Promise.resolve()));
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    expect(saidaDaVozPerdida()).toBe(true);
    aberto = true; // o cabo foi reinstalado
    definirSaidaDaVoz('cabo1');
    await andar();
    expect(ctx.setSinkId).toHaveBeenLastCalledWith('cabo1');
    expect(saidaDaVozPerdida()).toBe(false);
    expect(eventos).toEqual([true, false]);
  });

  it('tentar de novo e o aparelho continuar fora: o aviso é um só por perda (nem o console repete)', async () => {
    const ctx = semOCabo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    definirSaidaDaVoz('cabo1'); // "tentar outra vez"
    await andar();
    definirSaidaDaVoz('cabo1');
    await andar();
    // Tentou o cabo de novo (a pessoa pediu), e de novo voltou ao padrão...
    expect(ctx.setSinkId.mock.calls.map((c) => c[0])).toEqual(['cabo1', '', 'cabo1', '', 'cabo1', '']);
    expect(saidaDaVozPerdida()).toBe(true);
    // ...mas a perda é a mesma: um aviso na tela e uma linha no console.
    expect(eventos).toEqual([true]);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('a espera da fala cobre também a volta ao padrão (a fala não começa no aparelho que sumiu)', async () => {
    const ctx = semOCabo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    expect(esperaDaTrocaDeSaida()).not.toBeNull();
    await andar();
    expect(esperaDaTrocaDeSaida()).toBeNull();
  });
});

describe('a última escolha vence', () => {
  it('uma troca lenta que falha DEPOIS de outra escolha não derruba a nova', async () => {
    let recusar!: () => void;
    const ctx = novoAlvo((id) =>
      id === 'a'
        ? new Promise<void>((_ok, nao) => { recusar = () => nao(new DOMException('some', 'NotFoundError')); })
        : Promise.resolve(),
    );
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('a');
    definirSaidaDaVoz('b');
    await andar();
    recusar();
    await andar();
    expect(saidaDaVozEscolhida()).toBe('b');
    expect(saidaDaVozPerdida()).toBe(false);
    expect(eventos).toEqual([]);
    expect(aviso).not.toHaveBeenCalled();
    // E o contexto continua de verdade em 'b': a falha atrasada de 'a' não o
    // devolveu à saída padrão.
    expect(ctx.setSinkId.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });
});

describe('o computador avisa que os aparelhos mudaram (devicechange)', () => {
  /** `navigator.mediaDevices` que o teste controla. */
  const dispositivos = (ids: string[]) => {
    const md = new EventTarget() as EventTarget & { lista: string[]; enumerateDevices: () => Promise<MediaDeviceInfo[]> };
    md.lista = ids;
    md.enumerateDevices = async () =>
      md.lista.map((id) => ({ kind: 'audiooutput', deviceId: id, label: `Aparelho ${id}` }) as MediaDeviceInfo);
    vi.stubGlobal('navigator', { mediaDevices: md });
    return md;
  };
  const mudou = async (md: EventTarget) => {
    md.dispatchEvent(new Event('devicechange'));
    await andar();
  };

  it('o aparelho some no meio da sessão: volta ao padrão e avisa; ao voltar, a voz volta para ele', async () => {
    const md = dispositivos(['spk1', 'cabo1']);
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    expect(saidaDaVozPerdida()).toBe(false);

    md.lista = ['spk1']; // o cabo foi desligado
    await mudou(md);
    expect(ctx.setSinkId).toHaveBeenLastCalledWith('');
    expect(saidaDaVozPerdida()).toBe(true);
    expect(eventos).toEqual([true]);

    md.lista = ['spk1', 'cabo1']; // o cabo voltou
    await mudou(md);
    expect(ctx.setSinkId).toHaveBeenLastCalledWith('cabo1');
    expect(saidaDaVozPerdida()).toBe(false);
    expect(eventos).toEqual([true, false]);
  });

  it('outro aparelho qualquer chega (um fone) e o cabo continua lá: nada muda', async () => {
    const md = dispositivos(['spk1', 'cabo1']);
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    md.lista = ['spk1', 'cabo1', 'fone1'];
    await mudou(md);
    expect(ctx.setSinkId).toHaveBeenCalledTimes(1);
    expect(eventos).toEqual([]);
  });

  it('a lista veio vazia (sem permissão de mídia): não dá para saber, e nada é desfeito', async () => {
    const md = dispositivos(['spk1', 'cabo1']);
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    md.lista = [];
    await mudou(md);
    expect(ctx.setSinkId).toHaveBeenCalledTimes(1);
    expect(saidaDaVozPerdida()).toBe(false);
  });

  it('com a saída padrão ninguém fica ouvindo os aparelhos', async () => {
    const md = dispositivos(['spk1']);
    const ouvinte = vi.spyOn(md, 'addEventListener');
    definirSaidaDaVoz(null);
    expect(ouvinte).not.toHaveBeenCalled();
  });

  it('voltar à saída padrão para de ouvir os aparelhos', async () => {
    const md = dispositivos(['spk1', 'cabo1']);
    const ctx = novoAlvo();
    registrarAlvoDaVoz(ctx);
    definirSaidaDaVoz('cabo1');
    await andar();
    definirSaidaDaVoz(null);
    await andar();
    md.lista = ['spk1'];
    await mudou(md);
    // Só o 'cabo1' e o '' do "voltar ao padrão": o devicechange não mexeu em nada.
    expect(ctx.setSinkId.mock.calls.map((c) => c[0])).toEqual(['cabo1', '']);
    expect(saidaDaVozPerdida()).toBe(false);
  });
});

describe('sinalDeTeste', () => {
  it('é um WAV curto, audível e sem estalo nas pontas', () => {
    const wav = sinalDeTeste();
    const lido = lerWav(wav);
    expect(lido).not.toBeNull();
    const { amostras, taxa } = lido!;
    const segundos = amostras.length / taxa;
    expect(segundos).toBeGreaterThan(0.4);
    expect(segundos).toBeLessThan(1.2);
    let pico = 0;
    for (const x of amostras) {
      expect(Number.isFinite(x)).toBe(true);
      pico = Math.max(pico, Math.abs(x));
    }
    // Audível, mas bem abaixo do máximo: é um sinal de teste, não um alarme.
    expect(pico).toBeGreaterThan(0.1);
    expect(pico).toBeLessThan(0.5);
    expect(Math.abs(amostras[0])).toBeLessThan(0.02);
    expect(Math.abs(amostras[amostras.length - 1])).toBeLessThan(0.02);
  });
});
