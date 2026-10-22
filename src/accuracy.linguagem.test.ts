import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearCalibration, startCalibrationMode, startCollectingPoint, feedRawData,
  completeCalibration, getCalibrationTargets, getCollectionMsForPoint,
  duracaoTotalDoPonto, getValidacaoDoModelo,
} from './calibration';
import {
  startAccuracyTest, feedAccuracyRaw, palavraDoTeste, interromperTesteDePrecisao,
  fecharPainelDeDiagnostico, type AccuracyResult,
} from './accuracy';

// -----------------------------------------------------------------------------
// O painel do teste de precisão fala a mesma língua da tela de resultado da
// calibração (pedido de 19/10/2026): em palavras simples, a palavra e uma
// frase; com os números, o painel de sempre. E o ponto do teste é o mesmo alvo
// ABC da calibração.
//
// O fluxo é dirigido inteiro, como em `accuracy.fluxo.test.ts`: overlay, coleta
// ponto a ponto e painel final, com relógio e rAF sob controle.
// -----------------------------------------------------------------------------

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

/** Serve quadros até o painel final (ou até `quadros` acabarem). */
function percorrer(quadros = 2400, aoQuadro?: () => void) {
  let semente = 99;
  const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 - 0.5; };
  for (let i = 0; i < quadros; i++) {
    relogio += 16;
    vi.advanceTimersByTime(16);
    const fila = rafQueue;
    rafQueue = [];
    for (const cb of fila) cb(relogio);
    feedAccuracyRaw(vetor(0.5, 0.5, rnd), vetor(0.5, 0.5, rnd, 0.2), undefined,
      { yaw: 0.1, pitch: -0.05, roll: 0.01 });
    aoQuadro?.();
  }
}

const painel = () => document.querySelector('.diagnostic-overlay');
const rodape = () => document.querySelector('.diagnostic-footer');

beforeEach(() => {
  relogio = 0;
  rafQueue = [];
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  document.body.innerHTML = '';
  clearCalibration();
});

