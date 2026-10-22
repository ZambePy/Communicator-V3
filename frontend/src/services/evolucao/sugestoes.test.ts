import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DWELL_MAX_MS } from '../../dwellMs';
import { agregarPorSemana, type Evolucao } from './agregar';
import { somarDias } from './fuso';
import type { DiaDeUso } from './registroDeUso';
import { AVISO_NAO_E_DIAGNOSTICO, MAX_SUGESTOES, sugerir, type Sugestao } from './sugestoes';

// Sugestões CONSERVADORAS: observam, sugerem o que o cuidador pode considerar e
// nunca mudam nada sozinhas. Só olham semanas completas. Todas dizem que não
// são diagnóstico.
//
// Calendário de 2026: "agora" é quarta 21/10. As semanas completas são as de
// 28/09, 05/10 e 12/10; a de 19/10 está em andamento.

const AGORA = Date.parse('2026-10-21T15:00:00Z');
const INICIOS = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];

interface Semana {
  erro?: number;
  uso?: Partial<DiaDeUso>;
}

const diaDeUso = (data: string, extra: Partial<DiaDeUso>): DiaDeUso => ({
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

/** Constrói a evolução pela agregação de verdade: as sugestões leem o que ela entrega. */
function evolucaoCom(semanas: Semana[]): Evolucao {
  const calibracoes: { errorDeg: number; timestamp: string }[] = [];
  const uso: DiaDeUso[] = [];
  semanas.forEach((s, i) => {
    const quarta = somarDias(INICIOS[i], 2);
    if (s.erro !== undefined) calibracoes.push({ errorDeg: s.erro, timestamp: `${quarta}T15:00:00Z` });
    if (s.uso) uso.push(diaDeUso(quarta, s.uso));
  });
  return agregarPorSemana({ calibracoes, uso, agora: AGORA });
}

/** Duas horas de uso, para a taxa por hora valer. */
const duasHoras = (extra: Partial<DiaDeUso> = {}): Partial<DiaDeUso> => ({ minutosUteis: 120, dwellSomaMs: 3000, dwellAmostras: 2, ...extra });

const ids = (s: Sugestao[]) => s.map((x) => x.id);
const CONTEXTO = { dwellMs: 1500 };

describe('sugerir', () => {
  describe('sem base para comparar', () => {
    it('nada registrado: diz que ainda é cedo — e só isso', () => {
      const s = sugerir(evolucaoCom([]), CONTEXTO);
      expect(ids(s)).toEqual(['poucos-dados']);
    });

    it('uma semana completa só ainda não dá comparação', () => {
      const s = sugerir(evolucaoCom([{}, {}, { erro: 2, uso: duasHoras() }]), CONTEXTO);
      // As linhas começam na primeira semana com dado: só a de 12/10 é completa.
      expect(ids(s)).toEqual(['poucos-dados']);
    });

    it('a semana em andamento não conta, por pior que esteja', () => {
      const s = sugerir(
        evolucaoCom([{ erro: 1, uso: duasHoras({ avisosDeFadiga: 0 }) }, { erro: 1, uso: duasHoras() }, { erro: 1, uso: duasHoras() }, { erro: 9, uso: duasHoras({ avisosDeFadiga: 50, desfazer: 90 }) }]),
        CONTEXTO,
      );
      expect(ids(s)).toEqual(['sem-alertas']);
    });
  });

  describe('cada regra', () => {
    it('erro da calibração aumentou', () => {
      const s = sugerir(evolucaoCom([{ erro: 1.0 }, { erro: 1.0 }, { erro: 2.0 }]), CONTEXTO);
      expect(ids(s)).toEqual(['erro-subiu']);
      const e = s[0];
      expect(e.observacao).toContain('1,0°');
      expect(e.observacao).toContain('2,0°');
      expect(e.observacao).toContain('05/10 a 11/10');
      expect(e.observacao).toContain('12/10 a 18/10');
      expect(e.ir).toEqual({ rotulo: 'Refazer a calibração', rota: '/calibration-check' });
    });

    it('erro estável, dentro do ruído, ou que caiu: nenhuma sugestão de erro', () => {
      expect(ids(sugerir(evolucaoCom([{ erro: 1.0 }, { erro: 1.0 }, { erro: 1.2 }]), CONTEXTO))).not.toContain('erro-subiu');
      expect(ids(sugerir(evolucaoCom([{ erro: 2.0 }, { erro: 2.0 }, { erro: 1.0 }]), CONTEXTO))).not.toContain('erro-subiu');
    });

    it('avisos de fadiga aumentaram', () => {
      const s = sugerir(evolucaoCom([{}, { uso: duasHoras({ avisosDeFadiga: 1 }) }, { uso: duasHoras({ avisosDeFadiga: 4 }) }]), CONTEXTO);
      expect(ids(s)).toEqual(['fadiga-subiu']);
      expect(s[0].observacao).toContain('0,5');
      expect(s[0].observacao).toContain('2,0');
    });

    it('a velocidade de escrita caiu', () => {
      const s = sugerir(
        evolucaoCom([{}, { uso: duasHoras({ caracteres: 200, msDigitando: 300_000 }) }, { uso: duasHoras({ caracteres: 100, msDigitando: 300_000 }) }]),
        CONTEXTO,
      );
      expect(ids(s)).toEqual(['velocidade-caiu']);
      expect(s[0].observacao).toContain('40');
      expect(s[0].observacao).toContain('20');
    });

    it('velocidade caiu E fadiga subiu juntas: uma sugestão só, as duas separadas saem', () => {
      const s = sugerir(
        evolucaoCom([
          {},
          { uso: duasHoras({ caracteres: 200, msDigitando: 300_000, avisosDeFadiga: 1 }) },
          { uso: duasHoras({ caracteres: 100, msDigitando: 300_000, avisosDeFadiga: 4 }) },
        ]),
        CONTEXTO,
      );
      expect(ids(s)).toEqual(['velocidade-e-fadiga']);
    });

    describe('mais correções (desfazer)', () => {
      const semanas = [{}, { uso: duasHoras({ desfazer: 6 }) }, { uso: duasHoras({ desfazer: 18 }) }];

      it('com espaço no dwell, sugere UM passo a mais e diz que a decisão é do cuidador', () => {
        const s = sugerir(evolucaoCom(semanas), { dwellMs: 1500 });
        expect(ids(s)).toEqual(['desfazer-subiu']);
        expect(s[0].sugestao).toContain('1,5 s');
        expect(s[0].sugestao).toContain('1,6 s');
        expect(s[0].sugestao).toMatch(/nunca muda ajustes sozinha/i);
        expect(s[0].ir).toEqual({ rotulo: 'Ajustar o tempo de fixação', rota: '/accessibility' });
      });

      it('com o dwell já no máximo, não sugere aumentar — sugere conferir a câmera e recalibrar', () => {
        const s = sugerir(evolucaoCom(semanas), { dwellMs: DWELL_MAX_MS });
        expect(ids(s)).toEqual(['desfazer-subiu']);
        expect(s[0].sugestao).toMatch(/já está no máximo/i);
        expect(s[0].sugestao).not.toMatch(/aumentar/i);
        expect(s[0].ir?.rota).toBe('/calibration-check');
      });
    });

    it('o uso caiu bastante', () => {
      const s = sugerir(evolucaoCom([{}, { uso: { minutosUteis: 300 } }, { uso: { minutosUteis: 100 } }]), CONTEXTO);
      expect(ids(s)).toEqual(['uso-caiu']);
      expect(s[0].observacao).toContain('100');
      expect(s[0].observacao).toContain('300');
    });

    it('o uso sumiu (nenhum registro na última semana): também é "uso caiu"', () => {
      const s = sugerir(evolucaoCom([{}, { uso: { minutosUteis: 300 } }, { erro: 1.5 }]), CONTEXTO);
      expect(ids(s)).toEqual(['uso-caiu']);
      expect(s[0].observacao).toMatch(/nenhum uso registrado/i);
    });

    it('queda pequena de uso não é motivo de aviso', () => {
      const s = sugerir(evolucaoCom([{}, { uso: { minutosUteis: 300 } }, { uso: { minutosUteis: 220 } }]), CONTEXTO);
      expect(ids(s)).not.toContain('uso-caiu');
    });

    it('uso pequeno demais antes para dizer que "caiu bastante"', () => {
      const s = sugerir(evolucaoCom([{}, { uso: { minutosUteis: 40 } }, { uso: { minutosUteis: 10 } }]), CONTEXTO);
      expect(ids(s)).not.toContain('uso-caiu');
    });
  });

  describe('quando nada pede atenção', () => {
    const igual: Semana = { erro: 1.5, uso: duasHoras({ avisosDeFadiga: 2, desfazer: 6, caracteres: 100, msDigitando: 300_000 }) };

    it('diz que nada mudou além do normal', () => {
      expect(ids(sugerir(evolucaoCom([igual, igual, igual]), CONTEXTO))).toEqual(['sem-alertas']);
    });

    it('melhora não gera alerta: a velocidade subiu, o erro caiu', () => {
      const melhor: Semana = { erro: 0.8, uso: duasHoras({ avisosDeFadiga: 2, desfazer: 6, caracteres: 200, msDigitando: 300_000 }) };
      expect(ids(sugerir(evolucaoCom([igual, igual, melhor]), CONTEXTO))).toEqual(['sem-alertas']);
    });

    it('"sem alertas" nunca aparece junto de um alerta', () => {
      const s = sugerir(evolucaoCom([{ erro: 1 }, { erro: 1 }, { erro: 3 }]), CONTEXTO);
      expect(ids(s)).not.toContain('sem-alertas');
    });
  });

  describe('limites', () => {
    const tudoPiorou = evolucaoCom([
      {},
      { erro: 1.0, uso: duasHoras({ avisosDeFadiga: 1, desfazer: 6, caracteres: 200, msDigitando: 300_000, minutosUteis: 300 }) },
      { erro: 2.5, uso: duasHoras({ avisosDeFadiga: 5, desfazer: 20, caracteres: 100, msDigitando: 300_000, minutosUteis: 100 }) },
    ]);

    it(`no máximo ${MAX_SUGESTOES} sugestões, as mais importantes primeiro`, () => {
      const s = sugerir(tudoPiorou, CONTEXTO);
      expect(s.length).toBeLessThanOrEqual(MAX_SUGESTOES);
      expect(ids(s)).toEqual(['erro-subiu', 'velocidade-e-fadiga', 'desfazer-subiu', 'uso-caiu']);
    });

    it('cada sugestão aparece uma vez só', () => {
      const s = ids(sugerir(tudoPiorou, CONTEXTO));
      expect(new Set(s).size).toBe(s.length);
    });
  });

  describe('o que toda sugestão tem de ter', () => {
    const cenarios: Record<string, Evolucao> = {
      'sem dados': evolucaoCom([]),
      'erro subiu': evolucaoCom([{ erro: 1 }, { erro: 1 }, { erro: 3 }]),
      'tudo igual': evolucaoCom([{ erro: 1 }, { erro: 1 }, { erro: 1 }]),
      'uso caiu': evolucaoCom([{}, { uso: { minutosUteis: 300 } }, { uso: { minutosUteis: 50 } }]),
      'desfazer subiu': evolucaoCom([{}, { uso: duasHoras({ desfazer: 6 }) }, { uso: duasHoras({ desfazer: 18 }) }]),
      'fadiga e velocidade': evolucaoCom([
        {},
        { uso: duasHoras({ caracteres: 200, msDigitando: 300_000, avisosDeFadiga: 1 }) },
        { uso: duasHoras({ caracteres: 100, msDigitando: 300_000, avisosDeFadiga: 4 }) },
      ]),
    };

    for (const [nome, evolucao] of Object.entries(cenarios)) {
      it(`${nome}: diz que NÃO é diagnóstico, não afirma doença e traz o que fazer`, () => {
        const s = sugerir(evolucao, CONTEXTO);
        expect(s.length).toBeGreaterThan(0);
        for (const x of s) {
          expect(x.aviso).toBe(AVISO_NAO_E_DIAGNOSTICO);
          expect(x.titulo.length).toBeGreaterThan(0);
          expect(x.observacao.length).toBeGreaterThan(0);
          expect(x.sugestao.length).toBeGreaterThan(0);
          // Acompanhamento, não rótulo clínico. ("ELA" só em maiúsculas: "ela" é um pronome.)
          const texto = `${x.titulo} ${x.observacao} ${x.sugestao}`;
          expect(texto).not.toMatch(/progress[aã]o|agravamento|doen[cç]a|piora cl[ií]nica/i);
          expect(texto).not.toMatch(/\bELA\b/);
        }
      });
    }

    it('o aviso é exatamente "não é diagnóstico"', () => {
      expect(AVISO_NAO_E_DIAGNOSTICO).toMatch(/não é diagnóstico/i);
      expect(AVISO_NAO_E_DIAGNOSTICO).toMatch(/equipe de saúde/i);
    });

    it('as ações levam só a telas que existem no app', () => {
      const app = readFileSync(join(__dirname, '../../App.tsx'), 'utf8');
      const rotas = new Set<string>();
      for (const evolucao of Object.values(cenarios)) {
        for (const s of sugerir(evolucao, CONTEXTO)) if (s.ir) rotas.add(s.ir.rota);
      }
      for (const rota of rotas) expect(app, rota).toContain(`path="${rota}"`);
    });
  });

  describe('nunca muda ajustes sozinha', () => {
    it('só devolve texto: o contexto e a evolução congelados passam, e nada do que veio muda', () => {
      const evolucao = evolucaoCom([{ erro: 1 }, { erro: 1 }, { erro: 3 }]);
      const copia = JSON.stringify(evolucao);
      const contexto = Object.freeze({ dwellMs: 1500 });
      expect(() => sugerir(evolucao, contexto)).not.toThrow();
      expect(JSON.stringify(evolucao)).toBe(copia);
    });

    it('o módulo nem sequer enxerga os ajustes: não importa o contexto de configurações', () => {
      const fonte = readFileSync(join(__dirname, 'sugestoes.ts'), 'utf8');
      expect(fonte).not.toMatch(/SettingsContext|useSettings|updateSettings|setSettings|localStorage/);
    });
  });
});
