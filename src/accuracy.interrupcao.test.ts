import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Relato de 18/10/2026: a emergência disparada durante o teste de precisão
// levava a `/emergency`, mas o overlay dos pontos (fora do React) continuava
// por cima até o último ponto, e o painel de resultados abria sobre a tela de
// emergência. `interromperTesteDePrecisao` encerra a rodada sem painel, sem
// relatório e sem o `onComplete` de quem a iniciou (que navegaria para longe
// da emergência).

vi.mock('./calibration', () => ({
  mapGaze: () => null,
  getCalibrationTargets: () => [],
  getCalibrationFitDiagnostics: () => null,
  getDistanceRange: () => null,
  getCalibrationDistancesCm: () => ({ cameraCm: null, screenCm: null }),
  getCurrentCameraDistanceCm: () => null,
  getCalibrationTimestampMs: () => null,
  registrarValidacaoDoModelo: () => undefined,
}));

const acc = await import('./accuracy');
const { COLLECTION_MS } = await import('./accuracyProtocol');

let pendentes: FrameRequestCallback[] = [];
let relogio = 0;

function entregarQuadros() {
  const lote = pendentes;
  pendentes = [];
  for (const cb of lote) cb(relogio);
}

/** Avança a rodada como se ela continuasse viva por muito tempo. */
function tocarAteOFim() {
  for (let i = 0; i < 200; i++) {
    relogio += COLLECTION_MS + 100;
    vi.advanceTimersByTime(COLLECTION_MS + 400);
    entregarQuadros();
  }
}

describe('interromperTesteDePrecisao', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pendentes = [];
    relogio = 0;
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pendentes.push(cb);
      return pendentes.length;
    });
    vi.stubGlobal('performance', { now: () => relogio });
    fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ saved: 'teste' }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    acc.interromperTesteDePrecisao('fim do teste');
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('sem rodada em andamento, não faz nada e devolve false', () => {
    expect(acc.interromperTesteDePrecisao('emergência')).toBe(false);
    expect(acc.isAccuracyTesting).toBe(false);
  });

  it('tira o overlay na hora e nunca abre o painel nem chama o onComplete', () => {
    const onComplete = vi.fn();
    acc.startAccuracyTest(onComplete);
    relogio += 1500;
    vi.advanceTimersByTime(1500);
    entregarQuadros();

    expect(document.getElementById('accuracy-overlay')).not.toBeNull();
    expect(acc.isAccuracyTesting).toBe(true);

    expect(acc.interromperTesteDePrecisao('emergência')).toBe(true);
    expect(document.getElementById('accuracy-overlay')).toBeNull();
    expect(document.getElementById('accuracy-dot')).toBeNull();
    expect(acc.isAccuracyTesting).toBe(false);
    expect(acc.getCurrentTargetPx()).toBeNull();

    // Os timers e quadros que a rodada deixou agendados não ressuscitam nada.
    tocarAteOFim();
    expect(document.getElementById('diagnostic-overlay')).toBeNull();
    expect(document.getElementById('accuracy-overlay')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    // Nenhum relatório parcial foi enviado para gravação.
    expect(fetchMock).not.toHaveBeenCalled();

    expect(acc.interromperTesteDePrecisao('de novo')).toBe(false);
  });

  it('depois da interrupção, uma rodada nova começa normalmente', () => {
    acc.startAccuracyTest(vi.fn());
    relogio += 1500;
    vi.advanceTimersByTime(1500);
    acc.interromperTesteDePrecisao('emergência');

    const aviso = vi.spyOn(console, 'warn');
    acc.startAccuracyTest(vi.fn());
    expect(aviso).not.toHaveBeenCalledWith(expect.stringContaining('já há uma rodada'));
    expect(document.getElementById('accuracy-overlay')).not.toBeNull();
    expect(acc.isAccuracyTesting).toBe(true);
    aviso.mockRestore();
  });
});
