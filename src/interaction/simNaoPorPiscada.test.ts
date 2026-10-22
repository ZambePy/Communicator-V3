import { describe, it, expect } from 'vitest';
import {
  criarEstadoSimNao, passoSimNao, JANELA_DA_SEGUNDA_MS, PISCADA_MAX_MS, REFRATARIO_MS, type EstadoSimNao, type RespostaSimNao,
} from './simNaoPorPiscada';

/** Simula quadros a 30 Hz: [fechado?, duração em ms] em sequência. */
function simular(trechos: Array<[boolean | null, number]>, piscadaMinMs?: number) {
  let e: EstadoSimNao = criarEstadoSimNao();
  let t = 0;
  const respostas: Array<{ r: RespostaSimNao; t: number }> = [];
  for (const [fechado, dur] of trechos) {
    const fim = t + dur;
    for (; t < fim; t += 33) {
      const p = passoSimNao(e, { fechado, nowMs: t }, piscadaMinMs);
      e = p.estado;
      if (p.resposta) respostas.push({ r: p.resposta, t });
    }
  }
  return respostas;
}

describe('sim/não por piscada longa', () => {
  it('uma piscada longa = SIM, decidida quando a janela da segunda passa', () => {
    const r = simular([[false, 500], [true, 900], [false, JANELA_DA_SEGUNDA_MS + 300]]);
    expect(r.map((x) => x.r)).toEqual(['sim']);
  });

  it('duas piscadas longas = NÃO, decidido na hora da segunda', () => {
    const r = simular([[false, 500], [true, 900], [false, 800], [true, 900], [false, 3000]]);
    expect(r.map((x) => x.r)).toEqual(['nao']);
  });

  it('piscadas espontâneas (curtas) não contam, nem misturadas com uma longa', () => {
    expect(simular([[false, 300], [true, 150], [false, 800], [true, 200], [false, 4000]])).toEqual([]);
    const r = simular([[false, 300], [true, 900], [false, 600], [true, 150], [false, 3500]]);
    expect(r.map((x) => x.r)).toEqual(['sim']);
  });

  it('olho fechado por muito tempo (descanso) não é resposta, nem ao reabrir', () => {
    expect(simular([[false, 300], [true, PISCADA_MAX_MS + 2000], [false, 4000]])).toEqual([]);
  });

  it('uma longa e depois descanso de olhos fechados: SIM sai sem esperar reabrir, e reabrir não responde de novo', () => {
    const r = simular([[false, 300], [true, 900], [false, 600], [true, 9000], [false, 4000]]);
    expect(r.map((x) => x.r)).toEqual(['sim']);
  });

  it('rosto perdido no meio da piscada descarta aquele episódio', () => {
    expect(simular([[false, 300], [true, 400], [null, 600], [false, 4000]])).toEqual([]);
  });

  it('depois de uma resposta, o período refratário segura a próxima', () => {
    const r = simular([
      [false, 300], [true, 900], [false, 600], [true, 900], // NÃO
      [false, 200], [true, 900], [false, REFRATARIO_MS], // longa dentro do refratário (soltou aos ~1,1 s)
      [false, 4000],
    ]);
    expect(r.map((x) => x.r)).toEqual(['nao']);
  });

  it('o limiar da piscada longa é ajustável (paciente com piscada mais curta)', () => {
    expect(simular([[false, 300], [true, 500], [false, 3500]], 700)).toEqual([]);
    expect(simular([[false, 300], [true, 500], [false, 3500]], 450).map((x) => x.r)).toEqual(['sim']);
  });
});
