import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_SEMANAS_NA_EVOLUCAO,
  MIN_CARACTERES_PARA_VELOCIDADE,
  MIN_MINUTOS_PARA_TAXA,
  MIN_MS_DIGITANDO_PARA_VELOCIDADE,
  agregarPorSemana,
  type Evolucao,
} from './agregar';
import type { DiaDeUso } from './registroDeUso';

// Agregação por SEMANA, de segunda a domingo, no horário de Brasília.
//
// Referências de calendário de 2026: 19/10 é segunda. "Agora" é quarta 21/10,
// 12h em Brasília — a semana de 19/10 está em andamento; as anteriores, completas.

const AGORA = Date.parse('2026-10-21T15:00:00Z');
const SEM_05 = '2026-10-05';
const SEM_12 = '2026-10-12';
const SEM_19 = '2026-10-19';

const calibracao = (iso: string, erro: number, herdado?: boolean) => ({
  errorDeg: erro,
  timestamp: iso,
  ...(herdado ? { herdado: true } : {}),
});

const dia = (data: string, extra: Partial<DiaDeUso> = {}): DiaDeUso => ({
  dia: data,
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

const daSemana = (e: Evolucao, inicio: string) => {
  const s = e.semanas.find((x) => x.inicio === inicio);
  if (!s) throw new Error(`semana ${inicio} não está na lista: ${e.semanas.map((x) => x.inicio).join(', ')}`);
  return s;
};

describe('agregarPorSemana', () => {
  describe('sem dados', () => {
    it('não inventa semanas vazias para uma pessoa que ainda não tem nada', () => {
      const e = agregarPorSemana({ calibracoes: [], uso: [], agora: AGORA });
      expect(e.semanas).toEqual([]);
      expect(e.temDados).toBe(false);
      expect(e.herdadasDeFora).toBe(0);
    });

    it('um instante inválido de "agora" não derruba', () => {
      const e = agregarPorSemana({ calibracoes: [calibracao('2026-10-14T15:00:00Z', 1)], uso: [], agora: Number.NaN });
      expect(e.semanas).toEqual([]);
    });
  });

  describe('semanas de segunda a domingo, no horário de Brasília', () => {
    const cal = [calibracao('2026-10-19T02:59:59Z', 1.0), calibracao('2026-10-19T03:00:00Z', 3.0)];

    it('domingo 23h59 ainda é a semana que acaba; segunda 00h00 abre a seguinte', () => {
      const e = agregarPorSemana({ calibracoes: cal, uso: [], agora: AGORA });
      expect(daSemana(e, SEM_12).erroMedioDeg).toBe(1.0);
      expect(daSemana(e, SEM_19).erroMedioDeg).toBe(3.0);
    });

    it('cada semana diz de que dia a que dia vai', () => {
      const e = agregarPorSemana({ calibracoes: cal, uso: [], agora: AGORA });
      expect(daSemana(e, SEM_12)).toMatchObject({ inicio: '2026-10-12', fim: '2026-10-18' });
    });

    describe('independe do fuso do computador', () => {
      const original = process.env.TZ;
      afterEach(() => {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
      });

      for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        it(`computador em ${tz}`, () => {
          process.env.TZ = tz;
          const e = agregarPorSemana({ calibracoes: cal, uso: [dia('2026-10-18', { minutosUteis: 7 }), dia('2026-10-19', { minutosUteis: 9 })], agora: AGORA });
          expect(daSemana(e, SEM_12).erroMedioDeg).toBe(1.0);
          expect(daSemana(e, SEM_19).erroMedioDeg).toBe(3.0);
          expect(daSemana(e, SEM_12).minutosUteis).toBe(7);
          expect(daSemana(e, SEM_19).minutosUteis).toBe(9);
        });
      }
    });

    it('a semana em andamento é parcial e as anteriores são completas', () => {
      const e = agregarPorSemana({ calibracoes: cal, uso: [], agora: AGORA });
      expect(daSemana(e, SEM_19).completa).toBe(false);
      expect(daSemana(e, SEM_12).completa).toBe(true);
    });

    it('no domingo a semana ainda não terminou; na segunda ela termina', () => {
      const domingo = Date.parse('2026-10-25T20:00:00Z'); // domingo 17h em Brasília
      const segunda = Date.parse('2026-10-26T03:00:00Z'); // segunda 00h00
      const base = { calibracoes: [calibracao('2026-10-21T15:00:00Z', 1)], uso: [] };
      expect(daSemana(agregarPorSemana({ ...base, agora: domingo }), SEM_19).completa).toBe(false);
      expect(daSemana(agregarPorSemana({ ...base, agora: segunda }), SEM_19).completa).toBe(true);
    });
  });

  describe('a janela de semanas', () => {
    it('vai da primeira semana com dado até a semana de hoje, sem buracos', () => {
      const e = agregarPorSemana({
        calibracoes: [calibracao('2026-10-06T15:00:00Z', 2.0)],
        uso: [dia('2026-10-20', { minutosUteis: 10 })],
        agora: AGORA,
      });
      expect(e.semanas.map((s) => s.inicio)).toEqual([SEM_05, SEM_12, SEM_19]);
      const buraco = daSemana(e, SEM_12);
      expect(buraco.temDados).toBe(false);
      expect(buraco.erroMedioDeg).toBeNull();
      expect(buraco.minutosUteis).toBe(0);
      expect(buraco.medicoes).toBe(0);
    });

    it('termina na semana de hoje mesmo quando os dados acabaram antes', () => {
      const e = agregarPorSemana({ calibracoes: [calibracao('2026-10-06T15:00:00Z', 2.0)], uso: [], agora: AGORA });
      expect(e.semanas[e.semanas.length - 1].inicio).toBe(SEM_19);
      expect(e.semanas[e.semanas.length - 1].temDados).toBe(false);
    });

    it('mostra no máximo as últimas MAX_SEMANAS_NA_EVOLUCAO', () => {
      const antigo = Date.parse('2025-01-08T15:00:00Z');
      const e = agregarPorSemana({ calibracoes: [calibracao(new Date(antigo).toISOString(), 1)], uso: [], agora: AGORA });
      expect(e.semanas).toHaveLength(MAX_SEMANAS_NA_EVOLUCAO);
      expect(e.semanas[e.semanas.length - 1].inicio).toBe(SEM_19);
      // A medição antiga ficou fora da janela, e isso não vira "sem dados" calado:
      expect(e.temDados).toBe(true);
    });

    it('o número de semanas pode ser pedido', () => {
      const e = agregarPorSemana({
        calibracoes: [calibracao('2026-09-01T15:00:00Z', 1), calibracao('2026-10-20T15:00:00Z', 1)],
        uso: [],
        agora: AGORA,
        semanas: 4,
      });
      expect(e.semanas.map((s) => s.inicio)).toEqual(['2026-09-28', SEM_05, SEM_12, SEM_19]);
    });

    it('dado depois de hoje (relógio errado) não abre semana no futuro', () => {
      const e = agregarPorSemana({
        calibracoes: [calibracao('2026-10-20T15:00:00Z', 1)],
        uso: [dia('2027-03-01', { minutosUteis: 500 })],
        agora: AGORA,
      });
      expect(e.semanas[e.semanas.length - 1].inicio).toBe(SEM_19);
      expect(daSemana(e, SEM_19).minutosUteis).toBe(0);
    });
  });

  describe('erro da calibração', () => {
    it('é a média das medições da semana', () => {
      const e = agregarPorSemana({
        calibracoes: [calibracao('2026-10-13T15:00:00Z', 1.0), calibracao('2026-10-15T15:00:00Z', 2.0), calibracao('2026-10-17T15:00:00Z', 3.0)],
        uso: [],
        agora: AGORA,
      });
      expect(daSemana(e, SEM_12).erroMedioDeg).toBeCloseTo(2.0, 9);
      expect(daSemana(e, SEM_12).medicoes).toBe(3);
    });

    it('medição sem número, negativa ou sem data válida fica de fora', () => {
      const e = agregarPorSemana({
        calibracoes: [
          calibracao('2026-10-13T15:00:00Z', 2.0),
          calibracao('2026-10-13T16:00:00Z', Number.NaN),
          calibracao('2026-10-13T17:00:00Z', -1),
          calibracao('não é data', 5),
          calibracao('2026-10-13T18:00:00Z', Number.POSITIVE_INFINITY),
        ],
        uso: [],
        agora: AGORA,
      });
      expect(daSemana(e, SEM_12).erroMedioDeg).toBe(2.0);
      expect(daSemana(e, SEM_12).medicoes).toBe(1);
    });

    describe('medições de antes da separação por paciente (herdadas)', () => {
      const cal = [calibracao('2026-10-13T15:00:00Z', 2.0), calibracao('2026-10-14T15:00:00Z', 6.0, true), calibracao('2026-10-15T15:00:00Z', 6.0, true)];

      it('ficam de fora da curva — podem ser de outra pessoa —, mas a tela é avisada de quantas', () => {
        const e = agregarPorSemana({ calibracoes: cal, uso: [], agora: AGORA });
        expect(daSemana(e, SEM_12).erroMedioDeg).toBe(2.0);
        expect(e.herdadasDeFora).toBe(2);
        expect(e.herdadasIncluidas).toBe(0);
      });

      it('entram quando o cuidador sabe que o computador sempre foi de um paciente só', () => {
        const e = agregarPorSemana({ calibracoes: cal, uso: [], agora: AGORA, incluirHerdadas: true });
        expect(daSemana(e, SEM_12).erroMedioDeg).toBeCloseTo((2 + 6 + 6) / 3, 9);
        expect(daSemana(e, SEM_12).medicoes).toBe(3);
        expect(e.herdadasDeFora).toBe(0);
        expect(e.herdadasIncluidas).toBe(2);
      });

      it('só herdadas e nenhum uso: a tela não mostra curva, mas conta as que deixou de fora', () => {
        const e = agregarPorSemana({ calibracoes: [calibracao('2026-10-14T15:00:00Z', 6.0, true)], uso: [], agora: AGORA });
        expect(e.semanas).toEqual([]);
        expect(e.temDados).toBe(false);
        expect(e.herdadasDeFora).toBe(1);
      });
    });
  });

  describe('uso', () => {
    it('soma minutos úteis, caracteres, avisos de fadiga e desfazer da semana', () => {
      const e = agregarPorSemana({
        calibracoes: [],
        uso: [
          dia('2026-10-12', { minutosUteis: 20, desfazer: 2, avisosDeFadiga: 1 }),
          dia('2026-10-14', { minutosUteis: 35, desfazer: 5, avisosDeFadiga: 0, caracteres: 40 }),
          dia('2026-10-18', { minutosUteis: 5, desfazer: 1, avisosDeFadiga: 2 }),
          dia('2026-10-19', { minutosUteis: 99 }), // semana seguinte
        ],
        agora: AGORA,
      });
      expect(daSemana(e, SEM_12)).toMatchObject({ minutosUteis: 60, desfazer: 8, avisosDeFadiga: 3, caracteres: 40, diasComUso: 3 });
      expect(daSemana(e, SEM_19).minutosUteis).toBe(99);
    });

    it('um dia só com aviso de fadiga é um dia com dado, mas não um dia de uso', () => {
      const e = agregarPorSemana({ calibracoes: [], uso: [dia('2026-10-13', { avisosDeFadiga: 1 })], agora: AGORA });
      expect(daSemana(e, SEM_12)).toMatchObject({ temDados: true, diasComUso: 0, avisosDeFadiga: 1 });
    });

    it('registro com dia inválido é ignorado', () => {
      const e = agregarPorSemana({ calibracoes: [], uso: [dia('ontem', { minutosUteis: 50 }), dia('2026-10-13', { minutosUteis: 10 })], agora: AGORA });
      expect(daSemana(e, SEM_12).minutosUteis).toBe(10);
    });

    describe('caracteres por minuto', () => {
      it('é o total de caracteres sobre o total do tempo digitando — não a média das médias de cada dia', () => {
        const e = agregarPorSemana({
          calibracoes: [],
          uso: [
            dia('2026-10-13', { caracteres: 100, msDigitando: 120_000 }), // 50 por minuto
            dia('2026-10-14', { caracteres: 10, msDigitando: 60_000 }), // 10 por minuto
          ],
          agora: AGORA,
        });
        // 110 caracteres em 3 minutos. A média dos dois dias daria 30.
        expect(daSemana(e, SEM_12).caracteresPorMinuto).toBeCloseTo(110 / 3, 9);
      });

      it('com pouco tempo ou pouco texto medido não há número — um minuto de teste não é velocidade', () => {
        const pouco = agregarPorSemana({
          calibracoes: [],
          uso: [dia('2026-10-13', { caracteres: 500, msDigitando: MIN_MS_DIGITANDO_PARA_VELOCIDADE - 1 })],
          agora: AGORA,
        });
        expect(daSemana(pouco, SEM_12).caracteresPorMinuto).toBeNull();

        const poucoTexto = agregarPorSemana({
          calibracoes: [],
          uso: [dia('2026-10-13', { caracteres: MIN_CARACTERES_PARA_VELOCIDADE - 1, msDigitando: 600_000 })],
          agora: AGORA,
        });
        expect(daSemana(poucoTexto, SEM_12).caracteresPorMinuto).toBeNull();

        const justo = agregarPorSemana({
          calibracoes: [],
          uso: [dia('2026-10-13', { caracteres: MIN_CARACTERES_PARA_VELOCIDADE, msDigitando: MIN_MS_DIGITANDO_PARA_VELOCIDADE })],
          agora: AGORA,
        });
        expect(daSemana(justo, SEM_12).caracteresPorMinuto).toBe(MIN_CARACTERES_PARA_VELOCIDADE);
      });
    });

    describe('dwell em uso', () => {
      it('é a média ponderada pelas amostras (um minuto útil, uma amostra)', () => {
        const e = agregarPorSemana({
          calibracoes: [],
          uso: [
            dia('2026-10-13', { dwellSomaMs: 3000, dwellAmostras: 2 }), // 1500
            dia('2026-10-14', { dwellSomaMs: 1000, dwellAmostras: 1 }), // 1000
          ],
          agora: AGORA,
        });
        // A média dos dias daria 1250; o certo é 4000 / 3.
        expect(daSemana(e, SEM_12).dwellMedioMs).toBeCloseTo(4000 / 3, 9);
      });

      it('sem amostra não há dwell', () => {
        const e = agregarPorSemana({ calibracoes: [], uso: [dia('2026-10-13', { minutosUteis: 10 })], agora: AGORA });
        expect(daSemana(e, SEM_12).dwellMedioMs).toBeNull();
      });
    });

    describe('avisos de fadiga e desfazer por hora de uso', () => {
      it('divide pelas horas úteis da semana', () => {
        const e = agregarPorSemana({
          calibracoes: [],
          uso: [dia('2026-10-13', { minutosUteis: 120, avisosDeFadiga: 3, desfazer: 12 })],
          agora: AGORA,
        });
        expect(daSemana(e, SEM_12).avisosDeFadigaPorHora).toBeCloseTo(1.5, 9);
        expect(daSemana(e, SEM_12).desfazerPorHora).toBeCloseTo(6, 9);
      });

      it('com pouco uso na semana a taxa não é confiável: sem número', () => {
        const e = agregarPorSemana({
          calibracoes: [],
          uso: [dia('2026-10-13', { minutosUteis: MIN_MINUTOS_PARA_TAXA - 1, avisosDeFadiga: 3, desfazer: 12 })],
          agora: AGORA,
        });
        expect(daSemana(e, SEM_12).avisosDeFadigaPorHora).toBeNull();
        expect(daSemana(e, SEM_12).desfazerPorHora).toBeNull();
        // O total continua à vista.
        expect(daSemana(e, SEM_12).avisosDeFadiga).toBe(3);
      });
    });
  });

  describe('tendência (esta semana contra a anterior)', () => {
    const duasSemanas = (anterior: Partial<DiaDeUso>, atual: Partial<DiaDeUso>, calibracoes: ReturnType<typeof calibracao>[] = []) =>
      agregarPorSemana({
        calibracoes,
        uso: [dia('2026-10-07', anterior), dia('2026-10-14', atual)],
        agora: AGORA,
      });

    it('compara semanas completas vizinhas', () => {
      const e = duasSemanas({ minutosUteis: 100 }, { minutosUteis: 60 });
      expect(daSemana(e, SEM_12).tendencias.minutos).toMatchObject({ direcao: 'desceu' });
      expect(daSemana(e, SEM_12).tendencias.minutos.variacao).toBe(-40);
    });

    it('a primeira semana da lista não tem com quem comparar', () => {
      const e = duasSemanas({ minutosUteis: 100 }, { minutosUteis: 60 });
      expect(daSemana(e, SEM_05).tendencias.minutos.direcao).toBe('sem-dados');
    });

    it('a semana em andamento não ganha seta: ela ainda não acabou', () => {
      const e = agregarPorSemana({
        calibracoes: [],
        uso: [dia('2026-10-14', { minutosUteis: 100 }), dia('2026-10-20', { minutosUteis: 5 })],
        agora: AGORA,
      });
      expect(daSemana(e, SEM_19).completa).toBe(false);
      for (const t of Object.values(daSemana(e, SEM_19).tendencias)) expect(t.direcao).toBe('sem-dados');
    });

    it('semana vazia no meio: sem comparação nos dois lados', () => {
      const e = agregarPorSemana({
        calibracoes: [],
        uso: [dia('2026-10-07', { minutosUteis: 100 }), dia('2026-10-21', { minutosUteis: 50 })],
        agora: Date.parse('2026-10-28T15:00:00Z'),
      });
      const vazia = daSemana(e, SEM_12);
      expect(vazia.temDados).toBe(false);
      expect(vazia.tendencias.minutos.direcao).toBe('sem-dados');
      expect(daSemana(e, '2026-10-19').tendencias.minutos.direcao).toBe('sem-dados');
    });

    it('o registro de uso é novo: a primeira semana com uso não "sobe" a partir de semanas que só têm calibração', () => {
      const e = agregarPorSemana({
        calibracoes: [calibracao('2026-10-07T15:00:00Z', 2.0)], // semana de 05/10: só calibração
        uso: [dia('2026-10-14', { minutosUteis: 100 })], // semana de 12/10: primeiro uso registrado
        agora: AGORA,
      });
      expect(daSemana(e, SEM_05).usoRegistrado).toBe(false);
      expect(daSemana(e, SEM_12).usoRegistrado).toBe(true);
      expect(daSemana(e, SEM_12).tendencias.minutos.direcao).toBe('sem-dados');
    });

    it('cobre o erro da calibração', () => {
      const e = duasSemanas({}, {}, [calibracao('2026-10-07T15:00:00Z', 1.0), calibracao('2026-10-14T15:00:00Z', 2.0)]);
      expect(daSemana(e, SEM_12).tendencias.erro.direcao).toBe('subiu');
    });

    it('cobre a velocidade, o dwell e as taxas por hora', () => {
      const e = duasSemanas(
        { minutosUteis: 120, caracteres: 100, msDigitando: 300_000, dwellSomaMs: 3000, dwellAmostras: 2, avisosDeFadiga: 1, desfazer: 6 },
        { minutosUteis: 120, caracteres: 200, msDigitando: 300_000, dwellSomaMs: 3400, dwellAmostras: 2, avisosDeFadiga: 4, desfazer: 6 },
      );
      const t = daSemana(e, SEM_12).tendencias;
      expect(t.cpm.direcao).toBe('subiu'); // 20 → 40
      expect(t.dwell.direcao).toBe('subiu'); // 1500 → 1700
      expect(t.fadiga.direcao).toBe('subiu'); // 0,5 → 2 por hora
      expect(t.desfazer.direcao).toBe('estavel'); // 3 → 3 por hora
      expect(t.minutos.direcao).toBe('estavel');
    });
  });

  it('não altera o que recebe', () => {
    const calibracoes = Object.freeze([Object.freeze(calibracao('2026-10-13T15:00:00Z', 2))]);
    const uso = Object.freeze([Object.freeze(dia('2026-10-13', { minutosUteis: 5 }))]);
    expect(() => agregarPorSemana({ calibracoes, uso, agora: AGORA })).not.toThrow();
  });
});
