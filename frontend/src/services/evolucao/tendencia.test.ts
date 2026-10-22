import { describe, it, expect } from 'vitest';
import { PALAVRA_DA_DIRECAO, SETA_DA_DIRECAO, compararMetrica, leituraDaTendencia, type Metrica } from './tendencia';

// A seta só aparece quando a mudança é maior que o ruído de uma semana para a
// outra. Uma seta que oscila a cada 0,1° ensina o cuidador a ignorá-la — e a
// que o médico vai ver na consulta tem de valer alguma coisa.

describe('compararMetrica', () => {
  it('sem número de um dos lados não há comparação', () => {
    expect(compararMetrica('erro', null, 1.2)).toEqual({ direcao: 'sem-dados', variacao: null });
    expect(compararMetrica('erro', 1.2, null)).toEqual({ direcao: 'sem-dados', variacao: null });
    expect(compararMetrica('erro', Number.NaN, 1)).toEqual({ direcao: 'sem-dados', variacao: null });
    expect(compararMetrica('erro', 1, Number.POSITIVE_INFINITY)).toEqual({ direcao: 'sem-dados', variacao: null });
  });

  describe('erro da calibração (graus): exige 10 % e 0,3°', () => {
    it('mudança grande sobe e desce', () => {
      expect(compararMetrica('erro', 1.0, 1.4).direcao).toBe('subiu');
      expect(compararMetrica('erro', 1.4, 1.0).direcao).toBe('desceu');
      expect(compararMetrica('erro', 1.0, 1.4).variacao).toBeCloseTo(0.4, 6);
    });

    it('mudança pequena em valor absoluto é ruído, mesmo sendo 20 % de um erro baixo', () => {
      expect(compararMetrica('erro', 1.0, 1.2).direcao).toBe('estavel');
    });

    it('mudança grande em valor absoluto mas pequena em proporção também é ruído', () => {
      expect(compararMetrica('erro', 5.0, 5.4).direcao).toBe('estavel');
    });
  });

  it('caracteres por minuto: exige 10 % e 1 caractere', () => {
    expect(compararMetrica('cpm', 20, 24).direcao).toBe('subiu');
    expect(compararMetrica('cpm', 20, 20.8).direcao).toBe('estavel');
    expect(compararMetrica('cpm', 20, 15).direcao).toBe('desceu');
  });

  it('dwell em uso: exige 5 % e 100 ms (um passo do ajuste)', () => {
    expect(compararMetrica('dwell', 1500, 1700).direcao).toBe('subiu');
    expect(compararMetrica('dwell', 1500, 1550).direcao).toBe('estavel');
    expect(compararMetrica('dwell', 1500, 1400).direcao).toBe('desceu');
  });

  it('minutos úteis: exige 15 % e 10 minutos', () => {
    expect(compararMetrica('minutos', 100, 130).direcao).toBe('subiu');
    expect(compararMetrica('minutos', 100, 108).direcao).toBe('estavel');
    expect(compararMetrica('minutos', 100, 60).direcao).toBe('desceu');
  });

  it('avisos de fadiga e desfazer (por hora de uso): exige 20 % e 1 por hora', () => {
    for (const m of ['fadiga', 'desfazer'] as const) {
      expect(compararMetrica(m, 2, 3.5).direcao, m).toBe('subiu');
      expect(compararMetrica(m, 2, 2.5).direcao, m).toBe('estavel');
      expect(compararMetrica(m, 4, 2).direcao, m).toBe('desceu');
    }
  });

  it('de zero para algo vale só o limite absoluto (não há proporção de zero)', () => {
    expect(compararMetrica('minutos', 0, 30).direcao).toBe('subiu');
    expect(compararMetrica('minutos', 0, 5).direcao).toBe('estavel');
    expect(compararMetrica('fadiga', 0, 0).direcao).toBe('estavel');
  });

  it('o limite é inclusivo nos dois critérios', () => {
    // 20 → 22 é exatamente 10 % e 2 caracteres.
    expect(compararMetrica('cpm', 20, 22).direcao).toBe('subiu');
  });
});

describe('leitura da tendência', () => {
  const leitura = (m: Metrica, d: Parameters<typeof leituraDaTendencia>[1]) => leituraDaTendencia(m, d);

  it('erro, fadiga e desfazer: subir é desfavorável e descer é favorável', () => {
    for (const m of ['erro', 'fadiga', 'desfazer'] as const) {
      expect(leitura(m, 'subiu'), m).toBe('desfavoravel');
      expect(leitura(m, 'desceu'), m).toBe('favoravel');
    }
  });

  it('velocidade de escrita: subir é favorável e descer é desfavorável', () => {
    expect(leitura('cpm', 'subiu')).toBe('favoravel');
    expect(leitura('cpm', 'desceu')).toBe('desfavoravel');
  });

  it('dwell e minutos úteis não têm lado bom: o dwell foi escolhido por alguém, e mais uso nem sempre é melhor', () => {
    for (const m of ['dwell', 'minutos'] as const) {
      expect(leitura(m, 'subiu'), m).toBe('neutra');
      expect(leitura(m, 'desceu'), m).toBe('neutra');
    }
  });

  it('estável e sem dados são neutros em qualquer métrica', () => {
    expect(leitura('erro', 'estavel')).toBe('neutra');
    expect(leitura('cpm', 'sem-dados')).toBe('neutra');
  });
});

describe('como a tendência aparece', () => {
  it('toda direção tem uma seta e uma palavra: a cor nunca é o único sinal', () => {
    for (const d of ['subiu', 'desceu', 'estavel', 'sem-dados'] as const) {
      expect(SETA_DA_DIRECAO[d].length).toBeGreaterThan(0);
      expect(PALAVRA_DA_DIRECAO[d].length).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(SETA_DA_DIRECAO)).size).toBe(4);
    expect(new Set(Object.values(PALAVRA_DA_DIRECAO)).size).toBe(4);
  });
});
