import { describe, it, expect } from 'vitest';
import {
  PlanejadorDoCursor,
  transicaoDoPasso,
  DURACAO_DA_SACADA_MS,
  DURACAO_MAXIMA_MS,
  DURACAO_MINIMA_MS,
} from './cursorNoCompositor';
import { DISTANCIA_DE_SALTO_PX } from './seguidorDeCursor';

// Gravação de 30/09: o cursor andava aos degraus porque o laço de rAF que o
// interpolava divide a thread com o MediaPipe. O planejador decide destino e
// duração de cada travessia; quem desenha os quadros é o compositor.

/** Amostras a `hz`, andando `passoPx` na horizontal. Devolve os passos planejados. */
function amostras(p: PlanejadorDoCursor, n: number, hz: number, passoPx: number, x0 = 400, t0 = 1000) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(p.passo({ x: x0 + i * passoPx, y: 300, tMs: t0 + (i * 1000) / hz }));
  return out;
}

describe('planejador do cursor pelo compositor', () => {
  it('a primeira amostra aparece no lugar, sem travessia', () => {
    const p = new PlanejadorDoCursor();
    expect(p.passo({ x: 500, y: 300, tMs: 10 })).toEqual({ x: 500, y: 300, duracaoMs: 0 });
  });

  it('a 30 Hz a travessia dura um intervalo: o cursor chega quando a próxima amostra chega', () => {
    const passos = amostras(new PlanejadorDoCursor(), 10, 30, 5);
    for (const passo of passos.slice(1)) expect(passo!.duracaoMs).toBe(33);
  });

  it('câmera a 15 quadros/s: travessia de ~67 ms; muito lenta, presa no teto', () => {
    expect(amostras(new PlanejadorDoCursor(), 6, 15, 5).at(-1)!.duracaoMs).toBe(67);
    expect(amostras(new PlanejadorDoCursor(), 6, 4, 5).at(-1)!.duracaoMs).toBe(DURACAO_MAXIMA_MS);
  });

  it('câmera rápida demais não pede travessia menor que um quadro de display', () => {
    expect(amostras(new PlanejadorDoCursor(), 6, 120, 1).at(-1)!.duracaoMs).toBe(DURACAO_MINIMA_MS);
  });

  it('a mediana dos intervalos ignora um quadro perdido isolado', () => {
    const p = new PlanejadorDoCursor();
    const ts = [0, 33, 66, 166, 199, 232];
    let ultimo = null;
    for (const t of ts) ultimo = p.passo({ x: 400 + t / 10, y: 300, tMs: t });
    expect(ultimo!.duracaoMs).toBe(33);
  });

  it('sacada atravessa em ~1 quadro: o olho já está lá', () => {
    const p = new PlanejadorDoCursor();
    amostras(p, 5, 30, 2);
    const salto = p.passo({ x: 408 + DISTANCIA_DE_SALTO_PX + 50, y: 300, tMs: 1000 + (5 * 1000) / 30 });
    expect(salto!.duracaoMs).toBe(DURACAO_DA_SACADA_MS);
  });

  it('amostra relida (mesmo carimbo) ou inválida não produz passo', () => {
    const p = new PlanejadorDoCursor();
    p.passo({ x: 500, y: 300, tMs: 100 });
    expect(p.passo({ x: 510, y: 300, tMs: 100 })).toBeNull();
    expect(p.passo({ x: 510, y: 300, tMs: 90 })).toBeNull();
    expect(p.passo({ x: NaN, y: 300, tMs: 200 })).toBeNull();
  });

  it('depois de reiniciar (cursor escondido e de volta), aparece no lugar de novo', () => {
    const p = new PlanejadorDoCursor();
    amostras(p, 5, 30, 5);
    p.reiniciar();
    expect(p.idadeMs(5000)).toBeNull();
    expect(p.passo({ x: 900, y: 700, tMs: 5000 })).toEqual({ x: 900, y: 700, duracaoMs: 0 });
  });

  it('a idade da última amostra alimenta o aviso de fonte seca', () => {
    const p = new PlanejadorDoCursor();
    p.passo({ x: 1, y: 1, tMs: 1000 });
    expect(p.idadeMs(1350)).toBe(350);
    expect(p.idadeMs(900)).toBe(0);
  });

  it('a propriedade `transition` leva a travessia e as outras transições do elemento', () => {
    expect(transicaoDoPasso(33)).toBe('transform 33ms linear');
    expect(transicaoDoPasso(0, 'opacity 600ms ease 300ms')).toBe('transform 0ms linear, opacity 600ms ease 300ms');
    expect(transicaoDoPasso(33.4)).toBe('transform 33ms linear');
  });
});
