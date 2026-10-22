import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isCalibrated, clearCalibration, abortCalibration,
  startCalibrationMode, startCollectingPoint, feedRawData, completeCalibration,
  PROFILES_STORAGE_KEY, EVENTO_DE_GRAVACAO_DA_CALIBRACAO,
  type CalibrationOutcome,
} from './calibration';
import { EXPERIMENT } from './config/experiment';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 15): o perfil
// recém-treinado que o disco recusava (cota cheia, armazenamento bloqueado)
// era dado como salvo — `console.warn` e mais nada. Na abertura seguinte não
// havia calibração (1 a 2 minutos de esforço do paciente perdidos) e ninguém
// sabia por quê. Agora o desfecho diz `salvo: false` e a interface é avisada.
//
// E o caminho normal não muda: com o disco aceitando, o desfecho continua
// EXATAMENTE `{ ok: true }`.
// -----------------------------------------------------------------------------

function prng(seed: number): () => number {
  let a = seed;
  return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff - 0.5; };
}

const DIMS = 8;
const vetor = (x: number, y: number, ruido = 0) => ({
  v: Array.from({ length: DIMS }, (_, d) => Math.sin(d * 1.7 + 0.3) * x + Math.cos(d * 2.3 + 1.1) * y + ruido),
  w: Array.from({ length: DIMS }, (_, d) => Math.cos(d * 1.3 + 0.7) * x + Math.sin(d * 1.9 + 0.2) * y + ruido),
});

/** Os nove alvos com features sintéticas (a receita de `calibration.restauracao.test.ts`). */
function calibrar(): CalibrationOutcome | null {
  const alvos = [
    { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.2 },
    { x: 0.2, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 },
    { x: 0.2, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.8, y: 0.8 },
  ];
  const rnd = prng(42);
  let desfecho: CalibrationOutcome | null = null;
  startCalibrationMode();
  for (const t of alvos) {
    startCollectingPoint(t.x, t.y, () => {});
    for (let i = 0; i < 40; i++) {
      const { v, w } = vetor(t.x, t.y, rnd() * 0.01);
      feedRawData(v, w, null);
    }
  }
  completeCalibration((o) => { desfecho = o; });
  return desfecho;
}

let relogio = 0;
let gravacoes: Array<boolean | undefined> = [];
const ouvir = (e: Event) => gravacoes.push((e as CustomEvent<{ salvo?: boolean }>).detail?.salvo);
const persistirOriginal = EXPERIMENT.persistirCalibracao;

describe('gravação da calibração', () => {
  beforeEach(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1920 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 1080 });
    relogio = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (relogio += 80));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    localStorage.clear();
    clearCalibration();
    (EXPERIMENT as { polynomialFeatures: boolean }).polynomialFeatures = false;
    gravacoes = [];
    window.addEventListener(EVENTO_DE_GRAVACAO_DA_CALIBRACAO, ouvir);
  });

  afterEach(() => {
    window.removeEventListener(EVENTO_DE_GRAVACAO_DA_CALIBRACAO, ouvir);
    abortCalibration();
    clearCalibration();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
    delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
    (EXPERIMENT as { polynomialFeatures: boolean }).polynomialFeatures = true;
    EXPERIMENT.persistirCalibracao = persistirOriginal;
  });

  it('disco aceitando: o desfecho é EXATAMENTE o de antes, `{ ok: true }`, e o perfil está no disco', () => {
    expect(calibrar()).toEqual({ ok: true });
    expect(localStorage.getItem(PROFILES_STORAGE_KEY)).not.toBeNull();
    expect(gravacoes).toEqual([true]);
  });

  it('cota cheia: treinou e vale nesta sessão, mas o desfecho diz que NÃO foi salva', () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === PROFILES_STORAGE_KEY) throw new DOMException('cota excedida', 'QuotaExceededError');
      return setItem.call(this, k, v);
    });
    expect(calibrar()).toEqual({ ok: true, salvo: false });
    expect(isCalibrated()).toBe(true);
    expect(localStorage.getItem(PROFILES_STORAGE_KEY)).toBeNull();
    // A interface é avisada (o aviso "não foi possível salvar a calibração").
    expect(gravacoes).toEqual([false]);
  });

  it('persistência desligada de propósito (desenvolvimento) não é falha', () => {
    EXPERIMENT.persistirCalibracao = false;
    expect(calibrar()).toEqual({ ok: true });
    expect(gravacoes).toEqual([]);
  });
});
