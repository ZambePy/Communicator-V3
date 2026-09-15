import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeAngleWithConfidence, modoDeDecodificacao } from './decode';
import { fichaDoModelo, resumoDaFicha, validarMeta } from './proveniencia';
import type { L2CSModelMeta } from './types';

const gaze360: L2CSModelMeta = {
  dataset: 'gaze360',
  file: 'l2cs_gaze360.onnx',
  outputBins: 90,
  binWidth: 4,
  binOffset: -180,
  inputSize: 448,
  inputTensorName: 'input',
  outputTensorNames: { yaw: 'yaw', pitch: 'pitch' },
};

const tela45: L2CSModelMeta = {
  ...gaze360,
  dataset: 'gazegene',
  file: 'l2cs_v2.onnx',
  outputBins: 30,
  binWidth: 3,
  binOffset: -45,
};

describe('modo de decodificação', () => {
  it('90 × 4° fecham a volta: circular, mesmo sem declarar', () => {
    expect(modoDeDecodificacao(gaze360)).toBe('circular');
  });

  it('30 × 3° não fecham: linear, mesmo sem declarar', () => {
    expect(modoDeDecodificacao(tela45)).toBe('linear');
  });

  it('a declaração explícita vence a inferência', () => {
    expect(modoDeDecodificacao({ ...tela45, decoding: 'linear' })).toBe('linear');
    expect(modoDeDecodificacao({ ...gaze360, decoding: 'circular' })).toBe('circular');
  });

  it('a meta empacotada declara o que a cobertura implica', () => {
    const meta = JSON.parse(
      readFileSync(resolve(__dirname, '../../frontend/public/models/l2cs/l2cs.meta.json'), 'utf8'),
    ) as L2CSModelMeta;
    expect(validarMeta(meta)).toBeNull();
    expect(meta.decoding).toBe(modoDeDecodificacao({ ...meta, decoding: undefined }));
    expect(meta.proveniencia?.usoComercial).toBe('proibido');
  });
});

describe('decodificação linear', () => {
  const pico = (i: number, n: number) => {
    const l = new Array<number>(n).fill(0);
    l[i] = 40;
    return l;
  };

  it('num pico único, linear e circular coincidem', () => {
    for (let i = 0; i < 30; i++) {
      const lin = decodeAngleWithConfidence(pico(i, 30), 3, -45, 'linear').deg;
      const circ = decodeAngleWithConfidence(pico(i, 30), 3, -45, 'circular').deg;
      expect(lin).toBeCloseTo(i * 3 - 45, 6);
      expect(circ).toBeCloseTo(i * 3 - 45, 6);
    }
  });

  it('numa grade que não fecha a volta, linear dá a esperança do treino e circular inventa', () => {
    // 80 bins × 3° desde −120° cobrem −120°…+117°. Massa igual nas duas
    // pontas: a esperança LINEAR é −1,5°, que é o que a perda MSE do treino
    // viu. A média circular soma os vetores unitários, e dois vetores a 237°
    // um do outro somam na direção do arco CURTO — perto de ±180°, um ângulo
    // que este modelo não representa. (Abaixo de 180° de cobertura as duas
    // contas quase coincidem; ainda assim a linear é a do treino, e é a que
    // fica quando a meta não fecha a volta.)
    const logits = new Array<number>(80).fill(0);
    logits[0] = 30;
    logits[79] = 30;
    const lin = decodeAngleWithConfidence(logits, 3, -120, 'linear').deg;
    const circ = decodeAngleWithConfidence(logits, 3, -120, 'circular').deg;
    expect(lin).toBeCloseTo(-1.5, 6);
    expect(Math.abs(circ)).toBeGreaterThan(170);
  });

  it('distribuição uniforme numa grade linear decodifica o centro da grade, não um ângulo aleatório', () => {
    const uniforme = new Array<number>(30).fill(0);
    const { deg, confidence } = decodeAngleWithConfidence(uniforme, 3, -45, 'linear');
    expect(deg).toBeCloseTo(-1.5, 6);
    expect(confidence).toBeCloseTo(0, 9);
  });

  it('o default continua circular — nenhum chamador antigo muda de comportamento', () => {
    const logits = new Array<number>(90).fill(0);
    logits[0] = 30;
    logits[89] = 30;
    expect(Math.abs(decodeAngleWithConfidence(logits, 4, -180).deg)).toBeGreaterThan(170);
  });
});

