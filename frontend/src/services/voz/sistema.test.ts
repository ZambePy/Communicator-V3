import { describe, it, expect, vi, afterEach } from 'vitest';
import { falarComVozDoSistema, falaPrioritariaEmCurso } from './sistema';

// -----------------------------------------------------------------------------
// FE-5: `falarComVozDoSistema` resolvia igual quando a fala terminava e quando
// era interrompida — e o celular do cuidador recebia "falada" para uma
// mensagem cortada pelo alarme. Agora diz se falou, e a fala prioritária (a
// mensagem do cuidador) fica marcada enquanto toca.
// -----------------------------------------------------------------------------

type Utt = { text: string; onend?: () => void; onerror?: (e: { error: string }) => void };

function vozFalsa(comportamento: (u: Utt) => void) {
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn(comportamento) });
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; rate = 1; onend?: () => void; onerror?: () => void; constructor(t: string) { this.text = t; } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('voz do sistema', () => {
  it('terminou: true', async () => {
    vozFalsa((u) => u.onend?.());
    await expect(falarComVozDoSistema('oi')).resolves.toBe(true);
  });

  it('interrompida ou com erro: false', async () => {
    vozFalsa((u) => u.onerror?.({ error: 'interrupted' }));
    await expect(falarComVozDoSistema('oi')).resolves.toBe(false);
  });

  it('sem voz no sistema ou sem texto: false', async () => {
    await expect(falarComVozDoSistema('oi')).resolves.toBe(false);
    vozFalsa((u) => u.onend?.());
    await expect(falarComVozDoSistema('   ')).resolves.toBe(false);
  });

  it('o Chromium esqueceu de avisar o fim: o teto por tamanho conta como falada', async () => {
    vi.useFakeTimers();
    vozFalsa(() => {});
    const p = falarComVozDoSistema('abc');
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toBe(true);
  });

  it('fala prioritária fica marcada enquanto toca, e só ela', async () => {
    let terminar: () => void = () => {};
    vozFalsa((u) => { terminar = () => u.onend?.(); });
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
});
