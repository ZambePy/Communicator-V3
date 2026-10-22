import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EngineState, GazeSample } from '@tracker/tracker/engine';
import { INTERVALO_DA_BATIDA_MS } from '@tracker/vigiaDoRenderer';
import { avisarTrabalhoLongo } from '@tracker/trabalhoLongo';
import { criarBatida, ligarBatidaDoRenderer, ponteDaBatida, type FonteDoLaco } from './batidaDoRenderer';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 4): a batida da
// página para o vigia do processo principal, MARCADA PELO LAÇO DO RASTREADOR
// — sai das amostras do engine, não de um timer solto.
// -----------------------------------------------------------------------------

/** Engine falso: o teste emite amostras e estados. */
function engineFalso() {
  const amostras = new Set<(s: GazeSample) => void>();
  const estados = new Set<(s: EngineState) => void>();
  const engine: FonteDoLaco = {
    subscribe: (cb) => {
      amostras.add(cb);
      return () => amostras.delete(cb);
    },
    onStateChange: (cb) => {
      estados.add(cb);
      return () => estados.delete(cb);
    },
  };
  return {
    engine,
    amostra: () => amostras.forEach((cb) => cb({ x: 0, y: 0, timestamp: 0, hasFace: true } as GazeSample)),
    estado: (s: EngineState) => estados.forEach((cb) => cb(s)),
    ouvintes: () => amostras.size + estados.size,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { irisflowSystem?: unknown }).irisflowSystem;
});

describe('criarBatida', () => {
  it('a primeira volta bate na hora; as seguintes, no máximo a cada 2 s', () => {
    let agora = 0;
    const enviar = vi.fn();
    const b = criarBatida(enviar, () => agora);
    b.volta();
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: true });
    // 30 Hz por 1,9 s: nenhuma batida a mais.
    for (; agora < INTERVALO_DA_BATIDA_MS - 100; agora += 33) b.volta();
    expect(enviar).toHaveBeenCalledTimes(1);
    agora = INTERVALO_DA_BATIDA_MS;
    b.volta();
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('pausa desarma o vigia uma vez; a volta seguinte arma na hora', () => {
    let agora = 0;
    const enviar = vi.fn();
    const b = criarBatida(enviar, () => agora);
    b.pausa(); // nunca armou: nada a dizer
    expect(enviar).not.toHaveBeenCalled();
    b.volta();
    b.pausa();
    b.pausa();
    expect(enviar.mock.calls.map((c) => c[0])).toEqual([{ rastreando: true }, { rastreando: false }]);
    agora = 10;
    b.volta();
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: true });
  });

  it('o envio que lança não derruba o laço do rastreador (e loga uma vez)', () => {
    let agora = 0;
    const b = criarBatida(() => { throw new Error('ipc fechado'); }, () => agora);
    for (let i = 0; i < 5; i++, agora += INTERVALO_DA_BATIDA_MS) expect(() => b.volta()).not.toThrow();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('ligarBatidaDoRenderer', () => {
  it('as amostras do engine batem; erro/carregando/parado desarmam; desligar desarma e solta tudo', () => {
    let agora = 0;
    const enviar = vi.fn();
    const f = engineFalso();
    const desligar = ligarBatidaDoRenderer(f.engine, enviar, () => agora);
    f.amostra();
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: true });
    // A recuperação da GPU para o laço DE PROPÓSITO: o próprio app mostra o erro.
    f.estado('error');
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: false });
    agora += 100;
    f.amostra();
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: true });
    // `sem_camera` não desarma: o laço segue girando e emitindo amostras.
    f.estado('sem_camera');
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: true });
    desligar();
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: false });
    expect(f.ouvintes()).toBe(0);
  });

  // Revisão de segurança de 19/10/2026: o treino da calibração trava a thread
  // por segundos; num PC lento passaria do limite do vigia (30 s).
  it('trabalho síncrono longo (treino da calibração) desarma; a volta seguinte arma de novo', () => {
    let agora = 0;
    const enviar = vi.fn();
    const f = engineFalso();
    const desligar = ligarBatidaDoRenderer(f.engine, enviar, () => agora);
    f.amostra();
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: true });
    avisarTrabalhoLongo();
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: false });
    agora += 40_000;
    f.amostra();
    expect(enviar).toHaveBeenLastCalledWith({ rastreando: true });
    desligar();
    enviar.mockClear();
    // Desligado, o aviso não chega a ninguém.
    avisarTrabalhoLongo();
    expect(enviar).not.toHaveBeenCalled();
  });

  it('fora do Electron (sem a ponte do preload) não assina nada', () => {
    const f = engineFalso();
    const desligar = ligarBatidaDoRenderer(f.engine, ponteDaBatida());
    expect(f.ouvintes()).toBe(0);
    desligar();
  });

  it('com o preload, usa `irisflowSystem.vivo`', () => {
    const vivo = vi.fn();
    (window as unknown as { irisflowSystem: unknown }).irisflowSystem = { vivo };
    const f = engineFalso();
    ligarBatidaDoRenderer(f.engine);
    f.amostra();
    expect(vivo).toHaveBeenCalledWith({ rastreando: true });
  });
});
