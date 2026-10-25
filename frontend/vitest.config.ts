import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tracker': path.resolve(__dirname, '../src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    /**
     * Teto de tempo por caso. O mesmo número do núcleo (`../vitest.config.ts`),
     * de propósito: um só valor para lembrar nos dois lados do repositório.
     *
     * ── Por que isto existe, medido em 25/10/2026 ────────────────────────────
     *
     * Até aqui esta suíte rodava no DEFAULT do vitest, 5 s, e o
     * `npm run publicar` caía com "Test timed out in 5000ms" em quatro casos —
     * quatro casos DIFERENTES a cada execução. Não era bug nos testes: os
     * mesmos quatro passam sozinhos com folga enorme.
     *
     *   caso                                    isolado   na suíte cheia
     *   evolucaoNoApp (aviso de fadiga)           243 ms      4058 ms  (16,7×)
     *   KeyboardScreen.mesmoGrupo                 572 ms      3625 ms  ( 6,3×)
     *   CalibrationCheck.interrupcaoAntesDoTreino 463 ms      2693 ms  ( 5,8×)
     *   DialogoDeConfirmacao (1º caso)            516 ms           —
     *
     * A causa é contenção, não lentidão de um arquivo: são 317 arquivos em
     * workers paralelos, e a execução inteira gasta ~1740 s de trabalho em
     * ~185 s de relógio — só a criação do jsdom são 929 s, uns 2,9 s por
     * arquivo (o projeto mora numa pasta do OneDrive, e o driver dele entra em
     * cada leitura de arquivo; é o que explica o 16,7× justamente do caso que
     * varre o disco com `readFileSync`).
     *
     * Ou seja: o pior caso chegava a 4,06 s contra um teto de 5 s — 1,2× de
     * margem, com uns quinze casos na faixa de 1,7 a 4,1 s. Qualquer ruído da
     * máquina (a sincronização do OneDrive, o antivírus, a suíte do núcleo que
     * acabou de rodar) empurrava alguns por cima, e QUAIS deles era sorteio.
     * Daí a falha mudar de lugar a cada execução.
     *
     * Não há ponto quente para otimizar aqui — o custo é espalhado por dezenas
     * de testes que montam React de verdade, diferente do caso do núcleo, em
     * que um arquivo só gastava 79 s na validação cruzada de λ. O que faltava
     * era o piso: 20 s dão ~5× sobre o pior caso COM a suíte cheia (e ~35×
     * sobre ele isolado), e seguem baixos o bastante para um teste de fato
     * travado falhar rápido.
     *
     * ⚠️ Nove casos declaram teto PRÓPRIO (`}, 30_000)` em VozScreen,
     * DrawingGame, backup/formato e backup/montarBackup). O teto local
     * sobrescreve este; mexer só aqui não tem efeito lá.
     */
    testTimeout: 20_000,
    /**
     * Teto dos `beforeEach`/`afterEach`, igual ao do núcleo. O default do
     * vitest (10 s) não derrubou esta suíte ainda, mas os hooks daqui montam
     * provedores e limpam armazenamento sob a mesma contenção medida acima, e
     * nenhum deles espera timer real — 30 s é margem para máquina lenta sem
     * segurar um hook travado de fato por muito tempo.
     */
    hookTimeout: 30_000,
  },
});
