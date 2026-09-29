import { describe, it, expect } from 'vitest';
import { avisoDeTaxaInsuficiente, MIN_SAMPLES_PER_POINT } from './accuracy';
import { ACCLIMATION_MS, COLLECTION_MS } from './accuracyProtocol';

// Num computador sem placa de vídeo o detector de rosto roda no WebGL por
// software a 3–4 quadros por segundo (medido no percurso da Fase 8). Com a
// janela útil de 1,4 s por alvo, nenhum ponto chega às 8 leituras e o teste
// inteiro sai "Não medido" — com "amostras válidas 100%" ao lado, porque os
// poucos quadros vieram todos. O painel precisa dizer o porquê.

describe('aviso de taxa insuficiente no painel do teste', () => {
  it('a 3,7 Hz, com os 13 pontos sem medida, diz quantos, a taxa e o mínimo', () => {
    const aviso = avisoDeTaxaInsuficiente({ pontosMedidos: 0, pontosNaoMedidos: 13, sampleRateHz: 3.7 });
    expect(aviso).toContain('13 de 13 pontos');
    expect(aviso).toContain('3,7 quadros por segundo');
    expect(aviso).toContain(`${MIN_SAMPLES_PER_POINT} leituras`);
  });

  it('com todos os pontos medidos não há o que explicar', () => {
    expect(avisoDeTaxaInsuficiente({ pontosMedidos: 13, pontosNaoMedidos: 0, sampleRateHz: 3.7 })).toBeNull();
  });

  it('se a taxa daria para medir, a causa foi outra e o aviso não aparece', () => {
    // Um ponto perdido a 30 Hz é rosto fora do quadro ou olho fechado — o
    // painel tem os próprios avisos para isso.
    expect(avisoDeTaxaInsuficiente({ pontosMedidos: 12, pontosNaoMedidos: 1, sampleRateHz: 30 })).toBeNull();
    expect(avisoDeTaxaInsuficiente({ pontosMedidos: 0, pontosNaoMedidos: 13, sampleRateHz: null })).toBeNull();
  });

  it('o limite é o do protocolo: a taxa em que a janela útil rende o mínimo de leituras', () => {
    // 8 leituras em 1,4 s: ~5,71 quadros por segundo.
    const limiteHz = (MIN_SAMPLES_PER_POINT * 1000) / (COLLECTION_MS - ACCLIMATION_MS);
    expect(limiteHz).toBeCloseTo(5.714, 2);
    const aviso = (hz: number) => avisoDeTaxaInsuficiente({ pontosMedidos: 7, pontosNaoMedidos: 6, sampleRateHz: hz });
    expect(aviso(limiteHz - 0.01)).not.toBeNull();
    expect(aviso(limiteHz + 0.01)).toBeNull();
  });

  it('entre 5,36 e 5,7 quadros por segundo também explica (a conta não arredonda)', () => {
    // A 5,5 Hz a janela rende 7,7 leituras: parte dos pontos fica com 7 e sai
    // sem medida. Arredondando para 8, o aviso não aparecia justamente aqui.
    expect(avisoDeTaxaInsuficiente({ pontosMedidos: 7, pontosNaoMedidos: 6, sampleRateHz: 5.5 })).toContain(
      '6 de 13 pontos',
    );
  });
});
