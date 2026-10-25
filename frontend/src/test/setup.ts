import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/**
 * Prazo do `waitFor`/`findBy*` — TETO SEPARADO do `testTimeout`.
 *
 * O default da testing-library é 1 s, e ele é independente do teto do vitest:
 * um `waitFor` desiste em 1 s e o caso falha pela ASSERÇÃO ("elemento não
 * encontrado"), sem nunca chegar perto dos 20 s do `vitest.config.ts`. Subir
 * só o teto do vitest não conserta um `waitFor` curto.
 *
 * Sob a contenção medida em 25/10/2026 (ver o comentário do `testTimeout` em
 * `../../vitest.config.ts`: a suíte gasta ~1740 s de trabalho em ~185 s de
 * relógio), 1 s é pouco para qualquer espera que envolva `import()` de módulo
 * ou revalidação de licença. Foi o que derrubou o `npm run publicar` antes dos
 * quatro timeouts: `AvisoDeBloqueio` e `VozScreen` ganharam
 * `{ timeout: … }` caso a caso. Este é o lugar único do ajuste.
 *
 * 5 s dá 5× sobre o default e cobre o caso comum; os prazos locais mais
 * generosos (o `FOLGA` de 15 s em `VozScreen`, para o `import()` dos módulos
 * pesados) continuam valendo, porque o prazo da chamada sobrescreve este.
 * Como o `waitFor` faz polling, um prazo folgado só custa tempo quando o teste
 * ia falhar de todo jeito.
 */
configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  localStorage.clear();
  // `sessionStorage` também: o tutorial guarda nele o passo corrente e a
  // missão em curso (ver `pages/tutorial/missao.ts`). Sem limpar, um teste que
  // termina no passo 5 faz o seguinte começar lá — e a falha aparece no teste
  // errado.
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});
