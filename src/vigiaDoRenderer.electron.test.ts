// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 4): a FIAÇÃO do
// vigia no processo principal, com o módulo `electron` simulado — o Electron
// não roda aqui. O que só dá para conferir no Windows está no relatório.
// -----------------------------------------------------------------------------

const ipc = vi.hoisted(() => {
  const ouvintes = new Map<string, Set<(...a: unknown[]) => void>>();
  return {
    ouvintes,
    on: (canal: string, fn: (...a: unknown[]) => void) => {
      if (!ouvintes.has(canal)) ouvintes.set(canal, new Set());
      ouvintes.get(canal)!.add(fn);
    },
    removeListener: (canal: string, fn: (...a: unknown[]) => void) => ouvintes.get(canal)?.delete(fn),
  };
});
const energia = vi.hoisted(() => ({ emissor: null as unknown as EventEmitter }));
const avisos = vi.hoisted(() => ({ mostrados: 0 }));
const log = vi.hoisted(() => ({ registrarNoLog: vi.fn() }));

vi.mock('electron', async () => {
  const { EventEmitter: EE } = await import('node:events');
  energia.emissor = new EE();
  return {
    ipcMain: { on: ipc.on, removeListener: ipc.removeListener },
    powerMonitor: energia.emissor,
    Notification: class {
      static isSupported() {
        return true;
      }
      show() {
        avisos.mostrados++;
      }
    },
  };
});
vi.mock('../electron/diagnostico', () => log);

import { vigiarRendererTravado } from '../electron/vigiaDoRenderer';
import { CANAL_DA_BATIDA, LIMITE_SEM_BATIDA_MS, INTERVALO_DO_VIGIA_MS } from './vigiaDoRenderer';

class ConteudoFalso extends EventEmitter {
  forcefullyCrashRenderer = vi.fn();
}
class JanelaFalsa extends EventEmitter {
  webContents = new ConteudoFalso();
  visivel = true;
  minimizada = false;
  destruida = false;
  isVisible() {
    return this.visivel;
  }
  isMinimized() {
    return this.minimizada;
  }
  isDestroyed() {
    return this.destruida;
  }
}

function bater(remetente: unknown, dados: unknown = { rastreando: true }) {
  for (const fn of ipc.ouvintes.get(CANAL_DA_BATIDA) ?? []) fn({ sender: remetente }, dados);
}

/** Avança o relógio batendo a cada 2 s (ou não). */
async function passar(ms: number, janela: JanelaFalsa, batendo: boolean) {
  for (let t = 0; t < ms; t += 2_000) {
    if (batendo) bater(janela.webContents);
    await vi.advanceTimersByTimeAsync(2_000);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] });
  ipc.ouvintes.clear();
  energia.emissor.removeAllListeners();
  avisos.mostrados = 0;
  log.registrarNoLog.mockClear();
});
afterEach(() => vi.useRealTimers());

const montar = () => {
  const janela = new JanelaFalsa();
  vigiarRendererTravado(janela as never, { ligado: true });
  return janela;
};

