import { describe, it, expect, afterEach } from 'vitest';
import {
  ACOMODACAO_DESDE_A_CHEGADA_MS,
  CALIBRATION_ACCLIMATION_MS,
  DESLOCAMENTO_DA_BOLA_MS,
  PAUSA_ENTRE_ALVOS_BASE_MS,
  aberturaDaColetaMs,
  acomodacaoDoPontoMs,
  duracaoTotalDoPonto,
  janelaUtilDoPonto,
  medianaDeDistancias,
} from './calibration';
import { alvosDeCalibracao, currentCalibrationGeometry, getCollectionMsForPoint } from './calibration';
import { EXPERIMENT } from './config/experiment';

/**
 * Liga ou desliga M7 e M8 juntas: as duas mudanças do V3 no tempo da
 * calibração. M8 vem ligada por padrão; M7, desligada (fica para a medição).
 */
function comM7eM8(ligadas: boolean): void {
  EXPERIMENT.alvoInferiorCentral = ligadas;
  EXPERIMENT.assentamentoPelaChegada = ligadas;
}
const M7_ANTES = EXPERIMENT.alvoInferiorCentral;
const M8_ANTES = EXPERIMENT.assentamentoPelaChegada;
afterEach(() => {
  EXPERIMENT.alvoInferiorCentral = M7_ANTES;
  EXPERIMENT.assentamentoPelaChegada = M8_ANTES;
});

/** Pior caso de cada alvo da tela de referência: a janela vai até o teto. */
function janelasDoPiorCaso(): number[] {
  const alvos = alvosDeCalibracao(currentCalibrationGeometry({ screenWidthPx: 1920, screenHeightPx: 1080 }), { perfil: 'padrao' });
  return alvos.map((a) => getCollectionMsForPoint(a.x, a.y, 'padrao'));
}

// Tempo de cada ponto de calibração: a janela de acomodação (600 ms) é SOMADA
// ao tempo de coleta útil, não subtraída dele; e a distância de referência do
// ponto é a mediana de vários quadros aceitos, não um único quadro replicado.

