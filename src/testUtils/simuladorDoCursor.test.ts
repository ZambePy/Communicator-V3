import { describe, expect, it } from 'vitest';
import {
  simularCompositor,
  reamostrar,
  passosPorQuadro,
  histogramaDosPassos,
  fracaoCongelada,
  congelamentosSeguidosDeSalto,
  paradasNoMeioDoMovimento,
  recuos,
  QUADRO_60HZ_MS,
} from './simuladorDoCursor';

// O simulador reproduz o que o compositor desenha: cada passo do planejador
// vira uma transição CSS de `transform` que parte de onde o cursor ESTÁ no
// quadro em que o passo é aplicado. As métricas são as mesmas que a análise
// quadro a quadro do vídeo do usuário usa (30 fps, limiar de 1,5 px parado).

describe('simularCompositor', () => {
  it('uma travessia linear de 100 px em 100 ms anda um pouco a cada quadro de 60 Hz, sem parar no meio', () => {
    const q = simularCompositor(
      [{ tMs: 0, x: 0, y: 0, duracaoMs: 0 }, { tMs: 100, x: 100, y: 0, duracaoMs: 100 }],
      { fimMs: 250 },
    );
    const durante = q.filter((f) => f.tMs > 100 && f.tMs <= 200);
    expect(durante.length).toBeGreaterThanOrEqual(5);
    const passos = passosPorQuadro(q.filter((f) => f.tMs >= 100 && f.tMs <= 200));
    for (const p of passos) expect(p).toBeGreaterThan(10);
    expect(q[q.length - 1].x).toBeCloseTo(100, 6);
  });

  it('um passo novo no meio da travessia parte de onde o cursor está, sem salto', () => {
    const q = simularCompositor(
      [
        { tMs: 0, x: 0, y: 0, duracaoMs: 0 },
        { tMs: 100, x: 100, y: 0, duracaoMs: 100 },
        { tMs: 150, x: 0, y: 0, duracaoMs: 100 },
      ],
      { fimMs: 400 },
    );
    const passos = passosPorQuadro(q);
    expect(Math.max(...passos)).toBeLessThan(25);
  });

  it('duração zero aparece no lugar no quadro em que o passo é aplicado', () => {
    const q = simularCompositor(
      [{ tMs: 0, x: 0, y: 0, duracaoMs: 0 }, { tMs: 50, x: 300, y: 40, duracaoMs: 0 }],
      { fimMs: 120 },
    );
    const depois = q.find((f) => f.tMs >= 50)!;
    expect(depois.x).toBe(300);
    expect(depois.y).toBe(40);
  });

  it('o passo só vale no primeiro quadro de display depois do commit da thread principal', () => {
    const q = simularCompositor(
      [{ tMs: 0, x: 0, y: 0, duracaoMs: 0 }, { tMs: 20, x: 90, y: 0, duracaoMs: 0 }],
      { fimMs: 80, atrasoDeCommitMs: 30 },
    );
    // 20 + 30 = 50 ms → primeiro quadro de 60 Hz em 50,0 ms (3 × 16,67).
    expect(q.filter((f) => f.tMs < 50).every((f) => f.x === 0)).toBe(true);
    expect(q.find((f) => f.tMs >= 50)!.x).toBe(90);
  });

  // Medido no Chromium em 06/11/2026: a transição escrita no fim de um quadro
  // que já gastou 30–46 ms na thread principal ganha como início o
  // `document.timeline.currentTime` do COMEÇO do quadro. Ela chega ao
  // compositor com esse tempo já corrido.
  it('com o relógio do quadro congelado, a transição já chega adiantada ao compositor', () => {
    const passos = [
      { tMs: 0, x: 0, y: 0, duracaoMs: 0 },
      { tMs: 130, relogioMs: 100, x: 100, y: 0, duracaoMs: 40 },
    ];
    const q = simularCompositor(passos, { fimMs: 250 });
    // Aplicada no quadro de 133,3 ms, já com 33,3 ms dos 40 corridos.
    const primeiro = q.find((f) => f.tMs >= 130)!;
    expect(primeiro.x).toBeGreaterThan(80);
    const semRelogio = simularCompositor([passos[0], { ...passos[1], relogioMs: undefined }], { fimMs: 250 });
    expect(semRelogio.find((f) => f.tMs >= 130)!.x).toBeLessThan(5);
  });

  it('o ponto de partida é onde a transição anterior estava no relógio congelado', () => {
    const q = simularCompositor(
      [
        { tMs: 0, x: 0, y: 0, duracaoMs: 0 },
        { tMs: 50, x: 100, y: 0, duracaoMs: 100 },
        // Escrita aos 110 ms, num quadro que começou aos 83,3 ms.
        { tMs: 110, relogioMs: 83.3, x: 100, y: 100, duracaoMs: 100 },
      ],
      { fimMs: 300 },
    );
    // A anterior estava em x ≈ 33 aos 83,3 ms; a nova vai de lá até (100, 100).
    const fim = q[q.length - 1];
    expect(fim.x).toBeCloseTo(100, 6);
    const logoDepois = q.find((f) => f.tMs >= 116)!;
    expect(logoDepois.x).toBeLessThan(60);
  });

  // Animação web (`el.animate`) com o ponto de partida calculado: começa
  // exatamente de `de`, no instante da escrita, sem o relógio congelado.
  it('animação web: parte de `de` no instante da escrita', () => {
    const q = simularCompositor(
      [
        { tMs: 0, x: 0, y: 0, duracaoMs: 0 },
        { tMs: 100, deX: 40, deY: 0, x: 140, y: 0, duracaoMs: 100 },
      ],
      { fimMs: 300 },
    );
    const em = (t: number) => q.find((f) => f.tMs >= t - 1e-6)!;
    // Aplicada no quadro de 100 ms, a partir de x = 40 (e não de 0, onde estava).
    expect(em(100).x).toBeCloseTo(40, 6);
    expect(em(150).x).toBeCloseTo(90, 0);
    expect(em(250).x).toBeCloseTo(140, 6);
  });

  it('easing de saída rápida chega mais perto do destino no primeiro quadro que o linear', () => {
    const base = [{ tMs: 0, x: 0, y: 0, duracaoMs: 0 }];
    const linear = simularCompositor([...base, { tMs: 100, x: 100, y: 0, duracaoMs: 80 }], { fimMs: 200 });
    const saida = simularCompositor(
      [...base, { tMs: 100, x: 100, y: 0, duracaoMs: 80, easing: (u: number) => 1 - (1 - u) ** 3 }],
      { fimMs: 200 },
    );
    const t = 100 + 2 * QUADRO_60HZ_MS;
    const em = (qs: { tMs: number; x: number }[]) => qs.find((f) => f.tMs >= t - 1e-6)!.x;
    expect(em(saida)).toBeGreaterThan(em(linear));
  });
});

