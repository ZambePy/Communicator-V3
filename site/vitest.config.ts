import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

/* Reaproveita o vite.config.ts (alias "@/", plugin do React) para que os
   testes importem os módulos do mesmo jeito que o app. O ambiente é o
   jsdom porque os testes de página e de contexto renderizam React. */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      // Nenhuma variável de ambiente entra nos testes: o cliente do
      // Supabase é sempre mockado, e assim a suíte roda igual na CI.
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    },
  }),
)
