// Revisão do pipeline de 20/10/2026 — o reinício do modelo do rosto mantém o
// lado da calibração (448²) mesmo em WASM, e a 448² o WASM é ~3,2× mais lento
// que a 224² (medido em 20/10/2026 num contêiner de 2 CPUs: 2,74–2,75 s contra
// 0,74–0,96 s por inferência). O cliente só aceita uma leitura até
// `MAX_STALE_MS` (2,5 s) de idade, contada da CAPTURA: a 2,745 s nenhuma vale,
// o bloco angular vai zerado e o status segue `ready`.
//
// Testes da revisão (scratchpad/revisao2_pipeline/testes/
// reinicio448LentoSemAviso.test.ts, os dois primeiros) com a afirmação
// INVERTIDA no que era o defeito: antes ninguém ficava sabendo; agora a vigia
// do cliente (`vigiaDaLatencia`, ligada pelo engine no reinício com lado fixo)
// avisa logo nas primeiras respostas, e só na faixa em que as leituras começam
// a vencer. A troca de lado em si é do engine (engine.reinicioLento.test.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createL2CSClient, LATENCIA_MAXIMA_DO_LADO_FIXO_MS, MAX_STALE_MS } from './client';
import { EXPERIMENT } from '../config/experiment';
import type { L2CSModelMeta, L2CSWorkerRequest, L2CSWorkerResponse } from './types';

const META = JSON.parse(
  readFileSync(resolve(__dirname, '../../frontend/public/models/l2cs/l2cs.meta.json'), 'utf8'),
) as L2CSModelMeta;

let relogio = 0;
interface Pendente { id: number; quando: number; latencia: number }
class FakeWorker {
  static ultimo: FakeWorker | null = null;
  ouvintes: Array<(ev: { data: L2CSWorkerResponse }) => void> = [];
  pendentes: Pendente[] = [];
  latencia = 0;
  constructor() { FakeWorker.ultimo = this; }
  addEventListener(tipo: string, fn: (ev: { data: L2CSWorkerResponse }) => void) { if (tipo === 'message') this.ouvintes.push(fn); }
  removeEventListener() {}
  terminate() {}
  postMessage(msg: L2CSWorkerRequest) {
    if (msg.type === 'infer') this.pendentes.push({ id: msg.id, quando: relogio + this.latencia, latencia: this.latencia });
  }
  responder(data: L2CSWorkerResponse) { for (const fn of this.ouvintes) fn({ data }); }
  /** Entrega as inferências que já terminaram no relógio virtual. */
  entregar() {
    const prontas = this.pendentes.filter((p) => p.quando <= relogio);
    this.pendentes = this.pendentes.filter((p) => p.quando > relogio);
    for (const p of prontas) {
      this.responder({ type: 'result', id: p.id, yaw: 0.1 + Math.sin(relogio / 700) * 0.05, pitch: -0.05, confidence: 0.9, inferenceMs: p.latencia });
    }
  }
}

/**
 * 60 s de laço a 30 fps com o worker respondendo em `latenciaMs`: a fração de
 * quadros com leitura válida (os 10 s iniciais são aquecimento) e as chamadas
 * da vigia, quando ligada, com o instante de cada uma.
 */
async function rodar(lado: 224 | 448, latenciaMs: number, comVigia: boolean) {
  const avisos: { latenciaMs: number; emMs: number }[] = [];
  const inicio = relogio;
  const cliente = createL2CSClient({
    ladoFixo: lado,
    provider: 'wasm',
    ...(comVigia
      ? { vigiaDaLatencia: { limiteMs: LATENCIA_MAXIMA_DO_LADO_FIXO_MS, aoPassar: (l: number) => avisos.push({ latenciaMs: l, emMs: relogio - inicio }) } }
      : {}),
  });
  const p = cliente.start();
  const w = FakeWorker.ultimo!;
  w.latencia = latenciaMs;
  w.responder({ type: 'ready', meta: META, executionProvider: 'wasm', requested: 'wasm', fallback: false, verificacao: { sha256Calculado: null, hashConfere: null } });
  await p;
  let validos = 0, total = 0;
  const fim = relogio + 60_000;
  while (relogio < fim) {
    relogio += 33;
    w.entregar();
    if (cliente.canSubmit(relogio)) cliente.submitTensor(new Float32Array(3 * lado * lado));
    if (relogio > fim - 50_000) {
      total++;
      if (cliente.getLatestGaze(relogio).valid) validos++;
    }
  }
  const r = { lado, latenciaMs, fracaoValida: validos / total, staleMs: cliente.getStaleMs(), politica: cliente.getPolitica(), falha: cliente.getFalha(), avisos };
  cliente.stop();
  return r;
}

