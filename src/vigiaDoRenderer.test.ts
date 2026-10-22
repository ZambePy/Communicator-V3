import { describe, it, expect } from 'vitest';
import {
  criarVigiaDoRenderer,
  lerBatida,
  vigiaLigado,
  CANAL_DA_BATIDA,
  FOLGA_DO_VIGIA_MS,
  INTERVALO_DA_BATIDA_MS,
  INTERVALO_DO_VIGIA_MS,
  LIMITE_SEM_BATIDA_MS,
} from './vigiaDoRenderer';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 4): página
// travada não tinha vigia. Quem usa só o olhar não gera entrada física, então
// o `unresponsive` do Chromium pode nem disparar — e, quando disparava, o main
// só escrevia no log. Aqui a decisão do vigia, com o relógio na mão do teste.
// -----------------------------------------------------------------------------

const VISIVEL = { visivel: true };
const OCULTA = { visivel: false };

/**
 * Simula o main: confere a cada `INTERVALO_DO_VIGIA_MS` e a página bate a cada
 * `INTERVALO_DA_BATIDA_MS` enquanto `bate(t)` disser que sim. Devolve o
 * instante do primeiro "travado" (ou `null`).
 */
function simular(opcoes: {
  ateMs: number;
  bate: (t: number) => boolean;
  janela?: (t: number) => { visivel: boolean };
  rastreando?: (t: number) => boolean;
}): number | null {
  const vigia = criarVigiaDoRenderer();
  for (let t = 0; t <= opcoes.ateMs; t += 500) {
    if (t % INTERVALO_DA_BATIDA_MS === 0 && opcoes.bate(t)) {
      vigia.batida(t, { rastreando: opcoes.rastreando?.(t) ?? true });
    }
    if (t % INTERVALO_DO_VIGIA_MS === 0) {
      const r = vigia.verificar(t, opcoes.janela?.(t) ?? VISIVEL);
      if (r.travado) return t;
    }
  }
  return null;
}

describe('o vigia reinicia a página travada', () => {
  it('página que bate normalmente nunca é reiniciada', () => {
    expect(simular({ ateMs: 600_000, bate: () => true })).toBeNull();
  });

  it('a página trava: o vigia age entre 30 e 35 s depois da última batida', () => {
    const travouEm = 100_000;
    const t = simular({ ateMs: 300_000, bate: (t) => t < travouEm });
    expect(t).not.toBeNull();
    const ultimaBatida = travouEm - INTERVALO_DA_BATIDA_MS;
    expect(t! - ultimaBatida).toBeGreaterThanOrEqual(LIMITE_SEM_BATIDA_MS);
    expect(t! - ultimaBatida).toBeLessThanOrEqual(LIMITE_SEM_BATIDA_MS + INTERVALO_DO_VIGIA_MS);
  });

  it('o diagnóstico da calibração (~9 s de thread presa, ~13 s com o treino) NÃO reinicia a página', () => {
    for (const duracao of [9_000, 13_000, 25_000]) {
      const t = simular({ ateMs: 200_000, bate: (t) => t < 50_000 || t >= 50_000 + duracao });
      expect(t, `${duracao} ms`).toBeNull();
    }
  });

  it('o limiar fica acima do dobro do maior trabalho síncrono legítimo (LOO + treino ≈ 13 s)', () => {
    expect(LIMITE_SEM_BATIDA_MS).toBeGreaterThan(2 * 13_000);
  });

  it('desarmado até a primeira batida: a carga do detector de rosto (thread presa) não conta', () => {
    expect(simular({ ateMs: 120_000, bate: (t) => t >= 90_000 })).toBeNull();
  });

  it('rastreamento parado de propósito (`rastreando: false`) desarma', () => {
    const t = simular({
      ateMs: 300_000,
      bate: (t) => t <= 60_000, // a última batida diz que o laço parou
      rastreando: (t) => t < 60_000,
    });
    expect(t).toBeNull();
  });
});

