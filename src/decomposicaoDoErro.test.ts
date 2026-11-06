import { describe, expect, it } from 'vitest';
import { decomporErro } from './decomposicaoDoErro';

// Decomposição do erro do teste de precisão em três camadas que respondem a
// perguntas diferentes (pesquisa e auditoria de 05/11/2026):
//   - erro do MAPA: o que o teste mede hoje (malha aberta, sem correção);
//   - sem o DESLOCAMENTO da sessão: o teto de um recentramento perfeito;
//   - EM USO: o que a correção por dwell (o Kalman de produção) deixa depois
//     de aprender um rótulo por alvo, na ordem do teste.
// Os valores esperados foram calculados à mão (ver os comentários).

const tela = { larguraPx: 1920, alturaPx: 1080 };

describe('decomporErro', () => {
  it('deslocamento puro: o erro inteiro some sem o deslocamento', () => {
    // Quatro pontos com o mesmo erro (30; −40) px: |e| = 50 em todos.
    const pontos = [
      { alvoX: 480, alvoY: 270 }, { alvoX: 1440, alvoY: 270 },
      { alvoX: 480, alvoY: 810 }, { alvoX: 1440, alvoY: 810 },
    ].map((p) => ({ ...p, predX: p.alvoX + 30, predY: p.alvoY - 40 }));
    const d = decomporErro(pontos, { ...tela, ladoDoRotuloPx: 215, residuoAfimPx: 0, afim: false })!;
    expect(d.erroPx).toBeCloseTo(50, 6);
    expect(d.deslocamentoPx.x).toBeCloseTo(30, 6);
    expect(d.deslocamentoPx.y).toBeCloseTo(-40, 6);
    expect(d.semDeslocamentoPx).toBeCloseTo(0, 6);
    expect(d.parcelas.deslocamento).toBeCloseTo(1, 6);
    expect(d.parcelas.resto).toBeCloseTo(0, 6);
  });

  it('deslocamento mais erro de padrão: separa as duas partes', () => {
    // e₁ = (10; 20), e₂ = (10; −20): |e| = √500 = 22,36; sem o deslocamento
    // (10; 0) sobram (0; ±20), |·| = 20. Parcela do deslocamento =
    // (22,36 − 20)/22,36 = 0,1056. Afim informado de 20 px: nada linear além
    // do deslocamento, e o resto (20/22,36 = 0,894) é erro de padrão.
    const pontos = [
      { alvoX: 600, alvoY: 400, predX: 610, predY: 420 },
      { alvoX: 1300, alvoY: 700, predX: 1310, predY: 680 },
    ];
    const d = decomporErro(pontos, { ...tela, ladoDoRotuloPx: 215, residuoAfimPx: 20, afim: false })!;
    expect(d.erroPx).toBeCloseTo(22.3607, 3);
    expect(d.semDeslocamentoPx).toBeCloseTo(20, 6);
    expect(d.parcelas.deslocamento).toBeCloseTo(0.1056, 3);
    expect(d.parcelas.linear).toBeCloseTo(0, 6);
    expect(d.parcelas.resto).toBeCloseTo(0.8944, 3);
  });

  it('em uso: a correção por dwell aprende o deslocamento rótulo a rótulo', () => {
    // Deslocamento constante de 60 px em x, botão de 215 px, dispersão de 1 px
    // e N efetivo 100: R = (215/√12)² + (π/2)·1/100 = 3852,10 px².
    // Rótulo 1: k = 3600/(3600 + 3852,10) = 0,48309 → o = 28,985; P = 1860,9.
    // Rótulo 2: k = 1860,9/(1860,9 + 3852,10) = 0,32573 → o = 39,088.
    // Erros com a correção nos pontos 2 e 3: 60 − 28,985 = 31,015 e
    // 60 − 39,088 = 20,912 → média 25,964 px. (O ponto 1 ainda não tem
    // rótulo nenhum e fica fora da média.)
    const pontos = [700, 960, 1220].map((x) => ({
      alvoX: x, alvoY: 540, predX: x - 60, predY: 540, sdX: 1, sdY: 1, nEfetivo: 100,
    }));
    const d = decomporErro(pontos, { ...tela, ladoDoRotuloPx: 215, residuoAfimPx: null, afim: false })!;
    expect(d.emUsoPx).toBeCloseTo(25.964, 2);
    // Sem rótulo nenhum, os mesmos pontos 2 e 3 erram 60 px.
    expect(d.semCorrecaoNosMesmosPontosPx).toBeCloseTo(60, 6);
  });

  it('em uso: a correção não passa do teto de produção (8 % da tela)', () => {
    // Deslocamento de 200 px em y, numa tela de 1080 px: o teto é 0,08·1080 =
    // 86,4 px. Rótulo 1 (NIS 5,4, aceito): o = 0,48309·200 = 96,6 → teto 86,4.
    // Rótulo 2: o = 86,4 + 0,32573·113,6 = 123,4 → teto 86,4 de novo. Os dois
    // pontos seguintes erram 200 − 86,4 = 113,6 px. Sem o teto, 86,6.
    const pontos = [700, 960, 1220].map((x) => ({
      alvoX: x, alvoY: 540, predX: x, predY: 340, sdX: 1, sdY: 1, nEfetivo: 100,
    }));
    const d = decomporErro(pontos, { ...tela, ladoDoRotuloPx: 215, residuoAfimPx: null, afim: false })!;
    expect(d.emUsoPx).toBeCloseTo(113.6, 1);
  });

  it('dispersão ou N efetivo não medidos (NaN) valem o padrão, como se faltassem', () => {
    const base = [700, 960, 1220].map((x) => ({ alvoX: x, alvoY: 540, predX: x - 60, predY: 540 }));
    const opcoes = { ...tela, ladoDoRotuloPx: 215, residuoAfimPx: null, afim: false };
    const semMedida = decomporErro(base, opcoes)!;
    const comNaN = decomporErro(base.map((p) => ({ ...p, sdX: Number.NaN, sdY: Number.NaN, nEfetivo: Number.NaN })), opcoes)!;
    expect(semMedida.emUsoPx).not.toBeNull();
    expect(comNaN.emUsoPx).toBeCloseTo(semMedida.emUsoPx!, 9);
  });

  it('sem pontos válidos, não decompõe', () => {
    expect(decomporErro([], { ...tela, ladoDoRotuloPx: 215, residuoAfimPx: null, afim: false })).toBeNull();
    expect(decomporErro(
      [{ alvoX: 100, alvoY: 100, predX: Number.NaN, predY: 100 }],
      { ...tela, ladoDoRotuloPx: 215, residuoAfimPx: null, afim: false },
    )).toBeNull();
  });

  it('sem o lado do botão (alvo mínimo não medido), decompõe o erro mas não estima o uso', () => {
    const pontos = [700, 960, 1220].map((x) => ({ alvoX: x, alvoY: 540, predX: x - 60, predY: 540 }));
    const d = decomporErro(pontos, { ...tela, ladoDoRotuloPx: null, residuoAfimPx: null, afim: false })!;
    expect(d.erroPx).toBeCloseTo(60, 6);
    expect(d.emUsoPx).toBeNull();
    expect(d.semCorrecaoNosMesmosPontosPx).toBeNull();
  });

  it('um ponto só: decompõe o erro, mas não estima o uso', () => {
    const d = decomporErro(
      [{ alvoX: 960, alvoY: 540, predX: 990, predY: 500 }],
      { ...tela, ladoDoRotuloPx: 215, residuoAfimPx: null, afim: false },
    )!;
    expect(d.erroPx).toBeCloseTo(50, 6);
    expect(d.emUsoPx).toBeNull();
  });
});