describe('vigia no processo principal', () => {
  it('página batendo: nada acontece', async () => {
    const janela = montar();
    await passar(300_000, janela, true);
    expect(janela.webContents.forcefullyCrashRenderer).not.toHaveBeenCalled();
  });

  it('página travada: derruba o processo da página (a recarga de quedas reabre), registra no log e avisa', async () => {
    const janela = montar();
    await passar(20_000, janela, true);
    await passar(LIMITE_SEM_BATIDA_MS - INTERVALO_DO_VIGIA_MS, janela, false);
    expect(janela.webContents.forcefullyCrashRenderer).not.toHaveBeenCalled();
    await passar(2 * INTERVALO_DO_VIGIA_MS, janela, false);
    expect(janela.webContents.forcefullyCrashRenderer).toHaveBeenCalledTimes(1);
    expect(log.registrarNoLog).toHaveBeenCalledWith('erro', expect.stringContaining('reiniciando a página'));
    expect(avisos.mostrados).toBe(1);
    // Desarmado até a página nova bater: não derruba de novo em laço.
    await passar(120_000, janela, false);
    expect(janela.webContents.forcefullyCrashRenderer).toHaveBeenCalledTimes(1);
  });

  it('minimizada ou escondida (Modo Computador): silêncio não derruba nada', async () => {
    const janela = montar();
    await passar(10_000, janela, true);
    janela.minimizada = true;
    await passar(120_000, janela, false);
    janela.minimizada = false;
    janela.visivel = false;
    await passar(120_000, janela, false);
    expect(janela.webContents.forcefullyCrashRenderer).not.toHaveBeenCalled();
  });

  it('tela bloqueada e sistema suspenso não contam; ao voltar, a contagem recomeça', async () => {
    const janela = montar();
    await passar(10_000, janela, true);
    energia.emissor.emit('lock-screen');
    await passar(120_000, janela, false);
    energia.emissor.emit('unlock-screen');
    await passar(LIMITE_SEM_BATIDA_MS - INTERVALO_DO_VIGIA_MS, janela, false);
    expect(janela.webContents.forcefullyCrashRenderer).not.toHaveBeenCalled();
    energia.emissor.emit('suspend');
    await passar(120_000, janela, false);
    energia.emissor.emit('resume');
    await passar(10_000, janela, true);
    expect(janela.webContents.forcefullyCrashRenderer).not.toHaveBeenCalled();
  });

  it('batida de outra janela (a sobreposição) não arma o vigia da principal', async () => {
    const janela = montar();
    for (let i = 0; i < 5; i++) bater({ outra: true });
    await passar(120_000, janela, false);
    expect(janela.webContents.forcefullyCrashRenderer).not.toHaveBeenCalled();
  });

  it('página nova (recarga) desarma até a primeira batida dela', async () => {
    const janela = montar();
    await passar(10_000, janela, true);
    janela.webContents.emit('did-start-loading');
    await passar(120_000, janela, false);
    expect(janela.webContents.forcefullyCrashRenderer).not.toHaveBeenCalled();
  });

  it('lacuna longa que se resolve sozinha vai para o log (diagnóstico do limiar)', async () => {
    const janela = montar();
    await passar(10_000, janela, true);
    await passar(14_000, janela, false);
    bater(janela.webContents);
    expect(log.registrarNoLog).toHaveBeenCalledWith('aviso', expect.stringContaining('sem dar sinal de vida e voltou'));
  });

  it('desligado (desenvolvimento sem IRISFLOW_VIGIA=1): não ouve nada', () => {
    const janela = new JanelaFalsa();
    vigiarRendererTravado(janela as never, { ligado: false });
    expect(ipc.ouvintes.get(CANAL_DA_BATIDA)?.size ?? 0).toBe(0);
  });

  it('janela fechada: para de vigiar e solta os ouvintes', () => {
    const janela = montar();
    janela.emit('closed');
    expect(ipc.ouvintes.get(CANAL_DA_BATIDA)?.size ?? 0).toBe(0);
    expect(energia.emissor.listenerCount('lock-screen')).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// O que só se confere no fonte (o mesmo padrão de `electronMain.test.ts`).
// -----------------------------------------------------------------------------

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

describe('as pontas do vigia', () => {
  it('o main liga o vigia na janela principal, ao lado da recarga de quedas', () => {
    const main = fonte('electron/main.ts');
    const criar = main.slice(main.indexOf('function createWindow('));
    expect(criar).toMatch(/vigiarRendererTravado\(win, \{ ligado: vigiaLigado\(app\.isPackaged, process\.env\.IRISFLOW_VIGIA\) \}\)/);
    expect(criar.indexOf('vigiarRendererTravado(')).toBeGreaterThan(criar.indexOf("'render-process-gone'"));
  });

  it('o preload expõe a batida pelo contextBridge, só com o booleano', () => {
    const preload = fonte('electron/preload.ts');
    expect(preload).toMatch(/vivo: \(batida: \{ rastreando: boolean \}\): void =>\s*ipcRenderer\.send\(CANAL_DA_BATIDA, \{ rastreando: batida\?\.rastreando === true \}\)/);
  });

  it('a página bate a partir das amostras do engine (GazeContext) e desarma ao desmontar', () => {
    const ctx = fonte('frontend/src/context/GazeContext.tsx');
    expect(ctx).toMatch(/const desligarBatida = ligarBatidaDoRenderer\(engine\);/);
    expect(ctx).toMatch(/desligarBatida\(\);/);
  });
});

describe('cofre do main (item 7)', () => {
  it('secure-set não lança quando o chaveiro recusa: devolve false', () => {
    const main = fonte('electron/main.ts');
    const handler = main.slice(main.indexOf("ipcMain.handle('irisflow:secure-set'"));
    const corpo = handler.slice(0, handler.indexOf('\n});'));
    expect(corpo).toMatch(/try \{[\s\S]*safeStorage\.encryptString\(valor\)[\s\S]*\} catch \(erro\) \{[\s\S]*return false;/);
  });
});
