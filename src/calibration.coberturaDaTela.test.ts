import { describe, it, expect } from 'vitest';
import { regiaoCalibrada, computeCalibrationTargets, type CalibrationGeometry } from './calibration';

/**
 * QUE PEDAÇO DA TELA A CALIBRAÇÃO REALMENTE COBRE.
 *
 * A grade não vai até a borda de propósito: o orçamento de excentricidade
 * (`MAX_ECCENTRICITY_DEG`) troca ~14 % de extrapolação nas bordas por 22 % de
 * erro de ganho na tela inteira, e o orçamento PARA BAIXO é ainda menor porque
 * a pálpebra cobre a íris quando o olhar desce.
 *
 * A consequência é que existe uma faixa da tela prevista por EXTRAPOLAÇÃO — e
 * o comentário que avisava disso trazia o número errado (dizia `y ≈ 0,88`; o
 * valor real é 0,8375, em qualquer tela). Um número errado num comentário é
 * pior que nenhum: alguém decide o layout confiando nele.
 *
 * Este arquivo fixa os números medidos e protege as duas propriedades que
 * importam de verdade:
 *   1. o TOPO é sempre coberto — é lá que fica o botão de emergência;
 *   2. a faixa extrapolada de baixo não cresce sem alguém decidir que cresça.
 */

const TELAS: { nome: string; g: CalibrationGeometry }[] = [
  {
    nome: 'monitor de mesa — 1920×1080, 23,6", 60 cm (a bancada de referência)',
    g: { screenWidthPx: 1920, screenHeightPx: 1080, screenDiagonalIn: 23.6, viewingDistanceCm: 60 },
  },
  {
    nome: 'notebook — 1920×1080, 15,6", 50 cm',
    g: { screenWidthPx: 1920, screenHeightPx: 1080, screenDiagonalIn: 15.6, viewingDistanceCm: 50 },
  },
  {
    nome: 'notebook pequeno — 1366×768, 14", 55 cm',
    g: { screenWidthPx: 1366, screenHeightPx: 768, screenDiagonalIn: 14, viewingDistanceCm: 55 },
  },
  {
    nome: 'monitor grande — 2560×1440, 27", 70 cm',
    g: { screenWidthPx: 2560, screenHeightPx: 1440, screenDiagonalIn: 27, viewingDistanceCm: 70 },
  },
];

/**
 * Onde o cabeçalho canônico (`GazePageLayout`) põe o CENTRO dos seus alvos —
 * Voltar à esquerda e EMERGÊNCIA à direita.
 *
 * `top: clamp(1rem, 2.5vh, 2rem)` mais metade da altura do botão (96 px),
 * na tela mais alta da lista. É o alvo mais alto do app, e o mais crítico.
 */
const Y_DO_CABECALHO = (2 * 16 + 96 / 2) / 1080; // ≈ 0,074

describe('cobertura da grade de calibração', () => {
  it('o topo da grade cobre o cabeçalho — onde fica a EMERGÊNCIA', () => {
    // Se a linha de cima da calibração descesse abaixo do botão de emergência,
    // o alvo mais importante do app seria previsto por extrapolação. É a única
    // propriedade desta cobertura que não admite discussão.
    for (const { nome, g } of TELAS) {
      const r = regiaoCalibrada(g);
      expect(r.y0, nome).toBeLessThanOrEqual(Y_DO_CABECALHO);
    }
  });

  it('a linha de baixo fica em 0,8375 em QUALQUER geometria plausível', () => {
    // Não é coincidência: nas geometrias plausíveis o extent vertical satura em
    // MAX_EXTENT_FRACTION (0,45), e aí `eyBaixo` é sempre o termo proporcional
    // 0,45 × 12/16 = 0,3375. O número é constante, e o comentário que dizia
    // "≈ 0,88" estava errado.
    for (const { nome, g } of TELAS) {
      expect(regiaoCalibrada(g).y1, nome).toBeCloseTo(0.8375, 4);
    }
  });

  it('a faixa de baixo prevista por EXTRAPOLAÇÃO é ~16 % da altura', () => {
    // O número está aqui para ser visto e discutido, não para ser bom. Um
    // botão cujo CENTRO caia nesta faixa é previsto fora do que a calibração
    // ensinou — e é onde o erro de borda de fato aparece.
    for (const { nome, g } of TELAS) {
      const faixa = 1 - regiaoCalibrada(g).y1;
      expect(faixa, nome).toBeGreaterThan(0.15);
      expect(faixa, nome).toBeLessThan(0.17);
    }
  });

  it('a cobertura HORIZONTAL varia com a tela, e é simétrica', () => {
    // Em X o orçamento morde nas telas grandes e não morde nas pequenas: numa
    // 14" a 55 cm os 5 %/95 % já custam menos de 16°, então a grade vai até a
    // borda. Simetria: qualquer assimetria em X seria bug, porque não há nada
    // no olho que distinga esquerda de direita como a pálpebra distingue
    // cima de baixo.
    for (const { nome, g } of TELAS) {
      const r = regiaoCalibrada(g);
      expect(r.x0 + r.x1, nome).toBeCloseTo(1, 6);
      // 0,05 é o teto de `MAX_EXTENT_FRACTION` (0,5 − 0,45). O `- 1e-9` é
      // ponto flutuante, não folga de projeto.
      expect(r.x0, nome).toBeGreaterThanOrEqual(0.05 - 1e-9);
      expect(r.x0, nome).toBeLessThanOrEqual(0.5);
    }
  });

  it('a assimetria vertical existe e é para CIMA — a pálpebra, não o ângulo', () => {
    // A linha de cima chega mais longe do centro que a de baixo. Se algum dia
    // isso inverter, o orçamento assimétrico deixou de valer e a decisão da
    // S4 precisa ser refeita, não silenciosamente desfeita.
    for (const { nome, g } of TELAS) {
      const r = regiaoCalibrada(g);
      expect(0.5 - r.y0, nome).toBeGreaterThan(r.y1 - 0.5);
    }
  });

  it('a região é exatamente a caixa dos alvos — sem folga inventada', () => {
    for (const { nome, g } of TELAS) {
      const alvos = computeCalibrationTargets(g);
      const r = regiaoCalibrada(g);
      for (const a of alvos) {
        expect(a.x, nome).toBeGreaterThanOrEqual(r.x0 - 1e-9);
        expect(a.x, nome).toBeLessThanOrEqual(r.x1 + 1e-9);
        expect(a.y, nome).toBeGreaterThanOrEqual(r.y0 - 1e-9);
        expect(a.y, nome).toBeLessThanOrEqual(r.y1 + 1e-9);
      }
    }
  });
});
