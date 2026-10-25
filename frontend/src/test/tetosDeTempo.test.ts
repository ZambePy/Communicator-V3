/**
 * Os dois tetos de tempo da suíte de interface (25/10/2026). Teste de
 * CONVENÇÃO, no estilo de `rotasOrfas.test.ts`: lê o texto dos arquivos de
 * configuração, porque o que se quer garantir é a DECLARAÇÃO, não o efeito.
 *
 * Por que existe: esta suíte rodou muito tempo nos defaults (5 s no vitest,
 * 1 s no `waitFor`) e o `npm run publicar` caía com "Test timed out in 5000ms"
 * em quatro casos diferentes a cada execução — contenção dos 317 arquivos em
 * paralelo, não bug nos testes (os números medidos estão no comentário do
 * `testTimeout`, em `vitest.config.ts`). O conserto de verdade foi declarar os
 * tetos uma vez; antes dele, foram sendo remendados caso a caso, e cada
 * execução sorteava outras vítimas.
 *
 * Este teste é o que impede a volta silenciosa ao default: apagar as linhas
 * dos tetos não quebra nada visível — a suíte só volta a falhar por sorteio,
 * semanas depois, com a falha apontando para o teste errado.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from '@testing-library/dom';

/** `frontend/`, dois níveis acima de `src/test/`. */
const FRONTEND = join(__dirname, '..', '..');

describe('os tetos de tempo da suíte de interface são declarados', () => {
  it('vitest.config.ts fixa testTimeout e hookTimeout (nunca os defaults de 5 s e 10 s)', () => {
    const cfg = readFileSync(join(FRONTEND, 'vitest.config.ts'), 'utf8');

    const testTimeout = cfg.match(/^\s*testTimeout:\s*([\d_]+)/m);
    expect(testTimeout, 'vitest.config.ts precisa declarar `testTimeout`').not.toBeNull();
    // O pior caso medido com a suíte cheia foi 4,06 s; 15 s é o mínimo que
    // mantém uma margem sã sobre ele.
    expect(Number(testTimeout![1].replace(/_/g, ''))).toBeGreaterThanOrEqual(15_000);

    const hookTimeout = cfg.match(/^\s*hookTimeout:\s*([\d_]+)/m);
    expect(hookTimeout, 'vitest.config.ts precisa declarar `hookTimeout`').not.toBeNull();
    expect(Number(hookTimeout![1].replace(/_/g, ''))).toBeGreaterThanOrEqual(20_000);
  });

  it('o setup sobe o prazo do waitFor — é um teto SEPARADO, que o testTimeout não cobre', () => {
    // Medido de dentro: é o valor que as esperas desta suíte realmente usam.
    // O default da testing-library é 1 s, e um `waitFor` que desiste nele
    // falha pela asserção, sem nunca encostar no teto do vitest.
    expect(getConfig().asyncUtilTimeout).toBeGreaterThanOrEqual(5_000);
  });
});
