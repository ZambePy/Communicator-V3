import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  falarComVozDoSistema,
  falarComVozDoSistemaComDesfecho,
  falaPrioritariaEmCurso,
  PRAZO_PARA_COMECAR_MS,
  tetoDaFalaMs,
  tetoDaPrioridadeMs,
  _redefinirVozDoSistema,
} from './sistema';

// -----------------------------------------------------------------------------
// FE-5: `falarComVozDoSistema` resolvia igual quando a fala terminava e quando
// era interrompida — e o celular do cuidador recebia "falada" para uma
// mensagem cortada pelo alarme. Agora diz se falou, e a fala prioritária (a
// mensagem do cuidador) fica marcada enquanto toca.
//
// Relato de 18/10/2026 (auditoria, item 9): o teto por tamanho resolvia
// `true` mesmo quando a fala NEM COMEÇOU (sistema sem voz, sintetizador
// travado), e a marca prioritária caía nesse teto de 20 s antes do fim de uma
// mensagem longa — o alarme voltava a cortar a resposta do cuidador.
// -----------------------------------------------------------------------------

type Utt = {
  text: string;
  onstart?: () => void;
  onend?: () => void;
  onerror?: (e: { error: string }) => void;
};

function vozFalsa(comportamento: (u: Utt) => void) {
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn(comportamento) });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string;
      lang = '';
      rate = 1;
      onstart?: () => void;
      onend?: () => void;
      onerror?: () => void;
      constructor(t: string) {
        this.text = t;
      }
    },
  );
}

