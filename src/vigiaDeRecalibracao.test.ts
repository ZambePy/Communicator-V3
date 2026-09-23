import { describe, it, expect } from 'vitest';
import {
  VigiaDeRecalibracao,
  avaliarNecessidadeDeRecalibracao,
  lerReferenciaDePrecisao,
  BCEA_MINIMA_PX2,
  FATOR_BCEA,
  FATOR_VIES,
  VIES_MINIMO_PX,
  AMOSTRAS_MINIMAS_DA_FIXACAO,
} from './vigiaDeRecalibracao';

function storageCom(obj: unknown): Pick<Storage, 'getItem'> {
  return { getItem: (k: string) => (k === 'accuracyResult' ? JSON.stringify(obj) : null) };
}

describe('referência do último teste de precisão', () => {
  it('lê BCEA e viés (norma) do `accuracyResult`', () => {
    const r = lerReferenciaDePrecisao(storageCom({ bceaPx2: 1200, biasX: 30, biasY: 40, timestamp: 5 }));
    expect(r).toEqual({ bceaPx2: 1200, viesPx: 50, timestamp: 5 });
  });

  it('registro antigo sem os campos → campos nulos; sem registro → null', () => {
    const r = lerReferenciaDePrecisao(storageCom({ meanError: 40 }));
    expect(r).toEqual({ bceaPx2: null, viesPx: null, timestamp: null });
    expect(lerReferenciaDePrecisao({ getItem: () => null })).toBeNull();
    expect(lerReferenciaDePrecisao({ getItem: () => '{nope' })).toBeNull();
    expect(lerReferenciaDePrecisao(null)).toBeNull();
  });
});

describe('avaliarNecessidadeDeRecalibracao', () => {
  const ref = { bceaPx2: 1000, viesPx: 20, timestamp: 1 };

  it('sem teste salvo, nunca pede — não há com que comparar', () => {
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: 1e6, viesPx: 500 }, null))
      .toEqual({ precisa: false, motivo: null });
  });

  it('dentro do esperado: não precisa', () => {
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: 1500, viesPx: 30 }, ref))
      .toEqual({ precisa: false, motivo: null });
  });

  it('viés muito acima da referência → `vies`, e ele vem antes da BCEA', () => {
    const limiar = Math.max(VIES_MINIMO_PX, FATOR_VIES * ref.viesPx);
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: 1e6, viesPx: limiar + 1 }, ref))
      .toEqual({ precisa: true, motivo: 'vies' });
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: null, viesPx: limiar }, ref).precisa).toBe(false);
  });

  it('dispersão muito acima da referência → `bcea`', () => {
    const limiar = Math.max(BCEA_MINIMA_PX2, FATOR_BCEA * ref.bceaPx2);
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: limiar + 1, viesPx: 10 }, ref))
      .toEqual({ precisa: true, motivo: 'bcea' });
  });

  it('o piso absoluto impede acusar por uma referência minúscula', () => {
    // Referência de 1 px² (teste com a cabeça no apoio): 3× isso é nada. O piso
    // segura até a elipse de raio 30 px.
    const minuscula = { bceaPx2: 1, viesPx: 1, timestamp: 1 };
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: BCEA_MINIMA_PX2 * 0.9, viesPx: VIES_MINIMO_PX * 0.9 }, minuscula).precisa)
      .toBe(false);
  });

  it('medida recente ausente num eixo não acusa aquele eixo', () => {
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: null, viesPx: null }, ref).precisa).toBe(false);
  });
});

describe('VigiaDeRecalibracao — BCEA das fixações recentes', () => {
  it('uma fixação de 500 ms com ruído gaussiano produz BCEA na ordem de 2πkσ²', () => {
    const v = new VigiaDeRecalibracao();
    // Ruído determinístico: pseudo-gaussiano por soma de 4 uniformes.
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * Math.sqrt(3); // σ ≈ 1
    const sigma = 10;
    for (let t = 0; t <= 1200; t += 33) {
      v.registrarPredicao(500 + sigma * gauss(), 400 + sigma * gauss(), t);
    }
    expect(v.fixacoesMedidas).toBeGreaterThan(0);
    const b = v.bceaRecentePx2()!;
    // 2·k·π·σ² com k = −ln(0,32) ≈ 1,14 → ~716 px². Tolerância larga: n é pequeno.
    expect(b).toBeGreaterThan(250);
    expect(b).toBeLessThan(2000);
  });

  it('uma sacada não conta como fixação', () => {
    const v = new VigiaDeRecalibracao();
    for (let t = 0, i = 0; t <= 1200; t += 33, i++) v.registrarPredicao(100 + i * 20, 400, t);
    expect(v.fixacoesMedidas).toBe(0);
    expect(v.bceaRecentePx2()).toBeNull();
  });

  it('poucas amostras não avaliam', () => {
    const v = new VigiaDeRecalibracao();
    for (let i = 0; i < AMOSTRAS_MINIMAS_DA_FIXACAO - 1; i++) v.registrarPredicao(500, 400, i * 70);
    expect(v.fixacoesMedidas).toBe(0);
  });

  it('reiniciar esquece as fixações', () => {
    const v = new VigiaDeRecalibracao();
    for (let t = 0; t <= 1200; t += 33) v.registrarPredicao(500 + (t % 3), 400, t);
    expect(v.fixacoesMedidas).toBeGreaterThan(0);
    v.reiniciar();
    expect(v.fixacoesMedidas).toBe(0);
  });
});

describe('fração do teto da correção — independente da referência', () => {
  it('sem teste de precisão salvo, a correção esgotada AINDA acusa (o comentário prometia; o código não cumpria)', () => {
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: null, viesPx: null, fracaoDoTeto: 0.95 }, null))
      .toEqual({ precisa: true, motivo: 'vies' });
  });
  it('abaixo da fração, sem referência, continua "não sei"', () => {
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: 1e6, viesPx: 500, fracaoDoTeto: 0.5 }, null))
      .toEqual({ precisa: false, motivo: null });
  });
});
