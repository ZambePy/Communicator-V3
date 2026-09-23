// Replay de uma gravação real pelo núcleo de calibração (ver
// `testUtils/replayDeGravacao.ts`). Só roda com uma gravação apontada:
//
//   IRISFLOW_GRAVACAO=/caminho/irisflow-recording-….jsonl npx vitest run src/replayDeGravacao.test.ts
//
// A gravação sai de Configurações → Gravador de sessão (área do cuidador) e
// não vai para o repositório: é o rosto de alguém, em números.

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lerGravacao, reproduzirGravacao, type ResultadoDoReplay } from './testUtils/replayDeGravacao';

const CAMINHO = process.env.IRISFLOW_GRAVACAO;

function linha(nome: string, r: ResultadoDoReplay): string {
  const alvos = r.porAlvo.map((a) => `${a.rotulo}=${a.erroMedioPx.toFixed(0)}`).join(' ');
  const dif = r.diferencaParaGravadoPx === null ? '—' : r.diferencaParaGravadoPx.toFixed(1);
  return `${nome.padEnd(34)} interno ${r.internoPx.toFixed(1).padStart(6)}  cantos ${r.cantosPx.toFixed(1).padStart(6)}  ` +
    `|Δ gravado| ${dif.padStart(5)}  treino ${r.amostrasDeTreino}\n    ${alvos}`;
}

describe.skipIf(!CAMINHO)('replay da gravação pelo núcleo real', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reproduz o app gravado e mede as variantes', () => {
    const g = lerGravacao(readFileSync(CAMINHO as string, 'utf8'));
    const cenarios: [string, Parameters<typeof reproduzirGravacao>[1]][] = [
      ['9 pts, referência lenta (EMA)', { experimento: { referenciaLenta: true } }],
      ['9 pts, referência fixa', { experimento: { referenciaLenta: false } }],
      ['13 pts, EMA, sem correção', { cantosNaCalibracao: true, experimento: { referenciaLenta: true, correcaoLocal: false } }],
      ['13 pts, ref. fixa, sem correção', { cantosNaCalibracao: true, experimento: { referenciaLenta: false, correcaoLocal: false } }],
      ['13 pts, ref. fixa + correção (padrão)', { cantosNaCalibracao: true, experimento: { referenciaLenta: false, correcaoLocal: true } }],
    ];
    const saida: string[] = [];
    const resultados: ResultadoDoReplay[] = [];
    for (const [nome, opcoes] of cenarios) {
      const r = reproduzirGravacao(g, opcoes);
      resultados.push(r);
      saida.push(linha(nome, r));
    }
    process.stdout.write(`\n${saida.join('\n')}\n`);
    for (const r of resultados) {
      expect(Number.isFinite(r.internoPx)).toBe(true);
      expect(r.porAlvo.length).toBeGreaterThan(0);
    }
  }, 300_000);
});
