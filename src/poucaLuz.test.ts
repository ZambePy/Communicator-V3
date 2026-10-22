import { describe, it, expect } from 'vitest';
import {
  luminanciaMedia,
  passoDaPoucaLuz,
  mensagemDePoucaLuz,
  ESTADO_INICIAL_DA_LUZ,
  BRILHO_POUCA_LUZ,
  BRILHO_LUZ_VOLTOU,
  POUCA_LUZ_APOS_MS,
  LUZ_VOLTOU_APOS_MS,
  MedidorDeBrilhoDoQuadro,
  type EstadoDaPoucaLuz,
} from './poucaLuz';

// Pedido de 18/10/2026: a emergência precisa funcionar à noite, com pouca luz.

function pixels(r: number, g: number, b: number, n = 16): Uint8ClampedArray {
  const p = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) p.set([r, g, b, 255], i * 4);
  return p;
}

/** Roda a regra com uma amostra a cada 500 ms (a cadência do provider). */
function rodar(e: EstadoDaPoucaLuz, brilho: number | null, deMs: number, ateMs: number, emMedicao = false) {
  let estado = e;
  for (let t = deMs; t <= ateMs; t += 500) estado = passoDaPoucaLuz(estado, brilho, t, emMedicao);
  return estado;
}

describe('luminância do quadro', () => {
  it('Rec. 601, ignorando o alfa', () => {
    expect(luminanciaMedia(pixels(255, 255, 255))).toBeCloseTo(1, 5);
    expect(luminanciaMedia(pixels(0, 0, 0))).toBe(0);
    expect(luminanciaMedia(pixels(255, 0, 0))).toBeCloseTo(0.299, 3);
    expect(luminanciaMedia(new Uint8ClampedArray(0))).toBe(0);
  });
});

describe('pouca luz com histerese', () => {
  it('luz normal nunca avisa (a saída do rastreamento fica igual)', () => {
    const e = rodar(ESTADO_INICIAL_DA_LUZ, 0.42, 0, 120_000);
    expect(e.poucaLuz).toBe(false);
    expect(e.abaixoDesdeMs).toBeNull();
  });

  it('escuro por menos de 10 s não avisa; por 10 s, avisa', () => {
    let e = rodar(ESTADO_INICIAL_DA_LUZ, BRILHO_POUCA_LUZ - 0.04, 0, POUCA_LUZ_APOS_MS - 500);
    expect(e.poucaLuz).toBe(false);
    e = passoDaPoucaLuz(e, BRILHO_POUCA_LUZ - 0.04, POUCA_LUZ_APOS_MS, false);
    expect(e.poucaLuz).toBe(true);
  });

  it('uma piscada de luz no meio do escuro reinicia a contagem', () => {
    let e = rodar(ESTADO_INICIAL_DA_LUZ, 0.05, 0, 8000);
    e = passoDaPoucaLuz(e, 0.4, 8500, false);
    e = rodar(e, 0.05, 9000, 15_000);
    expect(e.poucaLuz).toBe(false);
  });

  it('o aviso só sai depois de a luz ficar boa por 3 s, e não pisca na fronteira', () => {
    let e = rodar(ESTADO_INICIAL_DA_LUZ, 0.05, 0, 11_000);
    expect(e.poucaLuz).toBe(true);
    // Entre os dois limiares: continua avisando.
    e = rodar(e, (BRILHO_POUCA_LUZ + BRILHO_LUZ_VOLTOU) / 2, 11_500, 30_000);
    expect(e.poucaLuz).toBe(true);
    e = rodar(e, 0.3, 30_500, 30_500 + LUZ_VOLTOU_APOS_MS - 500);
    expect(e.poucaLuz).toBe(true);
    e = passoDaPoucaLuz(e, 0.3, 30_500 + LUZ_VOLTOU_APOS_MS, false);
    expect(e.poucaLuz).toBe(false);
  });

  it('não medido não muda nada; calibração e teste zeram', () => {
    let e = rodar(ESTADO_INICIAL_DA_LUZ, 0.05, 0, 11_000);
    expect(rodar(e, null, 11_500, 60_000).poucaLuz).toBe(true);
    e = passoDaPoucaLuz(e, 0.05, 61_000, true);
    expect(e.poucaLuz).toBe(false);
    expect(e.abaixoDesdeMs).toBeNull();
  });

  it('o texto diz o que ajuda, e fala da tela só quando ela está escurecida', () => {
    expect(mensagemDePoucaLuz(false)).toMatch(/luz de frente/);
    expect(mensagemDePoucaLuz(false)).not.toMatch(/tela está escurecida/);
    expect(mensagemDePoucaLuz(true)).toMatch(/clarear a tela/);
  });
});

describe('medidor do quadro', () => {
  it('sem vídeo ou sem dimensões: não medido', () => {
    const m = new MedidorDeBrilhoDoQuadro();
    expect(m.medir(null, 0)).toBeNull();
    expect(m.medir({ videoWidth: 0, videoHeight: 0 } as unknown as HTMLVideoElement, 0)).toBeNull();
  });
});
