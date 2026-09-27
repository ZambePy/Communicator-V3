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
  MEMORIA_DAS_FIXACOES_MS,
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

// CORE-8: o portão por raio (60 px) punha um teto no que se media — o limiar
// (3× a referência) ficava acima do máximo mensurável — e quando o modelo
// piorava as janelas deixavam de contar: a mediana congelava no valor bom.
describe('VigiaDeRecalibracao — a dispersão que cresce é medida (CORE-8)', () => {
  const gerador = (seed0: number) => {
    let seed = seed0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    return () => (rnd() + rnd() + rnd() + rnd() - 2) * Math.sqrt(3);
  };
  /** Fixações em pontos que mudam a cada 1,5 s (sacadas entre elas), a 30 Hz. */
  function olhar(v: VigiaDeRecalibracao, sigma: number, deMs: number, ateMs: number, seed = 11) {
    const g = gerador(seed);
    for (let t = deMs; t <= ateMs; t += 33) {
      const alvo = Math.floor(t / 1500) % 4;
      const cx = 400 + (alvo % 2) * 600;
      const cy = 300 + Math.floor(alvo / 2) * 400;
      v.registrarPredicao(cx + sigma * g(), cy + sigma * g(), t);
    }
  }

  it('com a precisão medida na pessoa (≈27 px por eixo), dispersão 3× maior em BCEA acusa', () => {
    // Referência do teste de precisão com σ ≈ 27 px: 2·k·π·σ² ≈ 5 250 px².
    const referencia = { bceaPx2: 5250, viesPx: 10, timestamp: 1 };
    const v = new VigiaDeRecalibracao();
    olhar(v, 27, 0, 60_000);
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: v.bceaRecentePx2(), viesPx: null }, referencia).precisa).toBe(false);

    const piorou = new VigiaDeRecalibracao();
    olhar(piorou, 27 * 2.2, 0, 60_000); // BCEA ≈ 4,8× a referência
    expect(piorou.fixacoesMedidas).toBeGreaterThan(0);
    expect(avaliarNecessidadeDeRecalibracao({ bceaPx2: piorou.bceaRecentePx2(), viesPx: null }, referencia))
      .toEqual({ precisa: true, motivo: 'bcea' });
  });

  it('depois de um período bom, um período ruim move a mediana (as fixações antigas expiram)', () => {
    const v = new VigiaDeRecalibracao();
    olhar(v, 12, 0, 90_000);
    const boa = v.bceaRecentePx2()!;
    olhar(v, 60, 90_033, 90_000 + MEMORIA_DAS_FIXACOES_MS + 30_000, 23);
    const agora = v.bceaRecentePx2()!;
    expect(agora).toBeGreaterThan(boa * 10);
  });

  it('as janelas com sacada no meio continuam fora', () => {
    const v = new VigiaDeRecalibracao();
    // Olhar que salta 300 px a cada 250 ms: nenhuma janela de 500 ms é estável.
    for (let t = 0; t <= 5000; t += 33) v.registrarPredicao(Math.floor(t / 250) % 2 ? 800 : 500, 400, t);
    expect(v.fixacoesMedidas).toBe(0);
  });
});
