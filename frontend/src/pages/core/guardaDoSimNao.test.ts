import { describe, it, expect } from 'vitest';
import { criarEstadoSimNao } from '@tracker/interaction/simNaoPorPiscada';
import { SAIDA_PARA_REARMAR_MS } from '@tracker/interaction/rearmePorSaida';
import {
  criarGuarda, registrarResposta, respostaLiberada, piscadaSuspensa, piscadaLongaEmCurso, passoDaGuarda,
  visualDoSimNao, TRAVA_DA_RESPOSTA_MS, CAUDA_DA_PISCADA_MS, type GuardaDoSimNao, type AmostraDaGuarda,
} from './guardaDoSimNao';

// Revisão de UX de 19/10/2026 (achado 4): com a piscada ligada, o olhar e a
// piscada respondiam ao mesmo tempo, e com respostas opostas.

const passo = (g: GuardaDoSimNao, a: Partial<AmostraDaGuarda> & { agoraMs: number }) =>
  passoDaGuarda(g, { fechado: false, piscadaEmCurso: false, sob: null, ...a });

describe('guarda da tela Sim · Não', () => {
  it('uma resposta trava a outra por 3 s', () => {
    let g = criarGuarda();
    expect(respostaLiberada(g, 0)).toBe(true);
    g = registrarResposta(g, 'sim', 1000);
    expect(respostaLiberada(g, 1000 + TRAVA_DA_RESPOSTA_MS - 1)).toBe(false);
    expect(respostaLiberada(g, 1000 + TRAVA_DA_RESPOSTA_MS)).toBe(true);
    const v = visualDoSimNao(g, criarEstadoSimNao(), 2000, true);
    expect(v.respondida).toBe('sim');
    // A trava tira o dwell do SIM e do NÃO; o "Chamar atenção" nunca espera trava.
    expect(v.semDwell).toEqual({ sim: true, nao: true, chamar: false });
    expect(visualDoSimNao(g, criarEstadoSimNao(), 1000 + TRAVA_DA_RESPOSTA_MS, true).respondida).toBeNull();
  });

  it('piscada longa em curso: olho fechado há o mínimo da piscada longa, ou uma longa à espera da segunda', () => {
    const e = { ...criarEstadoSimNao(), fechadoDesde: 1000 };
    expect(piscadaLongaEmCurso(e, 1000 + 699, 700)).toBe(false); // ainda pode ser a piscada espontânea
    expect(piscadaLongaEmCurso(e, 1000 + 700, 700)).toBe(true);
    expect(piscadaLongaEmCurso({ ...criarEstadoSimNao(), longas: 1, ultimaLongaFim: 5000 }, 5100, 700)).toBe(true);
    expect(piscadaLongaEmCurso(criarEstadoSimNao(), 5100, 700)).toBe(false);
  });

  it('a piscada tira o dwell dos três botões e solta só depois da cauda (maior que a memória de saída do dwell)', () => {
    let g = passo(criarGuarda(), { agoraMs: 1000, fechado: true, piscadaEmCurso: true, sob: undefined });
    expect(visualDoSimNao(g, criarEstadoSimNao(), 1000, true).semDwell).toEqual({ sim: true, nao: true, chamar: true });
    g = passo(g, { agoraMs: 1500, piscadaEmCurso: false, sob: undefined });
    expect(visualDoSimNao(g, criarEstadoSimNao(), 1000 + CAUDA_DA_PISCADA_MS - 1, true).semDwell.nao).toBe(true);
    expect(visualDoSimNao(g, criarEstadoSimNao(), 1000 + CAUDA_DA_PISCADA_MS, true).semDwell.nao).toBe(false);
    expect(CAUDA_DA_PISCADA_MS).toBeGreaterThan(400);
  });

  it('o olhar parado num botão durante a piscada o prende até sair dele por 200 ms', () => {
    let g = passo(criarGuarda(), { agoraMs: 0, fechado: false, piscadaEmCurso: true, sob: 'nao' });
    expect(g.presoAoOlhar.nao).toBe(true);
    // A piscada decidiu e a cauda passou: o NÃO continua sem dwell com o olhar nele.
    g = passo(g, { agoraMs: 5000, sob: 'nao' });
    expect(visualDoSimNao(g, criarEstadoSimNao(), 5000, true).semDwell).toEqual({ sim: false, nao: true, chamar: false });
    // Saiu por menos que o rearme: ainda preso.
    g = passo(g, { agoraMs: 5100, sob: null });
    g = passo(g, { agoraMs: 5100 + SAIDA_PARA_REARMAR_MS - 1, sob: null });
    expect(g.presoAoOlhar.nao).toBe(true);
    g = passo(g, { agoraMs: 5100 + SAIDA_PARA_REARMAR_MS, sob: 'sim' });
    expect(g.presoAoOlhar.nao).toBe(false);
    // Voltar ao NÃO depois da piscada não o prende de novo.
    g = passo(g, { agoraMs: 6000, sob: 'nao' });
    expect(visualDoSimNao(g, criarEstadoSimNao(), 6000, true).semDwell.nao).toBe(false);
  });

  it('posição desconhecida (olho fechado, rosto perdido) não mexe no rearme', () => {
    let g = passo(criarGuarda(), { agoraMs: 0, piscadaEmCurso: true, sob: 'nao' });
    g = passo(g, { agoraMs: 3000, fechado: true, sob: undefined });
    expect(g.presoAoOlhar.nao).toBe(true);
    expect(g.foraDesde.nao).toBeNull();
  });

  it('fechamento que começa na trava não vira piscada, nem depois dela', () => {
    let g = registrarResposta(criarGuarda(), 'nao', 0);
    g = passo(g, { agoraMs: 2500, fechado: true });
    expect(piscadaSuspensa(g, 2500)).toBe(true);
    // A trava acabou com o olho ainda fechado: continua suspensa.
    g = passo(g, { agoraMs: 3500, fechado: true });
    expect(piscadaSuspensa(g, 3500)).toBe(true);
    // Reabriu: a próxima piscada vale.
    g = passo(g, { agoraMs: 3600, fechado: false });
    expect(piscadaSuspensa(g, 3600)).toBe(false);
  });

  it('no modo acionador a tela não tira o dwell (a varredura pularia os botões); a trava vale pela resposta', () => {
    let g = passo(criarGuarda(), { agoraMs: 0, piscadaEmCurso: true, sob: 'nao' });
    g = registrarResposta(g, 'sim', 100);
    const v = visualDoSimNao(g, criarEstadoSimNao(), 200, false);
    expect(v.semDwell).toEqual({ sim: false, nao: false, chamar: false });
    expect(v.respondida).toBe('sim');
    expect(respostaLiberada(g, 200)).toBe(false);
  });
});