beforeEach(() => {
  _redefinirVozDoSistema();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('voz do sistema', () => {
  it('começou e terminou: true', async () => {
    vozFalsa((u) => {
      u.onstart?.();
      u.onend?.();
    });
    await expect(falarComVozDoSistema('oi')).resolves.toBe(true);
  });

  it('interrompida: false, e o desfecho diz que foi interrupção (não defeito)', async () => {
    vozFalsa((u) => u.onerror?.({ error: 'interrupted' }));
    await expect(falarComVozDoSistema('oi')).resolves.toBe(false);
    vozFalsa((u) => u.onerror?.({ error: 'canceled' }));
    await expect(falarComVozDoSistemaComDesfecho('oi')).resolves.toEqual({ falou: false, motivo: 'interrompida' });
  });

  it('erro do sintetizador: false, motivo "erro"', async () => {
    vozFalsa((u) => u.onerror?.({ error: 'synthesis-failed' }));
    await expect(falarComVozDoSistemaComDesfecho('oi')).resolves.toEqual({ falou: false, motivo: 'erro' });
  });

  it('sem voz no sistema ou sem texto: false', async () => {
    await expect(falarComVozDoSistemaComDesfecho('oi')).resolves.toEqual({ falou: false, motivo: 'sem_voz' });
    vozFalsa((u) => u.onend?.());
    await expect(falarComVozDoSistemaComDesfecho('   ')).resolves.toEqual({ falou: false, motivo: 'texto' });
  });

  it('a fala NEM COMEÇOU (sintetizador travado, sem voz instalada): não conta como falada', async () => {
    vi.useFakeTimers();
    vozFalsa(() => {});
    const p = falarComVozDoSistemaComDesfecho('abc');
    // Antes: resolvia `true` no teto por tamanho (2,2 s para "abc").
    await vi.advanceTimersByTimeAsync(tetoDaFalaMs('abc') + 100);
    let resolvida = false;
    void p.then(() => { resolvida = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolvida).toBe(false); // o prazo para começar ainda não acabou
    await vi.advanceTimersByTimeAsync(PRAZO_PARA_COMECAR_MS);
    await expect(p).resolves.toEqual({ falou: false, motivo: 'nao_comecou' });
  });

  it('começou e o Chromium esqueceu de avisar o fim: o teto conta como falada', async () => {
    vi.useFakeTimers();
    vozFalsa((u) => u.onstart?.());
    const p = falarComVozDoSistema('abc');
    await vi.advanceTimersByTimeAsync(Math.max(tetoDaFalaMs('abc'), PRAZO_PARA_COMECAR_MS) + 10);
    await expect(p).resolves.toBe(true);
  });

  it('aoComecar é chamado quando o som começa, e só então', async () => {
    let comecar: () => void = () => {};
    let terminar: () => void = () => {};
    vozFalsa((u) => {
      comecar = () => u.onstart?.();
      terminar = () => u.onend?.();
    });
    const aoComecar = vi.fn();
    const p = falarComVozDoSistema('oi', { aoComecar });
    expect(aoComecar).not.toHaveBeenCalled();
    comecar();
    expect(aoComecar).toHaveBeenCalledTimes(1);
    terminar();
    await expect(p).resolves.toBe(true);
  });

  it('começou DEPOIS de dar como "não saiu": não acende nada na tela', async () => {
    vi.useFakeTimers();
    let comecar: () => void = () => {};
    vozFalsa((u) => { comecar = () => u.onstart?.(); });
    const aoComecar = vi.fn();
    const p = falarComVozDoSistemaComDesfecho('abc', { aoComecar });
    await vi.advanceTimersByTimeAsync(PRAZO_PARA_COMECAR_MS + 10);
    await expect(p).resolves.toEqual({ falou: false, motivo: 'nao_comecou' });
    comecar();
    expect(aoComecar).not.toHaveBeenCalled();
  });
});

describe('fala prioritária (a mensagem do cuidador)', () => {
  it('fica marcada enquanto toca, e só ela', async () => {
    let terminar: () => void = () => {};
    vozFalsa((u) => { u.onstart?.(); terminar = () => u.onend?.(); });
    const p = falarComVozDoSistema('Estou chegando', { prioritaria: true });
    expect(falaPrioritariaEmCurso()).toBe(true);
    terminar();
    await p;
    expect(falaPrioritariaEmCurso()).toBe(false);

    const q = falarComVozDoSistema('comum');
    expect(falaPrioritariaEmCurso()).toBe(false);
    terminar();
    await q;
  });

  it('mensagem longa: o teto de 20 s responde, mas a marca só cai no onend', async () => {
    vi.useFakeTimers();
    const longa = 'Estou chegando, separei o remédio e já vou subir. '.repeat(8); // ~400 caracteres
    let terminar: () => void = () => {};
    vozFalsa((u) => { u.onstart?.(); terminar = () => u.onend?.(); });
    const p = falarComVozDoSistema(longa, { prioritaria: true });
    await vi.advanceTimersByTimeAsync(20_000 + 10);
    // Começou: a resposta sai no teto (o celular recebe "ouvida")...
    await expect(p).resolves.toBe(true);
    // ...mas a fala continua, e o alarme não pode cortá-la.
    expect(falaPrioritariaEmCurso()).toBe(true);
    terminar();
    expect(falaPrioritariaEmCurso()).toBe(false);
  });

  it('sem onend nem onerror, a marca cai pelo teto de segurança contado do onstart', async () => {
    vi.useFakeTimers();
    const texto = 'Já estou indo';
    vozFalsa((u) => u.onstart?.());
    void falarComVozDoSistema(texto, { prioritaria: true });
    await vi.advanceTimersByTimeAsync(tetoDaPrioridadeMs(texto) - 100);
    expect(falaPrioritariaEmCurso()).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(falaPrioritariaEmCurso()).toBe(false);
  });

  it('o teto de segurança é maior que o da resposta', () => {
    for (const n of [3, 40, 200, 1000]) {
      const t = 'x'.repeat(n);
      expect(tetoDaPrioridadeMs(t)).toBeGreaterThan(tetoDaFalaMs(t));
    }
  });

  it('prioritária que nunca começou: a marca cai junto com o prazo (não há o que proteger)', async () => {
    vi.useFakeTimers();
    vozFalsa(() => {});
    const p = falarComVozDoSistema('Estou chegando', { prioritaria: true });
    expect(falaPrioritariaEmCurso()).toBe(true);
    await vi.advanceTimersByTimeAsync(Math.max(tetoDaFalaMs('Estou chegando'), PRAZO_PARA_COMECAR_MS) + 10);
    await expect(p).resolves.toBe(false);
    expect(falaPrioritariaEmCurso()).toBe(false);
  });

  it('interrompida pelo alarme: a marca cai e a resposta é false', async () => {
    let interromper: () => void = () => {};
    vozFalsa((u) => { u.onstart?.(); interromper = () => u.onerror?.({ error: 'interrupted' }); });
    const p = falarComVozDoSistema('Estou chegando', { prioritaria: true });
    interromper();
    await expect(p).resolves.toBe(false);
    expect(falaPrioritariaEmCurso()).toBe(false);
  });
});

// Revisão final, rodada 1 (M2): a pergunta do cuidador sai da frente quando a
// Emergência abre, e a fala prioritária dela seguia até o fim (até 120 s para
// um texto de 2000 caracteres): o "ALERTA MÉDICO" entrava na fila atrás dela e
// o "ALERTA CRÍTICO" era pulado pela marca. Quem fala pode passar um sinal
// para PARAR só a SUA fala.
describe('parar a própria fala (sinal)', () => {
  it('abortar a fala em curso a para, solta a marca prioritária e diz que foi interrompida', async () => {
    vozFalsa((u) => u.onstart?.());
    const parar = new AbortController();
    const p = falarComVozDoSistemaComDesfecho('Você está com dor?', { prioritaria: true, sinal: parar.signal });
    expect(falaPrioritariaEmCurso()).toBe(true);
    const cancelAntes = (window.speechSynthesis.cancel as ReturnType<typeof vi.fn>).mock.calls.length;
    parar.abort();
    await expect(p).resolves.toEqual({ falou: false, motivo: 'interrompida' });
    expect(falaPrioritariaEmCurso()).toBe(false);
    // Parou a fala: UM cancel a mais, só por causa do sinal.
    expect((window.speechSynthesis.cancel as ReturnType<typeof vi.fn>).mock.calls.length).toBe(cancelAntes + 1);
  });

  it('a fala que já terminou não é tocada pelo sinal: a de OUTRO que está falando agora não é cortada', async () => {
    vozFalsa((u) => { u.onstart?.(); u.onend?.(); });
    const parar = new AbortController();
    await expect(falarComVozDoSistema('oi', { prioritaria: true, sinal: parar.signal })).resolves.toBe(true);
    const cancelAntes = (window.speechSynthesis.cancel as ReturnType<typeof vi.fn>).mock.calls.length;
    parar.abort();
    expect((window.speechSynthesis.cancel as ReturnType<typeof vi.fn>).mock.calls.length).toBe(cancelAntes);
  });

  it('a fala interrompida por outra (onerror) também não é "parada" de novo pelo sinal', async () => {
    let interromper: () => void = () => {};
    vozFalsa((u) => { u.onstart?.(); interromper = () => u.onerror?.({ error: 'interrupted' }); });
    const parar = new AbortController();
    const p = falarComVozDoSistemaComDesfecho('oi', { sinal: parar.signal });
    interromper();
    await p;
    const cancelAntes = (window.speechSynthesis.cancel as ReturnType<typeof vi.fn>).mock.calls.length;
    parar.abort();
    expect((window.speechSynthesis.cancel as ReturnType<typeof vi.fn>).mock.calls.length).toBe(cancelAntes);
  });

  it('sinal já abortado: não fala nada e não corta a fala de quem está falando', async () => {
    vozFalsa(() => {});
    const parar = new AbortController();
    parar.abort();
    await expect(falarComVozDoSistemaComDesfecho('oi', { sinal: parar.signal })).resolves.toEqual({ falou: false, motivo: 'interrompida' });
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    expect(window.speechSynthesis.cancel).not.toHaveBeenCalled();
    expect(falaPrioritariaEmCurso()).toBe(false);
  });

  it('sem sinal, nada muda: a fala segue como sempre', async () => {
    vozFalsa((u) => { u.onstart?.(); u.onend?.(); });
    await expect(falarComVozDoSistema('oi')).resolves.toBe(true);
  });
});
