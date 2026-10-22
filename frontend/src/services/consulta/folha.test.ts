import { describe, expect, it } from 'vitest';
import { agregarPorSemana } from '../evolucao/agregar';
import type { DiaDeUso } from '../evolucao/registroDeUso';
import type { RegistroDeDor } from '../../utils/clinicalLogger';
import type { EntradaDoDiario } from './diario';
import type { PerguntaDaConsulta } from './perguntas';
import {
  AVISO_DA_FOLHA,
  MAX_PERGUNTAS_POR_AUTOR_NA_FOLHA,
  MAX_TEXTO_DA_PERGUNTA_NA_FOLHA,
  MAX_LUGAR_NA_FOLHA,
  NOTA_MAXIMA_NA_FOLHA,
  montarFolha,
  type EntradaDaFolha,
} from './folha';

// O CONTEÚDO da folha de 1 página que o paciente leva ao médico: as últimas
// 7 ou 30 dias, dia a dia, mais o resumo das semanas e as perguntas. A folha
// tem de caber numa página A4 mesmo no pior caso, então cada seção tem teto —
// e o que foi cortado é dito, nunca escondido.
//
// "Agora" é quarta 21/10/2026, 12h em Brasília.

const AGORA = Date.parse('2026-10-21T15:00:00Z');

const dor = (iso: string, lugar: string, nivel: number): RegistroDeDor => ({
  id: `${iso}${lugar}`,
  local: lugar.toLowerCase(),
  lugar,
  nivel,
  frase: `Dói ${lugar}`,
  timestamp: iso,
});

const pergunta = (texto: string, quem: 'paciente' | 'cuidador', feita = false, i = 0): PerguntaDaConsulta => ({
  id: `${quem}-${i}-${texto}`,
  texto,
  quem,
  criadaEm: new Date(AGORA + i).toISOString(),
  feita,
});

const uso = (dia: string, extra: Partial<DiaDeUso> = {}): DiaDeUso => ({
  dia,
  minutosUteis: 0,
  ultimoMinuto: 0,
  caracteres: 0,
  msDigitando: 0,
  desfazer: 0,
  avisosDeFadiga: 0,
  dwellSomaMs: 0,
  dwellAmostras: 0,
  ...extra,
});

function entrada(extra: Partial<EntradaDaFolha> = {}): EntradaDaFolha {
  return {
    periodo: 7,
    agora: AGORA,
    paciente: 'Maria',
    dores: [],
    diario: [],
    evolucao: agregarPorSemana({ calibracoes: [], uso: [], agora: AGORA }),
    perguntas: [],
    ...extra,
  };
}

