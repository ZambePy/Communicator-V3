import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Peso de qualidade da amostra (S1) com o ramo ocular (relato de 19/10/2026,
// auditoria A4). Antes o peso olhava só o diagnóstico do bloco do ROSTO, e
// sempre: com `?ep=off&olho=onnx` esse bloco não existe no vetor, o extractor
// o monta com uma leitura inválida, e TODA amostra saía rebaixada (×0,35) — o
// resumo dizia 100 % abaixo de 0,5. E um bloco ocular zerado nunca tirava peso.
//
// O conjunto ativo é resolvido quando o módulo carrega (`ACTIVE_FEATURE_SET`),
// então cada caso grava as flags e importa os módulos de novo.

const CHAVE = 'irisflow.experiment';

async function carregar(flags: Record<string, unknown>) {
  vi.resetModules();
  localStorage.setItem(CHAVE, JSON.stringify(flags));
  const calib = await import('./calibration');
  const bloco = await import('./olho/bloco');
  const rosto = await import('./l2cs/block');
  const extractor = await import('./extractor');
  return { calib, bloco, rosto, extractor };
}

type Modulos = Awaited<ReturnType<typeof carregar>>;

function prng(seed: number): () => number {
  let a = seed;
  return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff - 0.5; };
}
const v = (x: number, y: number, d: number) => Math.sin(d * 1.7 + 0.3) * x + Math.cos(d * 2.3 + 1.1) * y;
const w = (x: number, y: number, d: number) => Math.cos(d * 1.3 + 0.7) * x + Math.sin(d * 1.9 + 0.2) * y;

const OLHO_BOM = { yaw: 0.1, pitch: -0.05, confianca: 0.8, valid: true, timestamp: 0 };

/**
 * Calibra 9 alvos. Antes de cada quadro, monta os blocos angulares como o
 * extractor faria — o do rosto (`rosto`) e o de cada olho (`olhoDireito`) —,
 * porque é o diagnóstico DESTE quadro que a calibração lê para o peso. As
 * features entregues têm sinal em todas as dimensões: o que se mede é o peso.
 */
function calibrar(
  m: Modulos,
  quadro: { rosto: 'valido' | 'sem_leitura'; olhoDireito: 'valido' | 'sem_leitura' },
): void {
  const dims = m.extractor.activeFeatureDims() as number;
  const alvos = [0.2, 0.5, 0.8].flatMap((y) => [0.2, 0.5, 0.8].map((x) => ({ x, y })));
  const rnd = prng(42);
  let relogio = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => (relogio += 80));
  try {
    m.calib.startCalibrationMode();
    for (const t of alvos) {
      m.calib.startCollectingPoint(t.x, t.y, () => {});
      for (let i = 0; i < 40; i++) {
        const agora = relogio;
        m.rosto.buildL2CSBlock(0.1, 0.05, quadro.rosto === 'valido', 1, 0.9, agora);
        m.bloco.buildBlocoOcular(OLHO_BOM, 'esquerdo', agora);
        m.bloco.buildBlocoOcular(quadro.olhoDireito === 'valido' ? OLHO_BOM : null, 'direito', agora);
        m.calib.feedRawData(
          Array.from({ length: dims }, (_, d) => v(t.x, t.y, d) + rnd() * 0.01),
          Array.from({ length: dims }, (_, d) => w(t.x, t.y, d) + rnd() * 0.01),
          null,
        );
      }
    }
    m.calib.completeCalibration();
  } finally {
    spy.mockRestore();
  }
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.resetModules();
});

describe('peso da amostra com o ramo ocular (`?olho=onnx&ep=off`)', () => {
  const flags = { eyeNet: 'onnx', l2cs: 'off', polynomialFeatures: false };

  it('o conjunto é o do ramo ocular, sem bloco do rosto', async () => {
    const m = await carregar(flags);
    expect(m.extractor.ACTIVE_FEATURE_SET).toBe('irisCore+olho');
    expect(m.extractor.l2csSlotsInSet()).toEqual([]);
  });

  it('bloco ocular bom: peso cheio — o bloco do rosto, que não está no vetor, não rebaixa mais', async () => {
    const m = await carregar(flags);
    m.bloco.reiniciarReusoDoBlocoOcular();
    // Como o extractor faz com o L2CS desligado: o bloco do rosto é montado
    // com leitura inválida. Antes isso rebaixava TODA amostra.
    calibrar(m, { rosto: 'sem_leitura', olhoDireito: 'valido' });
    expect(m.calib.isCalibrated()).toBe(true);
    const pesos = m.calib.getCalibrationFitDiagnostics()?.pesos;
    expect(pesos).not.toBeNull();
    expect(pesos!.fracaoAbaixoDeMeio).toBe(0);
    expect(pesos!.minimo).toBe(1);
  });

  it('um olho sem leitura (bloco ocular zerado): a amostra pesa menos', async () => {
    const m = await carregar(flags);
    m.bloco.reiniciarReusoDoBlocoOcular();
    calibrar(m, { rosto: 'sem_leitura', olhoDireito: 'sem_leitura' });
    expect(m.calib.isCalibrated()).toBe(true);
    const pesos = m.calib.getCalibrationFitDiagnostics()?.pesos;
    expect(pesos!.fracaoAbaixoDeMeio).toBe(1);
    expect(pesos!.minimo).toBeCloseTo(0.35, 12);
  });
});

describe('com `olho=off` nada muda (controle)', () => {
  it('o diagnóstico do bloco ocular é ignorado: o peso é o do bloco do rosto, como antes', async () => {
    const m = await carregar({ polynomialFeatures: false });
    // O conjunto padrão: com bloco do rosto, sem bloco ocular.
    expect(m.extractor.setUsaRamoOcular()).toBe(false);
    expect(m.extractor.l2csSlotsInSet().length).toBeGreaterThan(0);
    m.bloco.reiniciarReusoDoBlocoOcular();
    calibrar(m, { rosto: 'valido', olhoDireito: 'sem_leitura' });
    expect(m.calib.isCalibrated()).toBe(true);
    const pesos = m.calib.getCalibrationFitDiagnostics()?.pesos;
    expect(pesos!.fracaoAbaixoDeMeio).toBe(0);
  });

  it('e o bloco do rosto sem leitura continua rebaixando a amostra', async () => {
    const m = await carregar({ polynomialFeatures: false });
    calibrar(m, { rosto: 'sem_leitura', olhoDireito: 'valido' });
    expect(m.calib.isCalibrated()).toBe(true);
    expect(m.calib.getCalibrationFitDiagnostics()?.pesos?.fracaoAbaixoDeMeio).toBe(1);
  });
});