afterEach(() => {
  // Uma rodada deixada no meio (o teste do alvo para em 400 quadros) bloquearia
  // a próxima: o módulo só aceita uma por vez.
  interromperTesteDePrecisao('fim do caso de teste');
  fecharPainelDeDiagnostico();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('o painel em cada linguagem', () => {
  it('sem escolha, o painel de sempre: o desenho e os números', () => {
    expect(calibrar()).toEqual({ ok: true });
    startAccuracyTest(() => {});
    percorrer();
    expect(painel()).not.toBeNull();
    expect(painel()!.querySelector('svg')).not.toBeNull();
    expect(rodape()!.textContent).toMatch(/\d+\s*px/);
    expect(document.querySelector('.diagnostic-palavra')).toBeNull();
  });

  it('com os números, explicitamente: o mesmo painel', () => {
    expect(calibrar()).toEqual({ ok: true });
    startAccuracyTest(() => {}, undefined, undefined, { linguagem: 'tecnica' });
    percorrer();
    expect(painel()!.querySelector('svg')).not.toBeNull();
    expect(document.querySelector('.diagnostic-palavra')).toBeNull();
  });

  it('em palavras simples: a palavra e uma frase, sem desenho, sem px e sem graus', () => {
    expect(calibrar()).toEqual({ ok: true });
    let resultado: AccuracyResult | null = null;
    startAccuracyTest((r) => { resultado = r; }, undefined, undefined, { linguagem: 'simples' });
    percorrer();
    expect(painel()).not.toBeNull();
    expect(painel()!.querySelector('svg')).toBeNull();
    const palavra = document.querySelector<HTMLElement>('.diagnostic-palavra');
    expect(palavra).not.toBeNull();
    expect(['otima', 'boa', 'refazerCantos', 'refazerPontos', 'refazerTudo', 'sem-medida']).toContain(
      palavra!.dataset.palavra,
    );
    expect(document.querySelector('.diagnostic-frase')!.textContent!.length).toBeGreaterThan(10);
    const texto = rodape()!.textContent ?? '';
    expect(texto).not.toMatch(/\d+\s*px/);
    expect(texto).not.toMatch(/°/);

    // Os mesmos botões, acionáveis pelo olhar numa rota sem cursor.
    const botoes = [...document.querySelectorAll<HTMLButtonElement>('.diagnostic-btn')];
    expect(botoes.map((b) => [b.dataset.action, b.dataset.recovery])).toEqual([
      ['continue', 'true'],
      ['redo', 'true'],
    ]);

    // E o teclado: Espaço continua.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    vi.advanceTimersByTime(400);
    expect(resultado).not.toBeNull();
    // O relatório não muda com a linguagem: a classe continua a de sempre.
    expect(['Excelente', 'Bom', 'Regular', 'Ruim', 'Não medido']).toContain(resultado!.score);
  });

  it('R refaz a calibração também no painel simples', () => {
    expect(calibrar()).toEqual({ ok: true });
    let acao: string | null = null;
    startAccuracyTest((_r, a) => { acao = a; }, undefined, undefined, { linguagem: 'simples' });
    percorrer();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    vi.advanceTimersByTime(400);
    expect(acao).toBe('redo');
  });
});

describe('o ponto do teste é o alvo ABC da calibração', () => {
  it('disco, cruz e centro vermelho; a chegada já foi tirada para a contração rodar', () => {
    expect(calibrar()).toEqual({ ok: true });
    startAccuracyTest(() => {});
    let visto = false;
    percorrer(400, () => {
      const alvo = document.querySelector<HTMLElement>('#accuracy-dot .alvo-abc');
      if (!alvo) return;
      visto = true;
      expect(alvo.querySelector('.alvo-abc__disco')).not.toBeNull();
      expect(alvo.querySelector('.alvo-abc__cruz')).not.toBeNull();
      expect(alvo.querySelector('.alvo-abc__centro')).not.toBeNull();
      expect(alvo.classList.contains('alvo-abc--chegando')).toBe(false);
    });
    expect(visto).toBe(true);
    expect(document.querySelector('.accuracy-instruction')?.textContent).toMatch(/ponto vermelho/);
  });
});

describe('o teste fica registrado para o modelo em uso', () => {
  it('uma rodada de medição inteira registra o erro interior do teste', () => {
    expect(calibrar()).toEqual({ ok: true });
    let resultado: AccuracyResult | null = null;
    startAccuracyTest((r) => { resultado = r; });
    percorrer();
    document.querySelector<HTMLButtonElement>('.diagnostic-btn')!.click();
    vi.advanceTimersByTime(400);
    expect(resultado).not.toBeNull();
    const v = getValidacaoDoModelo();
    expect(v).not.toBeNull();
    expect(v!.erroInternoPx).toBe(resultado!.meanErrorInner);
  });

  it('uma rodada de verificação não registra: ela mede outra coisa', () => {
    expect(calibrar()).toEqual({ ok: true });
    startAccuracyTest(() => {}, undefined, undefined, { modo: 'verificacao' });
    percorrer();
    expect(getValidacaoDoModelo()).toBeNull();
  });

  it('uma rodada interrompida não registra: não mediu tudo', () => {
    expect(calibrar()).toEqual({ ok: true });
    startAccuracyTest(() => {});
    // Nenhum rAF servido: a cadeia de quadros morre e o teste encerra com motivo.
    for (let i = 0; i < 40; i++) {
      relogio += 1000;
      vi.advanceTimersByTime(1000);
      rafQueue = [];
    }
    expect(painel()).not.toBeNull();
    expect(getValidacaoDoModelo()).toBeNull();
  });
});

describe('palavraDoTeste', () => {
  const ponto = (isEdge: boolean, error: number) => ({ isEdge, error });

  it('sem erro interior medido, não há palavra honesta', () => {
    expect(palavraDoTeste({ meanErrorInner: null }, [])).toBeNull();
  });

  it('a classe do miolo, e os cantos "Ruins" (≥ 100 px) viram "Refazer os cantos"', () => {
    expect(palavraDoTeste({ meanErrorInner: 40 }, [ponto(false, 40), ponto(true, 90)])).toBe('otima');
    expect(palavraDoTeste({ meanErrorInner: 40 }, [ponto(false, 40), ponto(true, 100)])).toBe('refazerCantos');
    expect(palavraDoTeste({ meanErrorInner: 80 }, [ponto(false, 80)])).toBe('boa');
    // Miolo ruim vence os cantos.
    expect(palavraDoTeste({ meanErrorInner: 120 }, [ponto(true, 300)])).toBe('refazerTudo');
  });

  it('canto sem medida não conta como ruim', () => {
    expect(palavraDoTeste({ meanErrorInner: 40 }, [{ isEdge: true, error: Number.NaN }])).toBe('otima');
  });
});