describe('montarFolha', () => {
  describe('o período', () => {
    it('7 dias: uma linha por dia, do mais antigo ao de hoje, com os dias vazios à vista', () => {
      const f = montarFolha(entrada({ periodo: 7 }));
      expect(f.dias.map((d) => d.dia)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
      expect(f.intervalo).toBe('15/10/2026 a 21/10/2026');
      expect(f.dias[0].rotulo).toBe('qui 15/10');
      expect(f.dias[6].rotulo).toBe('qua 21/10');
    });

    it('30 dias', () => {
      const f = montarFolha(entrada({ periodo: 30 }));
      expect(f.dias).toHaveLength(30);
      expect(f.dias[0].dia).toBe('2026-09-22');
      expect(f.dias[29].dia).toBe('2026-10-21');
    });

    it('o dia de hoje é o de Brasília, mesmo de madrugada no UTC', () => {
      const f = montarFolha(entrada({ agora: Date.parse('2026-10-22T02:30:00Z') })); // quarta 23h30 em Brasília
      expect(f.dias[f.dias.length - 1].dia).toBe('2026-10-21');
      expect(f.geradaEm).toBe('21/10/2026');
    });

    it('um instante inválido não derruba a montagem', () => {
      expect(() => montarFolha(entrada({ agora: Number.NaN }))).not.toThrow();
    });
  });

  describe('dor (lida do mapa da dor)', () => {
    const dores = [
      dor('2026-10-19T14:00:00Z', 'Cabeça', 4),
      dor('2026-10-19T20:00:00Z', 'Braço esquerdo', 7),
      dor('2026-10-19T21:00:00Z', 'Cabeça', 2),
      dor('2026-10-20T14:00:00Z', 'Pescoço', 3),
      dor('2026-10-10T14:00:00Z', 'Perna', 9), // fora dos 7 dias
    ];

    it('cada dia mostra o maior nível e os lugares; dia sem relato mostra travessão', () => {
      const f = montarFolha(entrada({ dores }));
      const seg = f.dias.find((d) => d.dia === '2026-10-19')!;
      expect(seg.dor).toBe('7/10 · Cabeça, Braço esquerdo');
      expect(seg.nivelDeDor).toBe(7);
      const sab = f.dias.find((d) => d.dia === '2026-10-17')!;
      expect(sab.dor).toBe('–');
      expect(sab.nivelDeDor).toBeNull();
    });

    it('a coluna de dor tem lugar para pouco: 2 lugares com 7 dias, 1 com 30 — o resto vira "+N", nunca some', () => {
      const tres = [
        dor('2026-10-20T14:00:00Z', 'Cabeça', 4),
        dor('2026-10-20T15:00:00Z', 'Cabeça', 3),
        dor('2026-10-20T16:00:00Z', 'Braço esquerdo', 7),
        dor('2026-10-20T17:00:00Z', 'Perna direita', 2),
      ];
      const dia = (periodo: 7 | 30) => montarFolha(entrada({ dores: tres, periodo })).dias.find((d) => d.dia === '2026-10-20')!.dor;
      expect(dia(7)).toBe('7/10 · Cabeça, Braço esquerdo +1');
      expect(dia(30)).toBe('7/10 · Cabeça +2');
    });

    it('nome de lugar muito longo é cortado com reticências (cabe na coluna)', () => {
      const f = montarFolha(entrada({ dores: [dor('2026-10-20T14:00:00Z', 'Parte inferior das costas e quadril', 6)] }));
      const celula = f.dias.find((d) => d.dia === '2026-10-20')!.dor;
      expect(celula).toBe('6/10 · Parte inferior das…');
      expect(celula.length).toBeLessThanOrEqual(7 + MAX_LUGAR_NA_FOLHA);
    });

    it('o resumo conta só o que está no período', () => {
      const f = montarFolha(entrada({ dores }));
      expect(f.dor).toMatchObject({ relatos: 4, diasComDor: 2, nivelMaximo: 7 });
      expect(f.dor.nivelMedio).toBeCloseTo((4 + 7 + 2 + 3) / 4, 9);
      expect(f.dor.lugares[0]).toEqual({ lugar: 'Cabeça', relatos: 2 });
      expect(f.dor.lugares.map((l) => l.lugar)).not.toContain('Perna');
    });

    it('com 30 dias, o relato antigo entra', () => {
      const f = montarFolha(entrada({ dores, periodo: 30 }));
      expect(f.dor.relatos).toBe(5);
      expect(f.dor.nivelMaximo).toBe(9);
    });

    it('o limite do dia é o de Brasília: 02:59Z de segunda ainda é domingo', () => {
      const f = montarFolha(entrada({ dores: [dor('2026-10-19T02:59:00Z', 'Cabeça', 5)] }));
      expect(f.dias.find((d) => d.dia === '2026-10-18')!.nivelDeDor).toBe(5);
      expect(f.dias.find((d) => d.dia === '2026-10-19')!.nivelDeDor).toBeNull();
    });

    it('no máximo 3 lugares no resumo', () => {
      const muitos = ['A', 'B', 'C', 'D', 'E'].map((l, i) => dor(`2026-10-20T1${i}:00:00Z`, `Lugar ${l}`, 3));
      expect(montarFolha(entrada({ dores: muitos })).dor.lugares).toHaveLength(3);
    });

    it('sem relato nenhum, o resumo diz zero — não some', () => {
      const f = montarFolha(entrada());
      expect(f.dor).toEqual({ relatos: 0, diasComDor: 0, nivelMaximo: null, nivelMedio: null, lugares: [] });
    });
  });

  describe('sono e humor', () => {
    const diario: EntradaDoDiario[] = [
      { dia: '2026-10-19', sono: 4, humor: 2, nota: 'Dormi bem, mas amanheci cansado.' },
      { dia: '2026-10-20', sono: 2, humor: 4, nota: '' },
    ];

    it('cada dia traz a palavra e o número, e a média do período', () => {
      const f = montarFolha(entrada({ diario }));
      const seg = f.dias.find((d) => d.dia === '2026-10-19')!;
      expect(seg.sono).toBe('Bom (4)');
      expect(seg.humor).toBe('Mal (2)');
      expect(seg.nota).toBe('Dormi bem, mas amanheci cansado.');
      expect(f.sono).toEqual({ media: '3,0', dias: 2 });
      expect(f.humor).toEqual({ media: '3,0', dias: 2 });
    });

    it('dia sem registro mostra travessão; sem nenhum, a média é travessão', () => {
      const f = montarFolha(entrada());
      expect(f.dias[0]).toMatchObject({ sono: '–', humor: '–', nota: '' });
      expect(f.sono).toEqual({ media: '–', dias: 0 });
    });

    it('a nota é resumida (e a folha avisa) — mais curta quando são 30 dias', () => {
      const longa: EntradaDoDiario[] = [{ dia: '2026-10-20', sono: null, humor: null, nota: 'x'.repeat(250) }];
      const f7 = montarFolha(entrada({ diario: longa, periodo: 7 }));
      const f30 = montarFolha(entrada({ diario: longa, periodo: 30 }));
      const n7 = f7.dias.find((d) => d.dia === '2026-10-20')!.nota;
      const n30 = f30.dias.find((d) => d.dia === '2026-10-20')!.nota;
      expect(n7.length).toBeLessThanOrEqual(NOTA_MAXIMA_NA_FOLHA[7]);
      expect(n30.length).toBeLessThanOrEqual(NOTA_MAXIMA_NA_FOLHA[30]);
      expect(n30.length).toBeLessThan(n7.length);
      expect(n7.endsWith('…')).toBe(true);
      expect(f7.notasResumidas).toBe(true);
      expect(montarFolha(entrada({ diario })).notasResumidas).toBe(false);
    });

    it('diário fora do período não entra', () => {
      const f = montarFolha(entrada({ diario: [{ dia: '2026-09-01', sono: 5, humor: 5, nota: 'antigo' }] }));
      expect(f.sono.dias).toBe(0);
    });
  });

  describe('semanas (a evolução)', () => {
    const evolucao = agregarPorSemana({
      calibracoes: [
        { errorDeg: 1.0, timestamp: '2026-09-30T15:00:00Z' },
        { errorDeg: 1.5, timestamp: '2026-10-07T15:00:00Z' },
        { errorDeg: 2.0, timestamp: '2026-10-14T15:00:00Z' },
      ],
      uso: [uso('2026-10-14', { minutosUteis: 120, caracteres: 100, msDigitando: 300_000, avisosDeFadiga: 3, desfazer: 9 }), uso('2026-10-20', { minutosUteis: 15 })],
      agora: AGORA,
    });

    it('7 dias: as 2 últimas semanas; 30 dias: até as 5 últimas — a em andamento marcada', () => {
      const f7 = montarFolha(entrada({ evolucao }));
      expect(f7.semanas).toHaveLength(2);
      expect(f7.semanas[1]).toMatchObject({ periodo: '19/10 a 25/10', situacao: 'em andamento' });
      expect(f7.semanas[0]).toMatchObject({ periodo: '12/10 a 18/10', situacao: '', erro: '2,0°', minutos: '120 min', cpm: '20' });

      const f30 = montarFolha(entrada({ evolucao, periodo: 30 }));
      expect(f30.semanas.length).toBeLessThanOrEqual(5);
      expect(f30.semanas.length).toBe(4); // 28/09, 05/10, 12/10, 19/10
    });

    it('semana sem registro de uso mostra travessão, não "0 min"', () => {
      const f = montarFolha(entrada({ evolucao, periodo: 30 }));
      expect(f.semanas[0].minutos).toBe('–');
    });

    it('sem nenhuma semana, a lista vem vazia', () => {
      expect(montarFolha(entrada()).semanas).toEqual([]);
    });
  });

  describe('perguntas', () => {
    it('só as pendentes, separadas por quem fez, na ordem em que foram feitas', () => {
      const f = montarFolha(
        entrada({
          perguntas: [
            pergunta('Posso comer sozinho?', 'paciente', false, 1),
            pergunta('Qual o horário do remédio?', 'cuidador', false, 2),
            pergunta('Já respondida?', 'paciente', true, 3),
            pergunta('Posso dormir inclinado?', 'paciente', false, 4),
          ],
        }),
      );
      expect(f.perguntas.paciente).toEqual(['Posso comer sozinho?', 'Posso dormir inclinado?']);
      expect(f.perguntas.cuidador).toEqual(['Qual o horário do remédio?']);
      expect(f.perguntas.omitidas).toBe(0);
    });

    it('cada autor tem teto — menor na folha de 30 dias, que já está cheia de dias —; o que passou é contado, não escondido', () => {
      expect(MAX_PERGUNTAS_POR_AUTOR_NA_FOLHA).toEqual({ 7: 8, 30: 6 });
      for (const periodo of [7, 30] as const) {
        const teto = MAX_PERGUNTAS_POR_AUTOR_NA_FOLHA[periodo];
        const muitas = Array.from({ length: teto + 3 }, (_, i) => pergunta(`Pergunta ${i}?`, 'paciente', false, i));
        const f = montarFolha(entrada({ periodo, perguntas: muitas }));
        expect(f.perguntas.paciente).toHaveLength(teto);
        expect(f.perguntas.omitidas).toBe(3);
        // As primeiras — as mais antigas, que a pessoa quer há mais tempo — ficam.
        expect(f.perguntas.paciente[0]).toBe('Pergunta 0?');
      }
    });

    it('pergunta longa é cortada com reticências', () => {
      const f = montarFolha(entrada({ perguntas: [pergunta(`${'a'.repeat(300)}?`, 'cuidador')] }));
      const t = f.perguntas.cuidador[0];
      expect(t.length).toBeLessThanOrEqual(MAX_TEXTO_DA_PERGUNTA_NA_FOLHA);
      expect(t.endsWith('…')).toBe(true);
    });
  });

  describe('cabeçalho e rodapé', () => {
    it('traz o nome do paciente (ou "Paciente"), o período e o aviso de que não é diagnóstico', () => {
      const f = montarFolha(entrada());
      expect(f.paciente).toBe('Maria');
      expect(montarFolha(entrada({ paciente: '   ' })).paciente).toBe('Paciente');
      expect(f.titulo).toMatch(/consulta/i);
      expect(f.aviso).toBe(AVISO_DA_FOLHA);
      expect(AVISO_DA_FOLHA).toMatch(/não é diagnóstico/i);
      expect(AVISO_DA_FOLHA).toMatch(/neste computador/i);
    });

    it('nome muito longo é cortado', () => {
      expect(montarFolha(entrada({ paciente: 'N'.repeat(200) })).paciente.length).toBeLessThanOrEqual(60);
    });
  });

  describe('o pior caso cabe numa página: cada seção tem teto', () => {
    it('30 dias lotados, 5 semanas, 8+8 perguntas longas', () => {
      const dores = Array.from({ length: 200 }, (_, i) => dor(`2026-10-${String(1 + (i % 21)).padStart(2, '0')}T14:00:00Z`, `Lugar ${i % 9}`, i % 11));
      const diario: EntradaDoDiario[] = Array.from({ length: 30 }, (_, i) => ({
        dia: new Date(Date.UTC(2026, 8, 22 + i)).toISOString().slice(0, 10),
        sono: 5,
        humor: 1,
        nota: 'n'.repeat(280),
      }));
      const perguntas = [
        ...Array.from({ length: 20 }, (_, i) => pergunta('p'.repeat(200), 'paciente', false, i)),
        ...Array.from({ length: 20 }, (_, i) => pergunta('c'.repeat(200), 'cuidador', false, 100 + i)),
      ];
      const evolucao = agregarPorSemana({
        calibracoes: Array.from({ length: 8 }, (_, i) => ({ errorDeg: 1 + i / 10, timestamp: new Date(AGORA - i * 7 * 86_400_000).toISOString() })),
        uso: Array.from({ length: 60 }, (_, i) => uso(new Date(Date.UTC(2026, 7, 25 + i)).toISOString().slice(0, 10), { minutosUteis: 60 })),
        agora: AGORA,
      });
      const f = montarFolha(entrada({ periodo: 30, dores, diario, perguntas, evolucao }));

      expect(f.dias).toHaveLength(30);
      expect(f.semanas.length).toBeLessThanOrEqual(5);
      expect(f.perguntas.paciente.length).toBeLessThanOrEqual(MAX_PERGUNTAS_POR_AUTOR_NA_FOLHA[30]);
      expect(f.perguntas.cuidador.length).toBeLessThanOrEqual(MAX_PERGUNTAS_POR_AUTOR_NA_FOLHA[30]);
      // 20 de cada autor, 6 de cada na folha: 28 ficam no aparelho, e a folha diz.
      expect(f.perguntas.omitidas).toBe(28);
      expect(f.dor.lugares.length).toBeLessThanOrEqual(3);
      for (const d of f.dias) expect(d.nota.length).toBeLessThanOrEqual(NOTA_MAXIMA_NA_FOLHA[30]);
      for (const t of [...f.perguntas.paciente, ...f.perguntas.cuidador]) expect(t.length).toBeLessThanOrEqual(MAX_TEXTO_DA_PERGUNTA_NA_FOLHA);
    });
  });

  it('a folha traz só o que a consulta pede: nenhuma frase falada, só a dor, o diário, as semanas e as perguntas', () => {
    const f = montarFolha(entrada());
    expect(Object.keys(f).sort()).toEqual(
      ['aviso', 'dias', 'dor', 'geradaEm', 'humor', 'intervalo', 'notasResumidas', 'paciente', 'perguntas', 'periodo', 'semanas', 'sono', 'titulo'].sort(),
    );
  });
});
