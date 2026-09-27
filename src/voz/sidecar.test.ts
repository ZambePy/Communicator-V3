// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Sidecar, segurarSaidaAteOMotorSair } from '../../electron/voz/sidecar';

// -----------------------------------------------------------------------------
// O `Sidecar` com um motor FALSO de mesmo contrato do Python
// (`fixtures/motor-de-voz-falso.cjs`): um pedido por vez, na ordem, e o `sair`
// só é lido depois do comando em curso — é o que torna as corridas possíveis.
// -----------------------------------------------------------------------------

const MOTOR = path.resolve(__dirname, '..', '..', 'fixtures', 'motor-de-voz-falso.cjs');
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'irisflow-sidecar-'));
const vivos: Sidecar[] = [];

function novoSidecar(): { s: Sidecar; log: string } {
  const log = path.join(PASTA, `motor-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
  const s = new Sidecar({ comando: process.execPath, args: [MOTOR], origem: 'python' }, { MOTOR_LOG: log }, () => {}, () => {});
  vivos.push(s);
  return { s, log };
}

const falar = (s: Sidecar, ms: number, prazoMs: number) =>
  s.pedir({ cmd: 'falar', texto: `LENTO:${ms}`, referencia: 'x', saida: '', idioma: 'pt' }, prazoMs)
    .then(() => 'ok', (e: Error) => `rejeitado: ${e.message}`);

const linhasDoLog = (log: string) => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []);
const pidsQueIniciaram = (log: string) => linhasDoLog(log).filter((l) => l.endsWith(' iniciou')).map((l) => l.split(' ')[1]);
const vivo = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

afterEach(() => {
  for (const s of vivos.splice(0)) s.matarAgora();
});

describe('Sidecar — cada pedido pertence ao processo que o recebeu (CORE-7)', () => {
  it('o prazo vencido de A não derruba B, que roda no processo seguinte; nenhuma queda é contada', async () => {
    const { s, log } = novoSidecar();
    // A: síntese de 1,2 s com prazo de 300 ms → vence no motor → o processo é encerrado.
    const a = falar(s, 1200, 300);
    // B: enfileirado atrás, prazo folgado. Antes, a SAÍDA do processo de A
    // derrubava B ("O motor de voz encerrou") e contava uma queda.
    const b = falar(s, 200, 10_000);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toMatch(/não respondeu/);
    expect(rb).toBe('ok');
    expect((s as unknown as { quedas: number }).quedas).toBe(0);
    expect(s.emErro).toBe(false);
    // E o processo novo só subiu depois que o antigo saiu: nunca dois ao mesmo tempo.
    const linhas = linhasDoLog(log);
    const [pidA, pidB] = pidsQueIniciaram(log);
    expect(pidA).toBeDefined();
    expect(pidB).toBeDefined();
    expect(pidB).not.toBe(pidA);
    const saidaDeA = linhas.findIndex((l) => l.includes(pidA) && /saindo/.test(l));
    const inicioDeB = linhas.findIndex((l) => l.includes(pidB) && l.endsWith(' iniciou'));
    expect(saidaDeA).toBeGreaterThanOrEqual(0);
    expect(inicioDeB).toBeGreaterThan(saidaDeA);
  }, 20_000);

  it('pedido que chega enquanto o processo encerrado ainda sai espera por ele e é atendido', async () => {
    const { s, log } = novoSidecar();
    // Um comando mais longo que a cortesia no processo 1, que então é
    // encerrado (ociosidade, por exemplo): o kill chega antes da resposta.
    const longo = falar(s, 3000, 10_000);
    await new Promise((r) => setTimeout(r, 150));
    s.encerrar();
    const depois = falar(s, 50, 10_000);
    const [rLongo, rDepois] = await Promise.all([longo, depois]);
    // O pedido em curso no processo encerrado falha com mensagem própria…
    expect(rLongo).toMatch(/foi encerrado/);
    // …e o novo é atendido pelo processo seguinte, sem contar queda.
    expect(rDepois).toBe('ok');
    expect(s.emErro).toBe(false);
    expect(pidsQueIniciaram(log)).toHaveLength(2);
  }, 20_000);

  it('o prazo conta desde a entrada na fila: vencido na fila, falha sem derrubar o comando em curso', async () => {
    const { s } = novoSidecar();
    const lento = falar(s, 1500, 10_000);
    // Prazo de 400 ms, preso atrás de 1,5 s de síntese: antes o relógio só
    // começava quando ele saía da fila, e um pedido atrás de um download de
    // até 1 h esperava sem limite.
    const t0 = Date.now();
    const preso = falar(s, 10, 400);
    const rPreso = await preso;
    expect(rPreso).toMatch(/ocupado/);
    expect(Date.now() - t0).toBeLessThan(1200);
    // O comando em curso não foi afetado.
    expect(await lento).toBe('ok');
    expect(s.emErro).toBe(false);
  }, 20_000);

  it('encerrar de propósito, três vezes com pedido em curso, não deixa o motor em erro', async () => {
    const { s } = novoSidecar();
    for (let i = 0; i < 3; i++) {
      // Mais longo que a cortesia: o processo morre com o pedido em curso.
      const p = falar(s, 3000, 10_000);
      await new Promise((r) => setTimeout(r, 150));
      s.encerrar();
      expect(await p).toMatch(/foi encerrado/);
    }
    expect(s.emErro).toBe(false);
    expect(await falar(s, 10, 10_000)).toBe('ok');
  }, 30_000);
});

describe('Sidecar — fechar o app não deixa o motor órfão (CORE-6)', () => {
  it('encerrarEAguardar só resolve com o processo morto, mesmo no meio de um comando de 8 s', async () => {
    const { s, log } = novoSidecar();
    const emCurso = falar(s, 8000, 60_000);
    await new Promise((r) => setTimeout(r, 300));
    const pid = Number(pidsQueIniciaram(log)[0].replace('pid=', ''));
    expect(vivo(pid)).toBe(true);
    const t0 = Date.now();
    await s.encerrarEAguardar();
    // Cortesia de 1,5 s e kill — não os 8 s do comando.
    expect(Date.now() - t0).toBeLessThan(Sidecar.CORTESIA_MS + 1500);
    expect(vivo(pid)).toBe(false);
    expect(await emCurso).toMatch(/foi encerrado/);
    expect(s.processosVivos).toBe(0);
  }, 20_000);

  it('o before-quit é segurado UMA vez até o motor sair; depois o app fecha sem laço, e o quit mata o que sobrar', async () => {
    const ouvintes: Record<string, Array<(e?: { preventDefault(): void }) => void>> = {};
    let quits = 0;
    const app = {
      on(evento: string, ouvinte: (e?: { preventDefault(): void }) => void) { (ouvintes[evento] ??= []).push(ouvinte); return app; },
      quit() { quits++; },
    };
    let liberar!: () => void;
    let mortes = 0;
    const motor = {
      encerrarEAguardar: () => new Promise<void>((r) => { liberar = r; }),
      matarAgora: () => { mortes++; },
    };
    segurarSaidaAteOMotorSair(app as never, motor);

    const disparar = () => {
      let segurado = false;
      for (const o of ouvintes['before-quit']) o({ preventDefault: () => { segurado = true; } });
      return segurado;
    };
    expect(disparar()).toBe(true);   // primeiro fechamento: segura
    expect(disparar()).toBe(true);   // clique repetido enquanto espera: continua segurando
    expect(quits).toBe(0);
    liberar();
    await new Promise((r) => setTimeout(r, 0));
    expect(quits).toBe(1);           // o motor saiu: fecha de novo
    expect(disparar()).toBe(false);  // e agora passa — sem laço
    for (const o of ouvintes.quit) o();
    expect(mortes).toBe(1);
  });
});
