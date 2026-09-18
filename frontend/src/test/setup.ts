import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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
