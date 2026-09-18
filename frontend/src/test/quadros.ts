/**
 * Relógio de quadros determinístico.
 *
 * Desde que o desenho do cursor foi separado da taxa de inferência (ver
 * `src/interaction/seguidorDeCursor.ts`), a posição NÃO é mais escrita no DOM
 * dentro do callback do engine: o callback alimenta o seguidor e descreve o
 * estilo; quem escreve é o laço de `requestAnimationFrame`, na taxa do display.
 *
 * Um teste que emite uma amostra e lê o DOM na linha seguinte passa a ler o
 * estado ANTERIOR — não porque o cursor parou, mas porque o quadro ainda não
 * aconteceu. O contrato a afirmar continua o mesmo; o que muda é o instante em
 * que ele é observável.
 *
 * Este helper troca `requestAnimationFrame`, `cancelAnimationFrame` e
 * `performance.now` por uma fila e um relógio controlados pelo teste. Os três
 * juntos, e não só o rAF: o seguidor compara o carimbo da amostra (que vem de
 * `performance.now`) com o carimbo do quadro, e misturar relógio real com
 * relógio simulado produziria idades absurdas e interpolação sem sentido.
 *
 * Uso:
 *
 *     const relogio = instalarRelogioDeQuadros();
 *     act(() => emitir(amostra()));
 *     relogio.quadro();            // agora o DOM reflete a amostra
 *     ...
 *     relogio.restaurar();
 */

export interface RelogioDeQuadros {
  /** Avança um quadro e roda os callbacks de rAF pendentes. */
  quadro(): void;
  /** `n` quadros seguidos. */
  quadros(n: number): void;
  /** Instante corrente do relógio simulado, em ms. */
  agoraMs(): number;
  /** Devolve `requestAnimationFrame` e `performance.now` ao que eram. */
  restaurar(): void;
}

/** Passo padrão: 60 Hz, a taxa de display que o laço de pintura assume. */
export const PASSO_DE_QUADRO_MS = 1000 / 60;

export function instalarRelogioDeQuadros(
  opts: { passoMs?: number; inicioMs?: number } = {}
): RelogioDeQuadros {
  const passoMs = opts.passoMs ?? PASSO_DE_QUADRO_MS;
  // Começa longe de zero de propósito: um carimbo falsy esconde bug de
  // inicialização que só aparece na primeira amostra da sessão real.
  let agora = opts.inicioMs ?? 1000;
  let proximoId = 1;
  let pendentes = new Map<number, FrameRequestCallback>();

  const rafOriginal = window.requestAnimationFrame;
  const cafOriginal = window.cancelAnimationFrame;
  const descritorNow = Object.getOwnPropertyDescriptor(performance, 'now');

  window.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    const id = proximoId++;
    pendentes.set(id, cb);
    return id;
  }) as typeof window.requestAnimationFrame;

  window.cancelAnimationFrame = ((id: number): void => {
    pendentes.delete(id);
  }) as typeof window.cancelAnimationFrame;

  Object.defineProperty(performance, 'now', {
    configurable: true,
    writable: true,
    value: () => agora,
  });

  const quadro = (): void => {
    agora += passoMs;
    // Troca a fila ANTES de rodar: o laço se reagenda no topo do próprio
    // callback, e rodar a fila no lugar entraria em recursão infinita.
    const fila = pendentes;
    pendentes = new Map();
    for (const cb of fila.values()) cb(agora);
  };

  return {
    quadro,
    quadros(n: number): void {
      for (let i = 0; i < n; i++) quadro();
    },
    agoraMs: () => agora,
    restaurar(): void {
      window.requestAnimationFrame = rafOriginal;
      window.cancelAnimationFrame = cafOriginal;
      if (descritorNow) Object.defineProperty(performance, 'now', descritorNow);
      else delete (performance as unknown as Record<string, unknown>).now;
      pendentes.clear();
    },
  };
}