describe('janela minimizada, escondida, tela bloqueada', () => {
  it('oculta de propósito (Modo Computador, minimizada): silêncio não é travamento', () => {
    const t = simular({
      ateMs: 300_000,
      bate: (t) => t < 50_000,
      janela: () => OCULTA,
    });
    expect(t).toBeNull();
  });

  it('ao voltar a ficar visível, a página tem o limite INTEIRO para dar sinal', () => {
    const voltaEm = 200_000;
    const t = simular({
      ateMs: 400_000,
      bate: (t) => t < 50_000,
      janela: (t) => (t < voltaEm ? OCULTA : VISIVEL),
    });
    expect(t).not.toBeNull();
    expect(t! - voltaEm).toBeGreaterThanOrEqual(LIMITE_SEM_BATIDA_MS - INTERVALO_DO_VIGIA_MS);
  });

  it('`desculpar` (sistema acordou, tela desbloqueada) recomeça a contagem', () => {
    const vigia = criarVigiaDoRenderer();
    vigia.batida(0, { rastreando: true });
    for (let t = 5_000; t <= 25_000; t += 5_000) expect(vigia.verificar(t, VISIVEL).travado).toBe(false);
    vigia.desculpar(25_000);
    // Sem o `desculpar`, 30 s depois da batida já seria travamento.
    for (let t = 30_000; t <= 50_000; t += 5_000) expect(vigia.verificar(t, VISIVEL).travado, `${t}`).toBe(false);
    expect(vigia.verificar(55_000, VISIVEL).travado).toBe(true);
  });

  it('o próprio vigia ficou parado (computador dormiu): não culpa a página, e conta de novo dali', () => {
    const vigia = criarVigiaDoRenderer();
    vigia.batida(0, { rastreando: true });
    expect(vigia.verificar(5_000, VISIVEL).travado).toBe(false);
    // Uma hora sem conferir (suspensão sem o evento do sistema): a lacuna é
    // maior que a folga do vigia.
    const acordou = 5_000 + 3_600_000;
    expect(acordou - 5_000).toBeGreaterThan(FOLGA_DO_VIGIA_MS);
    expect(vigia.verificar(acordou, VISIVEL).travado).toBe(false);
    for (let t = acordou + 5_000; t < acordou + LIMITE_SEM_BATIDA_MS; t += 5_000) {
      expect(vigia.verificar(t, VISIVEL).travado).toBe(false);
    }
    // A página continua sem bater depois que o computador acordou: agora sim.
    expect(vigia.verificar(acordou + LIMITE_SEM_BATIDA_MS, VISIVEL).travado).toBe(true);
  });
});

describe('detalhes', () => {
  it('a batida devolve a lacuna desde a anterior (para o log de diagnóstico)', () => {
    const vigia = criarVigiaDoRenderer();
    expect(vigia.batida(0, { rastreando: true })).toBeNull();
    expect(vigia.batida(2_000, { rastreando: true })).toBe(2_000);
    expect(vigia.batida(14_000, { rastreando: true })).toBe(12_000);
    expect(vigia.armado()).toBe(true);
    vigia.desarmar();
    expect(vigia.armado()).toBe(false);
  });

  it('o que vier pelo IPC fora do formato é ignorado', () => {
    expect(lerBatida(null)).toBeNull();
    expect(lerBatida('vivo')).toBeNull();
    expect(lerBatida({ rastreando: 'sim' })).toBeNull();
    expect(lerBatida({ rastreando: true, extra: 1 })).toEqual({ rastreando: true });
    const vigia = criarVigiaDoRenderer();
    vigia.batida(0, { lixo: true });
    expect(vigia.armado()).toBe(false);
  });

  it('vale no app empacotado; no desenvolvimento só com IRISFLOW_VIGIA=1', () => {
    expect(vigiaLigado(true, undefined)).toBe(true);
    expect(vigiaLigado(false, undefined)).toBe(false);
    expect(vigiaLigado(false, '1')).toBe(true);
    expect(vigiaLigado(false, '0')).toBe(false);
  });

  it('o canal é o combinado com a página', () => {
    expect(CANAL_DA_BATIDA).toBe('irisflow:vivo');
    expect(INTERVALO_DA_BATIDA_MS).toBe(2_000);
  });
});
