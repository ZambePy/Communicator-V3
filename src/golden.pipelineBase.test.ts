import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, EXPERIMENT, VALORES_DA_BASE, resolverPipeline } from './config/experiment';
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
  // Parte SEMPRE dos padrões do código, não do EXPERIMENT do import: ele traz
  // as variáveis `IRISFLOW_EXP_*` do terminal (a do replay, `PIPELINE=base`,
  // tornava o "antes" igual ao base e o segundo caso falhava sem mudança
  // nenhuma no código).
  const padrao = resolverPipeline({ ...DEFAULTS }) as unknown as Record<string, unknown>;
  const experimento = EXPERIMENT as unknown as Record<string, unknown>;
  const antes: Record<string, unknown> = {};
  // Estas quatro decidem o conjunto de features NO IMPORT do extractor
  // (`ACTIVE_FEATURE_SET`): o beforeEach não as desfaz. Com uma delas no
  // terminal o golden não prova nada, então falha dizendo por quê.
  beforeAll(() => {
    const fixasNoImport = ['DIMSDAIRIS', 'EYENET', 'BLOCOL2CSCOMPLETO', 'L2CS'];
    const noAmbiente = Object.keys(process.env).filter((k) => fixasNoImport.includes(k.toUpperCase().replace(/^IRISFLOW_EXP_/, '')) && /^IRISFLOW_EXP_/i.test(k));
    if (noAmbiente.length > 0) {
      throw new Error(`rode o golden sem ${noAmbiente.join(', ')} no ambiente: elas mudam o conjunto de features no import do extractor`);
    }
  });
  beforeEach(() => {
    for (const k of Object.keys(experimento)) {
      antes[k] = experimento[k];
      experimento[k] = padrao[k];
    }
    for (const [k, v] of Object.entries(VALORES_DA_BASE)) experimento[k] = v;
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(antes)) experimento[k] = v;
  });

  it('com as flags do V3 desligadas, o extractor, a calibração e o mapGaze dão os números de e731357', () => {
    const r = rodarCenario();
    expect(r.extractor).toEqual(GOLDEN.extractor);
    expect(r.alvos).toEqual(GOLDEN.alvos);
    expect(r.ajuste).toEqual(GOLDEN.ajuste);
    expect(r.predicoes).toEqual(GOLDEN.predicoes);
  });

  it('o cenário mede alguma coisa: com o V3 ligado, a calibração muda', () => {
    for (const k of Object.keys(VALORES_DA_BASE)) experimento[k] = padrao[k];
    const r = rodarCenario();
    expect(r.predicoes).not.toEqual(GOLDEN.predicoes);
  });
});
