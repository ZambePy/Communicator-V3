import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildL2CSBlock,
  ultimoDiagnosticoDoBloco,
  L2CS_CONFIDENCE_MIN,
  reiniciarReusoDoBloco,
  setReusoMaxMs,
  REUSO_MAX_MS,
  REUSO_DESVANECIMENTO_MS,
  pesoDoReuso,
} from './block';

/**
 * As três causas de bloco zerado produzem sete zeros idênticos. Quem consome o
 * vetor (a calibração) só via "tudo zero" e reportava as três como "o sistema
 * perdeu o olhar" — que só descreve UMA delas. Culpar o olhar do paciente por
 * um limiar de confiança do modelo faz a pessoa tentar se mexer menos, sem
 * efeito nenhum, porque a causa não é movimento.
 */
describe('buildL2CSBlock — motivo do bloco zerado', () => {
  const DIST = 1;
  const zerado = (b: number[]) => b.every((v) => v === 0);

  it('leitura obsoleta é "stale"', () => {
    expect(zerado(buildL2CSBlock(0.1, 0.1, false, DIST, 0.9))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('stale');
  });

  it('ângulo fora da faixa é "implausivel", com o pitch em graus', () => {
    // 0,9 rad ≈ 51°, acima do limite de plausibilidade (~35°).
    expect(zerado(buildL2CSBlock(0.1, 0.9, true, DIST, 0.9))).toBe(true);
    const d = ultimoDiagnosticoDoBloco();
    expect(d.motivo).toBe('implausivel');
    expect(Math.abs(d.pitchDeg)).toBeGreaterThan(50);
  });

  it('softmax difusa é "confianca", e carrega o valor medido', () => {
    const conf = L2CS_CONFIDENCE_MIN - 0.01;
    expect(zerado(buildL2CSBlock(0.05, 0.05, true, DIST, conf))).toBe(true);
    const d = ultimoDiagnosticoDoBloco();
    expect(d.motivo).toBe('confianca');
    expect(d.confidence).toBeCloseTo(conf, 5);
  });

  it('bloco válido não marca motivo', () => {
    expect(zerado(buildL2CSBlock(0.05, 0.05, true, DIST, 0.9))).toBe(false);
    expect(ultimoDiagnosticoDoBloco().motivo).toBeNull();
  });
});

/**
 * Reuso do último ângulo válido (item "leitura velha"): stale e confiança
 * baixa isolada deixam de virar sete zeros — o degrau que fazia o Ridge saltar
 * e o One Euro travar — enquanto o último ângulo bom tiver menos de 600 ms.
 */
describe('buildL2CSBlock — reuso do último ângulo válido', () => {
  const DIST = 1;
  const zerado = (b: number[]) => b.every((v) => v === 0);

  beforeEach(() => reiniciarReusoDoBloco());

  it('stale dentro de 600 ms reutiliza o ângulo anterior e marca "stale-reuso"', () => {
    const bom = buildL2CSBlock(0.2, -0.1, true, DIST, 0.9, 1000);
    expect(ultimoDiagnosticoDoBloco().motivo).toBeNull();
    const reusado = buildL2CSBlock(0, 0, false, DIST, undefined, 1400);
    expect(reusado).toEqual(bom);
    const d = ultimoDiagnosticoDoBloco();
    expect(d.motivo).toBe('stale-reuso');
    expect(d.reusoDeMs).toBe(400);
    expect(d.yawDeg).toBeCloseTo(0.2 * 180 / Math.PI, 6);
  });

  it('passada a janela MAIS o desvanecimento, volta a zerar com "stale"', () => {
    buildL2CSBlock(0.2, -0.1, true, DIST, 0.9, 1000);
    // 600 ms de janela + 200 ms de rampa. Antes o zero vinha em 601 ms, de um
    // quadro para o outro; agora a rampa cobre esse degrau (ver o teste de
    // continuidade abaixo) e o destino é exatamente o mesmo.
    const t = 1000 + REUSO_MAX_MS + REUSO_DESVANECIMENTO_MS + 1;
    expect(zerado(buildL2CSBlock(0, 0, false, DIST, undefined, t))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('stale');
    expect(ultimoDiagnosticoDoBloco().reusoDeMs).toBeNull();
    expect(ultimoDiagnosticoDoBloco().pesoDoAngulo).toBe(0);
  });

  it('confiança baixa isolada (1–2 leituras) reutiliza; persistente, zera', () => {
    const bom = buildL2CSBlock(0.1, 0.05, true, DIST, 0.9, 0);
    const conf = L2CS_CONFIDENCE_MIN - 0.01;
    expect(buildL2CSBlock(0.3, 0.3, true, DIST, conf, 100)).toEqual(bom);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('stale-reuso');
    expect(buildL2CSBlock(0.3, 0.3, true, DIST, conf, 260)).toEqual(bom);
    // Confiança baixa persistente: passada a janela e o desvanecimento, zera.
    const t = REUSO_MAX_MS + REUSO_DESVANECIMENTO_MS + 100;
    expect(zerado(buildL2CSBlock(0.3, 0.3, true, DIST, conf, t))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('confianca');
  });

  it('ângulo implausível NUNCA é reutilizado — lixo não é atraso', () => {
    buildL2CSBlock(0.1, 0.05, true, DIST, 0.9, 0);
    expect(zerado(buildL2CSBlock(0.1, 0.9, true, DIST, 0.9, 100))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('implausivel');
  });

  it('sem `nowMs` (gravações, chamadores antigos) não há reuso', () => {
    buildL2CSBlock(0.1, 0.05, true, DIST, 0.9);
    expect(zerado(buildL2CSBlock(0, 0, false, DIST, 0.9))).toBe(true);
    expect(ultimoDiagnosticoDoBloco().motivo).toBe('stale');
  });

  it('a janela é configurável', () => {
    setReusoMaxMs(100);
    buildL2CSBlock(0.1, 0.05, true, DIST, 0.9, 0);
    // 100 ms de janela + 200 ms de rampa.
    expect(zerado(buildL2CSBlock(0, 0, false, DIST, undefined, 301))).toBe(true);
    // E dentro da janela o comportamento é o de sempre — peso cheio.
    buildL2CSBlock(0.1, 0.05, true, DIST, 0.9, 1000);
    expect(buildL2CSBlock(0, 0, false, DIST, undefined, 1050).some((v) => v !== 0)).toBe(true);
    expect(ultimoDiagnosticoDoBloco().pesoDoAngulo).toBe(1);
    setReusoMaxMs(REUSO_MAX_MS);
  });

  // --- Regressão: o fim do reuso não pode ser um degrau -------------------
  //
  // O mecanismo de reuso existe porque, nas palavras do próprio módulo, "zero
  // não é 'sem informação' depois do StandardScaler — é um degrau: o Ridge
  // saltava, o cursor pulava e o One Euro travava tentando seguir". A janela
  // de 600 ms empurrava esse degrau 600 ms para frente em vez de eliminá-lo.
  describe('desvanecimento contínuo do reuso', () => {
    it('o peso cai por rampa e o maior salto encolhe com a varredura', () => {
      const varrer = (passoMs: number): number => {
        let maior = 0;
        let anterior = pesoDoReuso(0);
        for (let t = 0; t <= REUSO_MAX_MS + REUSO_DESVANECIMENTO_MS + 100; t += passoMs) {
          const w = pesoDoReuso(t);
          maior = Math.max(maior, Math.abs(w - anterior));
          anterior = w;
        }
        return maior;
      };
      const grosso = varrer(20);
      const fino = varrer(2.5);
      // Num degrau o maior salto fica preso em 1,0 por menor que seja o passo.
      expect(fino).toBeLessThan(grosso * 0.3);
      expect(fino).toBeLessThan(0.05);
    });

    it('os dois extremos reproduzem o comportamento antigo', () => {
      expect(pesoDoReuso(0)).toBe(1);
      expect(pesoDoReuso(REUSO_MAX_MS)).toBe(1);
      expect(pesoDoReuso(REUSO_MAX_MS + REUSO_DESVANECIMENTO_MS)).toBe(0);
      expect(pesoDoReuso(10_000)).toBe(0);
      expect(pesoDoReuso(-1)).toBe(0);
    });

    it('o ângulo desvanece, e os SETE termos chegam a zero juntos', () => {
      // O desvanecimento é no ângulo, não no vetor: em qualquer instante o
      // bloco continua sendo o bloco de ALGUM olhar, com os quadráticos e o
      // cruzado coerentes com os lineares. E como todos os sete termos têm
      // fator tan(yaw) ou tan(pitch), ângulo zero dá exatamente os mesmos sete
      // zeros de antes.
      buildL2CSBlock(0.2, -0.1, true, DIST, 0.9, 0);
      const meio = buildL2CSBlock(0, 0, false, DIST, undefined,
        REUSO_MAX_MS + REUSO_DESVANECIMENTO_MS / 2);
      const w = pesoDoReuso(REUSO_MAX_MS + REUSO_DESVANECIMENTO_MS / 2);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThan(1);
      expect(meio[0]).toBeCloseTo(Math.tan(0.2 * w), 12);   // linear em yaw
      expect(meio[4]).toBeCloseTo(Math.tan(0.2 * w) ** 2, 12); // quadrático coerente
      expect(meio[6]).toBeCloseTo(Math.tan(0.2 * w) * Math.tan(-0.1 * w), 12); // cruzado
      expect(ultimoDiagnosticoDoBloco().pesoDoAngulo).toBeCloseTo(w, 12);
    });
  });
});
