import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DWELL_CONFIG,
  MEMORIA_DE_INTRUSAO_MS,
  configComTolerancia,
  createDwellState,
  dentroDaFolga,
  stepDwell,
  type DwellConfig,
  type DwellSample,
  type DwellState,
  type DwellTarget,
} from './dwell';

// Tolerância a intrusões (M19): uma square-wave jerk de ~350 ms (volta em
// 305–378 ms, Becker et al. 2019) não pode custar o dwell inteiro.

const BOTAO: DwellTarget = { key: 'botao', customDwellMs: null, isEmergency: false, isRecovery: false, isDisabled: false };
const PASSO = 1000 / 30;

function amostra(t: number): DwellSample {
  return { x: 0, y: 0, timestamp: t, hasFace: true, degraded: false, uncalibrated: false, eyeState: 'open' };
}

/** 600 ms no botão, `excursaoMs` fora (sem alvo), e de volta até clicar ou desistir. */
function comExcursao(cfg: DwellConfig, excursaoMs: number): { clicouEm: number | null } {
  let e: DwellState = createDwellState();
  let t = 0;
  const passo = (alvo: DwellTarget | null) => {
    const r = stepDwell(e, amostra(t), alvo, cfg);
    e = r.state;
    t += PASSO;
    return r.effect.type === 'click';
  };
  while (t < 600) passo(BOTAO);
  const fimDaExcursao = t + excursaoMs;
  while (t < fimDaExcursao) passo(null);
  const volta = t;
  while (t < volta + 2000) if (passo(BOTAO)) return { clicouEm: t - volta };
  return { clicouEm: null };
}

describe('configComTolerancia', () => {
  it('memória de 400 ms com a tolerância; a de antes sem ela', () => {
    expect(configComTolerancia(DEFAULT_DWELL_CONFIG, true).graceMs).toBe(MEMORIA_DE_INTRUSAO_MS);
    expect(configComTolerancia(DEFAULT_DWELL_CONFIG, false)).toBe(DEFAULT_DWELL_CONFIG);
    // Nunca encurta uma memória que já seja maior.
    expect(configComTolerancia({ ...DEFAULT_DWELL_CONFIG, graceMs: 900 }, true).graceMs).toBe(900);
  });

  it('uma intrusão de 350 ms preserva o progresso com a tolerância e zera sem ela', () => {
    const cfg: DwellConfig = { ...DEFAULT_DWELL_CONFIG, dwellMs: 1000 };
    const com = comExcursao(configComTolerancia(cfg, true), 350);
    const sem = comExcursao(configComTolerancia(cfg, false), 350);
    // Com memória: faltavam ~400 ms. Sem: o dwell recomeça (1000 ms).
    expect(com.clicouEm!).toBeLessThan(500);
    expect(sem.clicouEm!).toBeGreaterThan(900);
  });
});

describe('dentroDaFolga', () => {
  const r = { left: 100, top: 100, right: 200, bottom: 160 };
  it('alarga o retângulo pela folga nos quatro lados', () => {
    expect(dentroDaFolga({ x: 90, y: 130 }, r, 20)).toBe(true);
    expect(dentroDaFolga({ x: 215, y: 170 }, r, 20)).toBe(true);
    expect(dentroDaFolga({ x: 230, y: 130 }, r, 20)).toBe(false);
    expect(dentroDaFolga({ x: 150, y: 130 }, r, 0)).toBe(true);
    expect(dentroDaFolga({ x: 150, y: 130 }, r, Number.NaN)).toBe(false);
  });
});
