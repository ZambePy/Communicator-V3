/* Preparação comum a todos os testes (ver vitest.config.ts). */

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Sem `globals: true` a Testing Library não se limpa sozinha entre testes.
afterEach(() => cleanup())

// O jsdom não implementa matchMedia, e vários efeitos do site consultam
// prefers-reduced-motion ao montar. Aqui ele responde "sem preferência".
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