describe('validarMeta', () => {
  it('aceita as duas metas de referência', () => {
    expect(validarMeta(gaze360)).toBeNull();
    expect(validarMeta(tela45)).toBeNull();
  });

  it('recusa grade impossível e declaração incoerente', () => {
    expect(validarMeta({ ...gaze360, outputBins: 1 })).toMatch(/outputBins/);
    expect(validarMeta({ ...gaze360, binWidth: 0 })).toMatch(/binWidth/);
    expect(validarMeta({ ...gaze360, outputBins: 100 })).toMatch(/mais que uma volta/);
    expect(validarMeta({ ...tela45, decoding: 'circular' })).toMatch(/não fecha/);
    expect(validarMeta({ ...gaze360, sha256: 'abc' })).toMatch(/sha256/);
    expect(validarMeta(null)).toMatch(/ausente/);
  });

  it("'permitido' sem contrato exige bases sem cláusula não-comercial", () => {
    const comNc: L2CSModelMeta = {
      ...tela45,
      proveniencia: {
        treino: { bases: [{ nome: 'GazeGene', licenca: 'CC BY-NC-SA 4.0' }] },
        usoComercial: 'permitido',
        contrato: null,
      },
    };
    expect(validarMeta(comNc)).toMatch(/sem contrato/);

    const comContrato: L2CSModelMeta = {
      ...comNc,
      proveniencia: { ...comNc.proveniencia!, contrato: { com: 'Beihang University', data: '2026-11-01' } },
    };
    expect(validarMeta(comContrato)).toBeNull();

    const mit: L2CSModelMeta = {
      ...tela45,
      proveniencia: {
        treino: { bases: [{ nome: 'UnityEyes 2 (renders próprios)', licenca: 'MIT' }] },
        usoComercial: 'permitido',
      },
    };
    expect(validarMeta(mit)).toBeNull();
  });
});

describe('ficha do modelo', () => {
  it('integridade segue o que foi declarado e calculado', () => {
    const hash = 'a'.repeat(64);
    expect(fichaDoModelo(gaze360, null).integridade).toBe('nao-calculado');
    expect(fichaDoModelo(gaze360, { sha256Calculado: hash, hashConfere: null }).integridade).toBe('nao-declarado');
    expect(
      fichaDoModelo({ ...gaze360, sha256: hash }, { sha256Calculado: hash, hashConfere: true }).integridade,
    ).toBe('confere');
    expect(
      fichaDoModelo({ ...gaze360, sha256: hash }, { sha256Calculado: 'b'.repeat(64), hashConfere: false }).integridade,
    ).toBe('nao-confere');
  });

  it('sem proveniência, o uso comercial é desconhecido — nunca "permitido" por omissão', () => {
    const f = fichaDoModelo(gaze360, null);
    expect(f.usoComercial).toBe('desconhecido');
    expect(f.bases).toEqual([]);
    expect(resumoDaFicha(f)).toContain('não declarado');
  });

  it('o resumo grita quando o uso comercial é proibido ou o hash não confere', () => {
    const f = fichaDoModelo(
      {
        ...gaze360,
        sha256: 'a'.repeat(64),
        proveniencia: {
          treino: { bases: [{ nome: 'Gaze360', licenca: 'research-only' }] },
          usoComercial: 'proibido',
        },
      },
      { sha256Calculado: 'b'.repeat(64), hashConfere: false },
    );
    const r = resumoDaFicha(f);
    expect(r).toContain('USO COMERCIAL PROIBIDO');
    expect(r).toContain('HASH NÃO CONFERE');
    expect(r).toContain('Gaze360 (research-only)');
  });
});