const flags = { l2cs: EXPERIMENT.l2cs };
beforeEach(() => {
  relogio = 1_000;
  vi.stubGlobal('Worker', FakeWorker);
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  EXPERIMENT.l2cs = 'auto';
});
afterEach(() => {
  EXPERIMENT.l2cs = flags.l2cs;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('vigia das primeiras respostas no reinício com lado fixo (revisão de 20/10/2026)', () => {
  it('o limite é metade do teto de idade: 1,25 s', () => {
    expect(MAX_STALE_MS).toBe(2500);
    expect(LATENCIA_MAXIMA_DO_LADO_FIXO_MS).toBe(1250);
  });

  it('448² a 2,745 s (a latência medida): a vigia avisa uma vez, na 2ª resposta; 224² a 0,85 s: não avisa', async () => {
    const a448 = await rodar(448, 2745, true);
    const a224 = await rodar(224, 850, true);
    // O cliente sozinho continua sem nenhuma leitura valendo a 448² — quem
    // troca o lado é o engine, avisado aqui.
    expect(a448.politica.inputSize).toBe(448);
    expect(a448.fracaoValida).toBe(0);
    expect(a448.falha).toBeNull();
    expect(a448.avisos).toHaveLength(1);
    // A idade chega arredondada ao quadro de 33 ms do laço.
    expect(a448.avisos[0].latenciaMs).toBeGreaterThanOrEqual(2745);
    expect(a448.avisos[0].latenciaMs).toBeLessThan(2745 + 34);
    // Duas respostas: ~5,5 s depois de pronto (e não um minuto, nem nunca).
    expect(a448.avisos[0].emMs).toBeLessThan(2 * (2745 + 34) + 200);
    expect(a224.avisos).toEqual([]);
    expect(a224.fracaoValida).toBeGreaterThan(0.95);
  });

  it('a vigia dispara exatamente na faixa em que as leituras começam a vencer', async () => {
    const linhas: { latenciaMs: number; fracaoValida: number; avisou: boolean }[] = [];
    for (const lat of [530, 1200, 1800, 2200, 2490, 2510]) {
      const r = await rodar(448, lat, true);
      linhas.push({ latenciaMs: lat, fracaoValida: r.fracaoValida, avisou: r.avisos.length > 0 });
    }
    for (const l of linhas) {
      if (l.latenciaMs <= LATENCIA_MAXIMA_DO_LADO_FIXO_MS) {
        expect(l.fracaoValida).toBe(1);
        expect(l.avisou).toBe(false);
      } else {
        expect(l.fracaoValida).toBeLessThan(0.5);
        expect(l.avisou).toBe(true);
      }
    }
  });

  it('sem a vigia (a primeira carga e o caminho normal), nada muda: as mesmas leituras de antes', async () => {
    const com = await rodar(448, 1200, true);
    const sem = await rodar(448, 1200, false);
    expect(sem.avisos).toEqual([]);
    expect(sem.fracaoValida).toBe(com.fracaoValida);
    expect(sem.staleMs).toBe(com.staleMs);
  });

  it('uma resposta lenta isolada não decide: duas rápidas encerram a vigia sem aviso', async () => {
    const avisos: number[] = [];
    const cliente = createL2CSClient({
      ladoFixo: 448,
      provider: 'wasm',
      vigiaDaLatencia: { limiteMs: LATENCIA_MAXIMA_DO_LADO_FIXO_MS, aoPassar: (l) => avisos.push(l) },
    });
    const p = cliente.start();
    const w = FakeWorker.ultimo!;
    w.responder({ type: 'ready', meta: META, executionProvider: 'wasm', requested: 'wasm', fallback: false, verificacao: { sha256Calculado: null, hashConfere: null } });
    await p;
    // 1ª resposta lenta (uma pausa do coletor de lixo), depois várias rápidas e uma lenta tardia.
    for (const lat of [3000, 400, 400, 3000, 3000]) {
      w.latencia = lat;
      while (!cliente.canSubmit(relogio)) { relogio += 33; w.entregar(); }
      cliente.submitTensor(new Float32Array(3 * 448 * 448));
      relogio += lat;
      w.entregar();
    }
    expect(avisos).toEqual([]);
    cliente.stop();
  });
});
