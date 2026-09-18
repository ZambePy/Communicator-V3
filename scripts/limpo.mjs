/**
 * Roda um comando de desenvolvimento com o armazenamento local zerado.
 *
 *   node scripts/limpo.mjs dev            → npm run dev, começando do zero
 *   node scripts/limpo.mjs electron:dev   → idem, no Electron
 *
 * Por que um script e não `IRISFLOW_DEV_FRESH=1 npm run dev` no package.json:
 * essa sintaxe é do shell POSIX e NÃO funciona no cmd nem no PowerShell do
 * Windows, que é onde este projeto é desenvolvido. A alternativa usual é
 * acrescentar `cross-env` às dependências; um arquivo de 20 linhas resolve o
 * mesmo problema sem mais um pacote na árvore.
 *
 * O que a variável faz está documentado em `frontend/vite.config.ts`
 * (`devFreshStartPlugin`): um script injetado antes do app limpa
 * `localStorage`/`sessionStorage`, preservando o id do dispositivo e a
 * geometria física da tela.
 */

import { spawn } from 'node:child_process';

const alvo = process.argv[2];
if (!alvo) {
  console.error('uso: node scripts/limpo.mjs <script-do-npm>   (ex.: dev, electron:dev)');
  process.exit(1);
}

console.log(`[limpo] IRISFLOW_DEV_FRESH=1 → "npm run ${alvo}" comecara como instalacao nova.`);

const filho = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', alvo, ...process.argv.slice(3)],
  { stdio: 'inherit', env: { ...process.env, IRISFLOW_DEV_FRESH: '1' }, shell: process.platform === 'win32' },
);

filho.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
