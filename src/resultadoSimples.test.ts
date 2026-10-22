import { describe, it, expect } from 'vitest';
import {
  classificarErroPx,
  CLASSE_CSS_DO_ERRO,
  FRASE_DO_TESTE,
  FRASE_DOS_CANTOS_COM_RESULTADO_DEPOIS,
  LIMIAR_BOM_PX,
  LIMIAR_EXCELENTE_PX,
  LIMIAR_REGULAR_PX,
  palavraDoResultado,
  TITULO_DA_PALAVRA,
  type PalavraDoResultado,
} from './resultadoSimples';
import {
  ACOMODACAO_DESDE_A_CHEGADA_MS,
} from './calibration';
import { ACCLIMATION_MS } from './accuracyProtocol';
import {
  CONTRACAO_MS,
  DIAMETRO_DO_ALVO_PX,
  MARCACAO_DO_ALVO_ABC,
  PROPORCAO_DO_CENTRO,
} from './alvoDeFixacao';

// -----------------------------------------------------------------------------
// O resultado em palavras (pedido de 19/10/2026) e a fonte única dos limiares.
// -----------------------------------------------------------------------------

/** A classificação como ela estava escrita no `accuracy.ts` até 19/10/2026. */
function classificacaoAntiga(meanError: number | null): { score: string; colorClass: string } {
  if (meanError === null) return { score: 'Não medido', colorClass: 'accuracy-poor' };
  if (meanError < 30) return { score: 'Excelente', colorClass: 'accuracy-excellent' };
  if (meanError < 60) return { score: 'Bom', colorClass: 'accuracy-good' };
  if (meanError < 100) return { score: 'Regular', colorClass: 'accuracy-regular' };
  return { score: 'Ruim', colorClass: 'accuracy-poor' };
}

/** A classificação como o `accuracy.ts` a monta agora. */
function classificacaoNova(meanError: number | null): { score: string; colorClass: string } {
  const classe = classificarErroPx(meanError);
  return { score: classe ?? 'Não medido', colorClass: classe ? CLASSE_CSS_DO_ERRO[classe] : 'accuracy-poor' };
}

describe('a classificação do teste de precisão não mudou', () => {
  it('saída idêntica à antiga em toda a faixa (o erro médio é finito ou null)', () => {
    // `agregarErros` só faz média de erros finitos e devolve `null` sem
    // nenhum: NaN e infinito não chegam aqui.
    const valores: (number | null)[] = [null];
    for (let v = 0; v <= 250; v += 0.25) valores.push(v);
    valores.push(29.999, 30, 59.999, 60, 99.999, 100, 1e6);
    for (const v of valores) expect(classificacaoNova(v), String(v)).toEqual(classificacaoAntiga(v));
  });

  it('os limiares são os de sempre', () => {
    expect([LIMIAR_EXCELENTE_PX, LIMIAR_BOM_PX, LIMIAR_REGULAR_PX]).toEqual([30, 60, 100]);
  });

  it('sem número finito, não há classe', () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(classificarErroPx(v)).toBeNull();
    }
  });
});

describe('a palavra', () => {
  const sem = { borda: 0, interno: 0 };

  it('Excelente e Bom → Ótima; Regular → Boa; Ruim → refazer a calibração', () => {
    expect(palavraDoResultado({ erroInternoPx: 10, pontosRuins: sem })).toBe('otima');
    expect(palavraDoResultado({ erroInternoPx: 59, pontosRuins: sem })).toBe('otima');
    expect(palavraDoResultado({ erroInternoPx: 60, pontosRuins: sem })).toBe('boa');
    expect(palavraDoResultado({ erroInternoPx: 99, pontosRuins: sem })).toBe('boa');
    expect(palavraDoResultado({ erroInternoPx: 100, pontosRuins: sem })).toBe('refazerTudo');
  });

  it('a ordem: miolo ruim > pontos do miolo > cantos > classe', () => {
    expect(palavraDoResultado({ erroInternoPx: 150, pontosRuins: { borda: 2, interno: 1 } })).toBe('refazerTudo');
    expect(palavraDoResultado({ erroInternoPx: 40, pontosRuins: { borda: 2, interno: 1 } })).toBe('refazerPontos');
    expect(palavraDoResultado({ erroInternoPx: 40, pontosRuins: { borda: 2, interno: 0 } })).toBe('refazerCantos');
    expect(palavraDoResultado({ erroInternoPx: 40, pontosRuins: sem, sessaoRuim: true })).toBe('refazerTudo');
  });

  it('sem medida: "Boa" — não reprova o que não mediu, nem promete "Ótima"', () => {
    expect(palavraDoResultado({ erroInternoPx: null, pontosRuins: sem })).toBe('boa');
  });

  it('cada palavra tem título e frase, e as frases do painel não prometem um botão que ele não tem', () => {
    const palavras: PalavraDoResultado[] = ['otima', 'boa', 'refazerCantos', 'refazerPontos', 'refazerTudo'];
    for (const p of palavras) {
      expect(TITULO_DA_PALAVRA[p].length).toBeGreaterThan(0);
      expect(FRASE_DO_TESTE[p].length).toBeGreaterThan(0);
      // O painel tem Continuar e Refazer a calibração; "refazer só" fica
      // para a tela de resultado (a frase com "na próxima tela").
      expect(FRASE_DO_TESTE[p]).not.toMatch(/refazer só/i);
    }
    expect(TITULO_DA_PALAVRA.otima).toBe('Ótima');
    expect(TITULO_DA_PALAVRA.boa).toBe('Boa');
    expect(TITULO_DA_PALAVRA.refazerCantos).toBe('Refazer os cantos');
    expect(FRASE_DOS_CANTOS_COM_RESULTADO_DEPOIS).toMatch(/próxima tela/);
  });
});

describe('o alvo de fixação ABC (Thaler et al., 2013)', () => {
  it('três camadas, na ordem: disco, cruz, centro', () => {
    const ordem = ['alvo-abc__disco', 'alvo-abc__cruz', 'alvo-abc__centro'].map((c) => MARCACAO_DO_ALVO_ABC.indexOf(c));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('as proporções do artigo: centro e cruz com 1/3 do disco (0,2° de 0,6°)', () => {
    expect(PROPORCAO_DO_CENTRO).toBeCloseTo(0.2 / 0.6, 10);
    expect(DIAMETRO_DO_ALVO_PX * PROPORCAO_DO_CENTRO).toBe(12);
  });

  it('a contração cabe inteira na acomodação descartada, na calibração e no teste', () => {
    expect(CONTRACAO_MS).toBeLessThan(ACCLIMATION_MS);
    expect(CONTRACAO_MS).toBeLessThan(ACOMODACAO_DESDE_A_CHEGADA_MS);
  });
});
