import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPERIMENT, VALORES_DA_BASE } from './config/experiment';
import { rodarCenario, type ResultadoDoGolden } from './testUtils/cenarioDoGolden';

// `?pipeline=base` tem de ser o pipeline anterior, bit a bit: é contra ele que
// o V3 é medido. `golden-pipeline-base.json` saiu de e731357 (a beta de 27/09,
// de onde o V2 partiu), rodando o MESMO `cenarioDoGolden.ts` numa cópia dele:
//
//   git archive e731357 | tar -x -C /tmp/base && ln -s "$PWD/node_modules" /tmp/base/
//   cp src/testUtils/cenarioDoGolden.ts /tmp/base/src/testUtils/
//   (um teste de uma linha lá chama rodarCenario() e grava o JSON)
//
// Não regenere o JSON a partir do código de hoje: ele deixaria de provar a
// única coisa que prova. O cenário cobre o extractor (rostos sintéticos com
// pose e ângulos do L2CS) e a calibração inteira até o `mapGaze`, com pose e
// distância mudando; não cobre o engine, que precisa de MediaPipe.

const AQUI = dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(readFileSync(resolve(AQUI, 'testUtils/golden-pipeline-base.json'), 'utf8')) as ResultadoDoGolden;

describe('pipeline base dentro do V2', () => {
  const antes: Record<string, unknown> = {};
  beforeEach(() => {
    for (const [k, v] of Object.entries(VALORES_DA_BASE)) {
      antes[k] = EXPERIMENT[k as keyof typeof EXPERIMENT];
      (EXPERIMENT as unknown as Record<string, unknown>)[k] = v;
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(antes)) (EXPERIMENT as unknown as Record<string, unknown>)[k] = v;
  });

  it('com as flags do V3 desligadas, o extractor, a calibração e o mapGaze dão os números de e731357', () => {
    const r = rodarCenario();
    expect(r.extractor).toEqual(GOLDEN.extractor);
    expect(r.alvos).toEqual(GOLDEN.alvos);
    expect(r.ajuste).toEqual(GOLDEN.ajuste);
    expect(r.predicoes).toEqual(GOLDEN.predicoes);
  });

  it('o cenário mede alguma coisa: com o V3 ligado, a calibração muda', () => {
    for (const k of Object.keys(VALORES_DA_BASE)) {
      (EXPERIMENT as unknown as Record<string, unknown>)[k] = antes[k];
    }
    const r = rodarCenario();
    expect(r.predicoes).not.toEqual(GOLDEN.predicoes);
  });
});