describe('a acomodação é somada ao tempo do ponto', () => {
  it('a janela útil é exatamente o tempo de coleta pedido', () => {
    for (const coleta of [1680, 2000, 2800]) {
      expect(janelaUtilDoPonto(coleta)).toBe(coleta);
    }
  });

  it('a duração total é coleta + a acomodação em vigor', () => {
    for (const v3 of [false, true]) {
      comM7eM8(v3);
      for (const coleta of [1680, 2000, 2800]) {
        expect(duracaoTotalDoPonto(coleta)).toBe(coleta + acomodacaoDoPontoMs());
      }
    }
  });

  it('M8: sem a flag, 600 ms desde a abertura da coleta; com ela, 800 ms desde a chegada da bola', () => {
    comM7eM8(false);
    expect(acomodacaoDoPontoMs()).toBe(CALIBRATION_ACCLIMATION_MS);
    expect(aberturaDaColetaMs()).toBe(PAUSA_ENTRE_ALVOS_BASE_MS);
    comM7eM8(true);
    expect(acomodacaoDoPontoMs()).toBe(ACOMODACAO_DESDE_A_CHEGADA_MS);
    expect(aberturaDaColetaMs()).toBe(DESLOCAMENTO_DA_BOLA_MS);
    // O primeiro dado útil vem mais cedo depois de a bola parar: 800 ms contra
    // 1200 − 620 + 600 = 1180 ms.
    expect(ACOMODACAO_DESDE_A_CHEGADA_MS).toBeLessThan(PAUSA_ENTRE_ALVOS_BASE_MS - DESLOCAMENTO_DA_BOLA_MS + CALIBRATION_ACCLIMATION_MS);
  });

  it('a janela útil não é coleta − acomodação', () => {
    // 1680 − 600 = 1080 seria ~36 % menos amostras que o documentado.
    expect(janelaUtilDoPonto(1680)).not.toBe(1680 - CALIBRATION_ACCLIMATION_MS);
  });

  it('a acomodação é uma constante nomeada, não um literal solto', () => {
    expect(CALIBRATION_ACCLIMATION_MS).toBeGreaterThan(0);
    expect(CALIBRATION_ACCLIMATION_MS).toBeLessThan(1000);
  });

  it('o budget de sessão continua dentro do teto de fadiga', () => {
    // Acima de ~40 s a fadiga do usuário-alvo (ELA) piora as fixações finais
    // e anula o ganho. Somar a acomodação acrescenta 9 × 600 ms = 5,4 s; a
    // conta precisa continuar fechando.
    const pontos = [
      [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
      [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
      [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
    ] as const;
    const totalMs = pontos.reduce(
      (s, [x, y]) => s + duracaoTotalDoPonto(getCollectionMsForPoint(x, y)),
      0,
    );
    expect(totalMs / 1000).toBeLessThan(40);
  });

  it('a calibração de 13 pontos (grade + 4 cantos da tela) cabe no mesmo teto, no pior caso', () => {
    // Pior caso = todo ponto indo até o teto da janela, sem fechar cedo por
    // estabilidade. Na tela de referência dá ~39 s; na prática os pontos
    // fecham antes, quando o olhar para. É o pipeline base (sem M7 e M8).
    comM7eM8(false);
    const janelas = janelasDoPiorCaso();
    expect(janelas).toHaveLength(13);
    const totalMs = janelas.reduce((s, j) => s + duracaoTotalDoPonto(j), 0);
    expect(totalMs / 1000).toBeLessThan(40);
  });

  it('com M7 e M8, os 14 alvos não alongam a sessão: cada um abre a coleta ~380 ms antes', () => {
    // A sessão inteira, alvo a alvo: a espera até a coleta abrir, a acomodação
    // e a janela. Sem M8 a coleta abre 1200 ms depois do alvo anterior e
    // descarta 600 ms; com M8, abre na chegada da bola (620 ms) e descarta
    // 800 ms. No pior caso da tela de referência: ~54,8 s no base, ~53,7 s no V3.
    const sessao = () =>
      janelasDoPiorCaso().reduce((s, j) => s + aberturaDaColetaMs() + duracaoTotalDoPonto(j), 0);
    comM7eM8(false);
    const base = sessao();
    comM7eM8(true);
    expect(janelasDoPiorCaso()).toHaveLength(14);
    const v3 = sessao();
    expect(v3).toBeLessThanOrEqual(base);
  });
});

describe('a mediana de distância vem de vários quadros', () => {
  it('a mediana de uma lista é a mediana, não o último valor', () => {
    expect(medianaDeDistancias([50, 51, 52, 53, 54])).toBeCloseTo(52, 6);
  });

  it('um outlier no fim não domina o resultado', () => {
    // O último frame visto pode ser um rejeitado pelo gate, ou um 800 ms
    // posterior vindo do hard timeout; ele não decide sozinho.
    const comOutlier = medianaDeDistancias([50, 50, 51, 51, 200]);
    expect(comOutlier).toBeLessThan(60);
  });

  it('lista com número par de elementos interpola', () => {
    expect(medianaDeDistancias([50, 52])).toBeCloseTo(51, 6);
  });

  it('lista vazia devolve null — não há mediana de nada', () => {
    // Fabricar um número aqui contaminaria `calibrationRefDistance`, que
    // governa a compensação de distância.
    expect(medianaDeDistancias([])).toBeNull();
  });

  it('valores não-finitos são descartados', () => {
    expect(medianaDeDistancias([50, NaN, 52, Infinity, 51])).toBeCloseTo(51, 6);
  });

  it('só valores não-finitos devolve null', () => {
    expect(medianaDeDistancias([NaN, Infinity])).toBeNull();
  });

  it('um único quadro ainda devolve esse valor', () => {
    expect(medianaDeDistancias([57.3])).toBeCloseTo(57.3, 6);
  });
});
