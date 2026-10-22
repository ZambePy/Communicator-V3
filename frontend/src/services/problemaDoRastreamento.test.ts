import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  informarProblemaDoRastreamento,
  ouvirProblemaPersistente,
  estadoDoProblemaPersistente,
  PERSISTENTE_APOS_MS,
  TOLERANCIA_DE_SUMICO_MS,
  _reiniciarParaTeste,
  type ProblemaPersistente,
} from './problemaDoRastreamento';

// Problema de rastreamento PERSISTENTE (pedido do dono, 19/10/2026): o mesmo
// tipo por mais de 45 s, fora da calibração e do teste de precisão. É a
// entrada para avisar o cuidador — aqui nada sai do computador.

const ROSTO = { tipo: 'rosto_perdido' as const, mensagem: 'Não estou vendo seu rosto, tentando de novo…' };
const LUZ = { tipo: 'contraluz' as const, mensagem: 'Luz forte atrás de você. Há uma janela atrás.' };
const USO = { emMedicao: false };
const MEDINDO = { emMedicao: true };

/** Informa o mesmo problema a cada segundo, como o `GazeProvider` faz. */
function durante(ms: number, problema: typeof ROSTO | typeof LUZ | null, ctx = USO): void {
  for (let t = 0; t < ms; t += 1000) {
    informarProblemaDoRastreamento(problema, ctx);
    vi.advanceTimersByTime(Math.min(1000, ms - t));
  }
}

let recebidos: Array<ProblemaPersistente | null>;
let parar: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
  _reiniciarParaTeste();
  recebidos = [];
  parar = ouvirProblemaPersistente((p) => recebidos.push(p));
});
afterEach(() => {
  parar();
  _reiniciarParaTeste();
  vi.useRealTimers();
});

describe('quando um problema vira persistente', () => {
  it('o mesmo tipo por 45 s: o ouvinte recebe tipo, início e mensagem — uma vez', () => {
    const inicio = Date.now();
    durante(PERSISTENTE_APOS_MS - 1000, ROSTO);
    expect(recebidos).toEqual([]);
    expect(estadoDoProblemaPersistente()).toBeNull();
    durante(2000, ROSTO);
    expect(recebidos).toEqual([{ tipo: 'rosto_perdido', desdeMs: inicio, mensagem: ROSTO.mensagem }]);
    expect(estadoDoProblemaPersistente()).toEqual(recebidos[0]);
    // Continuar informando não repete o aviso.
    durante(30_000, ROSTO);
    expect(recebidos).toHaveLength(1);
  });

  it('informado uma vez só, o timer interno faz virar persistente sem nova chamada', () => {
    informarProblemaDoRastreamento(ROSTO, USO);
    vi.advanceTimersByTime(PERSISTENTE_APOS_MS);
    expect(recebidos).toHaveLength(1);
  });

  it('resolve quando o problema some por mais que a tolerância: o ouvinte recebe null', () => {
    durante(PERSISTENTE_APOS_MS + 1000, ROSTO);
    expect(recebidos).toHaveLength(1);
    informarProblemaDoRastreamento(null, USO);
    vi.advanceTimersByTime(TOLERANCIA_DE_SUMICO_MS - 100);
    expect(recebidos).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(recebidos).toEqual([expect.objectContaining({ tipo: 'rosto_perdido' }), null]);
    expect(estadoDoProblemaPersistente()).toBeNull();
  });
});

describe('o que não reinicia (e o que reinicia) a contagem', () => {
  it('sumiços curtos — o rosto que some e volta numa silhueta — não zeram a contagem', () => {
    for (let i = 0; i < 12; i++) {
      durante(3000, LUZ);
      durante(2000, null); // abaixo dos 5 s de tolerância
    }
    // 60 s de episódio, com o problema presente só 36 s deles: ainda conta.
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]?.tipo).toBe('contraluz');
  });

  it('um sumiço maior que a tolerância encerra o episódio: o próximo conta do zero', () => {
    durante(30_000, ROSTO);
    durante(TOLERANCIA_DE_SUMICO_MS + 1000, null);
    durante(30_000, ROSTO);
    expect(recebidos).toEqual([]);
    durante(16_000, ROSTO);
    expect(recebidos).toHaveLength(1);
  });

  it('trocar de tipo encerra o anterior e o novo conta do zero', () => {
    durante(PERSISTENTE_APOS_MS + 1000, ROSTO);
    expect(recebidos).toHaveLength(1);
    durante(10_000, LUZ);
    // O rosto resolveu; a luz ainda não fez 45 s.
    expect(recebidos).toEqual([expect.objectContaining({ tipo: 'rosto_perdido' }), null]);
    durante(PERSISTENTE_APOS_MS, LUZ);
    expect(recebidos.at(-1)).toEqual(expect.objectContaining({ tipo: 'contraluz' }));
  });

  it('mudar só o texto não chama o ouvinte de novo, mas o estado traz o texto novo', () => {
    durante(PERSISTENTE_APOS_MS + 1000, LUZ);
    const outra = { ...LUZ, mensagem: 'Luz forte atrás de você. O fundo está 3,1 vezes mais claro.' };
    durante(3000, outra);
    expect(recebidos).toHaveLength(1);
    expect(estadoDoProblemaPersistente()?.mensagem).toBe(outra.mensagem);
  });
});

