import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { telaEmUsoDoMonitor, selecionarPaineis } from './displayGeometryEdid';

// -----------------------------------------------------------------------------
// Decisões do processo principal que não dá para exercitar sem abrir o
// Electron: conferidas no fonte (mesmo padrão de `electronSecurity.test.ts`),
// e a parte pura, por unidade.
// -----------------------------------------------------------------------------

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

describe('tela acesa durante o uso (S-1)', () => {
  it('o main segura a tela e a suspensão do início ao fim do app, e solta ao sair', () => {
    // O paciente não gera entrada de SO (o dwell é um `.click()` da página):
    // sem isto o temporizador de energia apagava a tela ou suspendia o PC.
    const main = fonte('electron/main.ts');
    expect(main).toMatch(/powerSaveBlocker\.start\('prevent-display-sleep'\)/);
    expect(main).toMatch(/app\.on\('will-quit'[\s\S]{0,200}powerSaveBlocker\.stop\(/);
    // Fica ligado dentro do `whenReady`, não atrelado a uma tela específica:
    // no Modo Computador a janela do app fica escondida e precisa valer igual.
    const pronto = main.indexOf('app.whenReady().then(');
    expect(pronto).toBeGreaterThan(0);
    expect(main.indexOf("powerSaveBlocker.start('prevent-display-sleep')")).toBeGreaterThan(pronto);
  });
});

describe('geometria do monitor da JANELA, não do primário (CORE-10)', () => {
  it('display-info e monitor-sizes usam o monitor em que a janela está', () => {
    const main = fonte('electron/main.ts');
    const handler = main.slice(main.indexOf("ipcMain.handle('irisflow:display-info'"));
    const corpo = handler.slice(0, handler.indexOf('});'));
    expect(corpo).toMatch(/monitorDaJanela\(\)/);
    expect(corpo).not.toMatch(/getPrimaryDisplay/);
    expect(main).toMatch(/screen\.getDisplayMatching\(w\.getBounds\(\)\)/);
    expect(main).toMatch(/ipcMain\.handle\('irisflow:monitor-sizes', \(\) => lerTamanhosDosMonitores\(monitorDaJanela\(\)\)\)/);
    // E avisa o renderer quando o monitor da janela muda.
    expect(main).toMatch(/webContents\.send\('irisflow:tela-mudou'/);
    expect(fonte('electron/preload.ts')).toMatch(/onTelaMudou:/);
  });

  it('o EDID é filtrado pela resolução física do monitor da janela', () => {
    // Notebook 1366×768 (primário) + monitor externo 1920×1080 a 125 % com o app.
    const externo = { size: { width: 1536, height: 864 }, scaleFactor: 1.25 };
    const tela = telaEmUsoDoMonitor(externo);
    expect(tela).toEqual({ larguraPx: 1920, alturaPx: 1080 });
    const paineis = [
      { widthCm: 34.5, heightCm: 19.4, larguraPx: 1366, alturaPx: 768, fonte: 'edid-dtd' as const },
      { widthCm: 53.1, heightCm: 29.9, larguraPx: 1920, alturaPx: 1080, fonte: 'edid-dtd' as const },
    ];
    const escolhidos = selecionarPaineis(paineis as never, tela, true);
    expect(escolhidos).toHaveLength(1);
    expect(escolhidos[0].widthCm).toBeCloseTo(53.1);
  });

  it('escala inválida não produz resolução zero nem NaN', () => {
    expect(telaEmUsoDoMonitor({ size: { width: 1920, height: 1080 }, scaleFactor: 0 })).toEqual({ larguraPx: 1920, alturaPx: 1080 });
  });
});

describe('Modo Computador com a câmera parada (CORE-1)', () => {
  it('o app avisa o main do estado do rastreador e o vigia encerra a sessão em sem_camera', () => {
    // Em `sem_camera` o engine emite amostras "sem rosto" (para o dwell zerar);
    // sem este aviso elas manteriam viva a sessão que o vigia de "sem amostra"
    // encerrava em 6 s, e a janela do app (com o aviso da câmera) não voltava.
    const sessao = fonte('electron/computador/sessao.ts');
    expect(sessao).toMatch(/ipcMain\.on\(CANAIS\.rastreamento/);
    expect(sessao).toMatch(/if \(estado === 'sem_camera'\) s\.semCameraDesde \?\?= Date\.now\(\);/);
    expect(sessao).toMatch(/s\.semCameraDesde !== null && agora - s\.semCameraDesde > VIGIA_SEM_AMOSTRA_MS\) \{ parar\('rastreamento_parou'\)/);
    expect(fonte('electron/preload.ts')).toMatch(/rastreamento: \(estado: string\): void => ipcRenderer\.send\(CANAIS\.rastreamento, estado\)/);
    expect(fonte('frontend/src/context/GazeContext.tsx')).toMatch(/irisflowSystem\?\.desktop\?\.rastreamento\?\.\(s\)/);
  });
});
