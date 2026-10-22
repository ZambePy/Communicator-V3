import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPERIMENT } from './config/experiment';
import { rodarCenario, type ResultadoDoGolden } from './testUtils/cenarioDoGolden';

// Revisão do pipeline de 19/10/2026: as correções do reinício do modelo do
// rosto (lado do recorte mantido, suspensão em vez de apagar), da contagem de
// amostras da recoleta, do instante de treino da recoleta aceita e dos
// contadores do relatório NÃO podem mudar a saída no caminho normal — sem
// reinício e sem recoleta. `golden-calibracao-f5a6ca8.json` saiu de f5a6ca8 (a
// base desta revisão) rodando o MESMO `cenarioDoGolden.ts` com as flags
// PADRÃO (V3 ligado), numa cópia daquele commit:
//
//   git archive f5a6ca8 | tar -x -C /tmp/base && ln -s "$PWD/node_modules" /tmp/base/
//   (um teste de uma linha lá chama rodarCenario() e grava o JSON)
//
// O cenário cobre o extractor, a calibração inteira (M6, Huber, correção dos
// cantos, ruído do M9) e o `mapGaze` em três posturas. Não regenere o JSON a
// partir do código de hoje: ele deixaria de provar a única coisa que prova.

const AQUI = dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(
  readFileSync(resolve(AQUI, 'testUtils/golden-calibracao-f5a6ca8.json'), 'utf8'),
) as ResultadoDoGolden & { flags: Record<string, unknown> };

describe('caminho normal da calibração, com as flags padrão', () => {
  it('as flags em vigor são as do golden (senão a comparação não diria nada)', () => {
    for (const [k, v] of Object.entries(GOLDEN.flags)) expect(EXPERIMENT[k as keyof typeof EXPERIMENT]).toBe(v);
  });

  it('o extractor, o ajuste e o mapGaze dão os números de f5a6ca8, bit a bit', () => {
    const r = rodarCenario();
    expect(r.extractor).toEqual(GOLDEN.extractor);
    expect(r.alvos).toEqual(GOLDEN.alvos);
    expect(r.ajuste).toEqual(GOLDEN.ajuste);
    expect(r.predicoes).toEqual(GOLDEN.predicoes);
  });
});