describe('calibração e teste de precisão suspendem', () => {
  it('em medição a contagem zera e um persistente em curso resolve', () => {
    durante(PERSISTENTE_APOS_MS + 1000, ROSTO);
    expect(recebidos).toHaveLength(1);
    durante(5000, ROSTO, MEDINDO);
    expect(recebidos).toEqual([expect.objectContaining({ tipo: 'rosto_perdido' }), null]);
    // De volta ao uso, a contagem recomeça do zero.
    durante(PERSISTENTE_APOS_MS - 2000, ROSTO);
    expect(recebidos).toHaveLength(2);
  });

  it('um problema que só existe durante a medição nunca vira persistente', () => {
    durante(3 * PERSISTENTE_APOS_MS, ROSTO, MEDINDO);
    expect(recebidos).toEqual([]);
    expect(estadoDoProblemaPersistente()).toBeNull();
  });
});

describe('ouvintes', () => {
  it('quem começa a ouvir com um persistente em curso recebe na hora', () => {
    durante(PERSISTENTE_APOS_MS + 1000, ROSTO);
    const tardio: Array<ProblemaPersistente | null> = [];
    const pararTardio = ouvirProblemaPersistente((p) => tardio.push(p));
    expect(tardio).toEqual([expect.objectContaining({ tipo: 'rosto_perdido', mensagem: ROSTO.mensagem })]);
    pararTardio();
  });

  it('um ouvinte que lança não impede os outros', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pararQuebrado = ouvirProblemaPersistente(() => {
      throw new Error('nuvem fora do ar');
    });
    const outros: Array<ProblemaPersistente | null> = [];
    const pararOutro = ouvirProblemaPersistente((p) => outros.push(p));
    durante(PERSISTENTE_APOS_MS + 1000, ROSTO);
    expect(outros).toHaveLength(1);
    expect(recebidos).toHaveLength(1);
    expect(erro).toHaveBeenCalled();
    pararQuebrado();
    pararOutro();
    erro.mockRestore();
  });

  it('parar de ouvir funciona', () => {
    parar();
    durante(PERSISTENTE_APOS_MS + 1000, ROSTO);
    expect(recebidos).toEqual([]);
    expect(estadoDoProblemaPersistente()).not.toBeNull();
  });

  it('o estado devolvido é uma cópia (quem consome não altera o módulo)', () => {
    durante(PERSISTENTE_APOS_MS + 1000, ROSTO);
    const e = estadoDoProblemaPersistente()!;
    e.mensagem = 'alterada';
    expect(estadoDoProblemaPersistente()?.mensagem).toBe(ROSTO.mensagem);
  });

  it('guarda o último instante com o olhar rastreando sem problema (fora da medição)', async () => {
    const m = await import('./problemaDoRastreamento');
    m._reiniciarParaTeste();
    expect(m.ultimoRastreamentoOk()).toBeNull();
    m.informarProblemaDoRastreamento(null, { emMedicao: false, rastreando: false }, 1000);
    expect(m.ultimoRastreamentoOk()).toBeNull();
    m.informarProblemaDoRastreamento(null, { emMedicao: true, rastreando: true }, 2000);
    expect(m.ultimoRastreamentoOk()).toBeNull();
    m.informarProblemaDoRastreamento(null, { emMedicao: false, rastreando: true }, 3000);
    expect(m.ultimoRastreamentoOk()).toBe(3000);
    m.informarProblemaDoRastreamento({ tipo: 'camera', mensagem: 'x' }, { emMedicao: false, rastreando: true }, 4000);
    expect(m.ultimoRastreamentoOk()).toBe(3000);
    m._reiniciarParaTeste();
  });
});

