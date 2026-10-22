import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearCalibration, startCalibrationMode, startCollectingPoint, feedRawData,
  completeCalibration, getCalibrationTargets, getCollectionMsForPoint,
  duracaoTotalDoPonto,
} from './calibration';
import { startAccuracyTest, feedAccuracyRaw, gravaRelatorioNoDisco } from './accuracy';

// Revisão final de 22/10/2026: no app INSTALADO a página é file://, não há o
// endpoint do Vite, e o relatório caía no download do navegador — que no
// Electron abre o "Salvar como" do sistema por cima da tela, depois de TODA
// calibração, na frente de quem só tem o olhar. Lá o relatório completo não é
// baixado; em dev e no preview (http) nada muda.

const qualidade = () => ({
  yaw: 0.1, pitch: -0.05, roll: 0.01,
  irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.24, contrastEstimate: 0.09, blurEstimate: 0,
});

let relogio = 0;
let rafQueue: FrameRequestCallback[] = [];

function vetor(x: number, y: number, ruido: () => number, fase = 0) {
  return Array.from({ length: 6 }, (_, d) =>
    Math.sin(d * 1.7 + 0.3 + fase) * x + Math.cos(d * 2.3 + 1.1 + fase) * y
    + ruido() * 0.002 + (d >= 4 ? 0.3 : 0));
}

function calibrar() {
  let semente = 7;
  const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 - 0.5; };
  startCalibrationMode();
  for (const t of getCalibrationTargets()) {
    startCollectingPoint(t.x, t.y, () => {});
    const total = duracaoTotalDoPonto(getCollectionMsForPoint(t.x, t.y));
    for (let ms = 0; ms <= total + 200; ms += 40) {
      relogio += 40;
      feedRawData(vetor(t.x, t.y, rnd), vetor(t.x, t.y, rnd, 0.2), qualidade());
    }
  }
  let outcome: { ok: boolean } | null = null;
  completeCalibration((o) => { outcome = o as { ok: boolean }; });
  return outcome;
}

/** Roda o teste de precisão inteiro até o painel final. */
function rodarTesteInteiro() {
  startAccuracyTest(() => {});
  let semente = 99;
  const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 - 0.5; };
  for (let i = 0; i < 2400; i++) {
    relogio += 16;
    vi.advanceTimersByTime(16);
    const fila = rafQueue;
    rafQueue = [];
    for (const cb of fila) cb(relogio);
    feedAccuracyRaw(vetor(0.5, 0.5, rnd), vetor(0.5, 0.5, rnd, 0.2), undefined, { yaw: 0.1, pitch: -0.05, roll: 0.01 });
  }
  expect(document.querySelector('.diagnostic-overlay')).not.toBeNull();
}

describe('relatório do teste de precisão no app instalado', () => {
  it('só grava em disco (endpoint ou download) fora do file://', () => {
    expect(gravaRelatorioNoDisco('file:')).toBe(false);
    expect(gravaRelatorioNoDisco('http:')).toBe(true);
    expect(gravaRelatorioNoDisco('https:')).toBe(true);
    // Sem `location` (ambiente sem página): o comportamento de sempre.
    expect(gravaRelatorioNoDisco(undefined)).toBe(true);
  });

  describe('fluxo completo', () => {
    let buscar: ReturnType<typeof vi.fn>;
    let criarUrl: ReturnType<typeof vi.fn>;
    let cliqueEmLink: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      relogio = 0;
      rafQueue = [];
      vi.useFakeTimers();
      vi.spyOn(performance, 'now').mockImplementation(() => relogio);
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length; });
      // file:// não tem o endpoint: o `fetch` rejeita, como no Chromium.
      buscar = vi.fn(() => Promise.reject(new TypeError('URL scheme "file" is not supported.')));
      vi.stubGlobal('fetch', buscar);
      criarUrl = vi.fn(() => 'blob:relatorio');
      vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: criarUrl, revokeObjectURL: () => {} }));
      cliqueEmLink = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      document.body.innerHTML = '';
      clearCalibration();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      document.body.innerHTML = '';
    });

    it('no app instalado (file://) não chama o endpoint nem abre download', async () => {
      vi.stubGlobal('location', { ...window.location, protocol: 'file:', href: 'file:///C:/IrisFlow/index.html' });
      expect(calibrar()).toEqual({ ok: true });
      rodarTesteInteiro();
      await vi.runAllTimersAsync();
      expect(buscar).not.toHaveBeenCalled();
      expect(criarUrl).not.toHaveBeenCalled();
      expect(cliqueEmLink).not.toHaveBeenCalled();
    });

    it('em dev (http) continua tentando o endpoint e, sem ele, o download', async () => {
      expect(calibrar()).toEqual({ ok: true });
      rodarTesteInteiro();
      await vi.runAllTimersAsync();
      expect(buscar).toHaveBeenCalledTimes(1);
      expect(criarUrl).toHaveBeenCalledTimes(1);
      expect(cliqueEmLink).toHaveBeenCalledTimes(1);
    });
  });
});