describe('métricas do movimento', () => {
  const serie = (xs: number[]) => xs.map((x, i) => ({ tMs: i * 33.33, x, y: 0 }));

  it('reamostra a 30 Hz pegando um quadro a cada dois de 60 Hz', () => {
    const q = Array.from({ length: 10 }, (_, i) => ({ tMs: i * QUADRO_60HZ_MS, x: i, y: 0 }));
    expect(reamostrar(q, 30).map((f) => f.x)).toEqual([0, 2, 4, 6, 8]);
  });

  it('conta como congelado o passo abaixo de 1,5 px', () => {
    // Passos: 0, 1, 9, 0, 0 → quatro abaixo de 1,5 px.
    const passos = passosPorQuadro(serie([0, 0, 1, 10, 10, 10]));
    expect(fracaoCongelada(passos)).toBeCloseTo(4 / 5, 6);
  });

  it('o histograma usa as faixas da análise do vídeo', () => {
    expect(histogramaDosPassos([0, 2, 6, 20, 50, 100, 300])).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('acha o congelamento seguido de salto', () => {
    const passos = [0, 0, 0, 0, 0, 120, 0, 0, 5, 0, 0, 0, 0, 90, 2];
    expect(congelamentosSeguidosDeSalto(passos, { minQuadros: 4, saltoPx: 80 })).toBe(2);
    expect(congelamentosSeguidosDeSalto(passos, { minQuadros: 5, saltoPx: 80 })).toBe(1);
  });

  it('conta o recuo: o quadro em que o cursor se afasta do destino em vigor', () => {
    // Freando: o destino novo fica pouco à frente. A partida no relógio
    // congelado (x = 60 aos 60 ms) fica atrás de onde o cursor já estava
    // (x ≈ 117 aos 117 ms), e no quadro seguinte ele volta para ~111.
    const passos = [
      { tMs: 0, x: 0, y: 0, duracaoMs: 0 },
      { tMs: 0, x: 200, y: 0, duracaoMs: 200 },
      { tMs: 120, relogioMs: 60, x: 130, y: 0, duracaoMs: 100 },
    ];
    expect(recuos(simularCompositor(passos, { fimMs: 300 }))).toBeGreaterThan(0);
    // Partindo de onde está, não recua.
    const semRelogio = passos.map((p) => ({ ...p, relogioMs: undefined }));
    expect(recuos(simularCompositor(semRelogio, { fimMs: 300 }))).toBe(0);
  });

  it('acha as paradas curtas no meio de um movimento (anda, para 1–2 quadros, anda)', () => {
    // anda 10, para, anda 10, anda 10, para, para, anda 10, para 4 (fim do movimento)
    const passos = [10, 0, 10, 10, 0, 0, 10, 0, 0, 0, 0];
    expect(paradasNoMeioDoMovimento(passos, { limiarPx: 1.5, maxQuadros: 2 })).toBe(3);
  });
});
