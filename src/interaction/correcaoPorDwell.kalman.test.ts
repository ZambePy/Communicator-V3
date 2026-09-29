import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXPERIMENT } from '../config/experiment';
import {
  QUARENTENA_MS,
  RAMPA_MS,
  RECUSAS_PARA_REAJUSTE,
  TETO_NORMALIZADO,
  aprenderComSelecao,
  corrigirDerivaPeloCentro,
  corrigirPorDwell,
  corrigirPorPontos,
  definirCorrecaoLigada,
  definirSessaoDoComputador,
  diagnosticoDaCorrecao,
  estadoDaCorrecao,
  fracaoDoTetoDaCorrecao,
  isoladoNaTela,
  registrarAcaoDoUsuario,
  reiniciarCorrecao,
} from './correcaoPorDwell';
import type { MedidaDaJanela } from './janelaDoDwell';

// A instância do app com o Kalman do V3 (M15): medida em malha aberta,
// quarentena de desfazer, rampa, reajuste pelo centro e diagnóstico.

const viewport = { largura: 1920, altura: 1080 };
const ctx = { viewport, pose: { yaw: 0, pitch: 0 }, distanciaPx: 2268, rho1: 0.8 };
const lado = { largura: 200, altura: 200 };

/** Janela de um dwell em que a predição sem correção ficou `vies` px antes do centro. */
function janela(centro: { x: number; y: number }, vies: { x: number; y: number }): MedidaDaJanela {
  return {
    mediana: { x: centro.x - vies.x, y: centro.y - vies.y },
    dispersao: { x: 30, y: 30 },
    n: 30,
    saturada: false,
  };
}

function selecionar(t: number, vies = { x: 60, y: 0 }, centro = { x: 1000, y: 500 }) {
  return aprenderComSelecao({
    centroDoAlvo: centro,
    olhar: { x: centro.x - vies.x, y: centro.y - vies.y },
    agoraMs: t,
    viewport,
    medida: janela(centro, vies),
    ladoDoAlvoPx: lado,
  });
}

const kalmanAntes = EXPERIMENT.correcaoPorDwellKalman;
const afimAntes = EXPERIMENT.correcaoPorDwellAfim;

beforeEach(() => {
  EXPERIMENT.correcaoPorDwellKalman = true;
  EXPERIMENT.correcaoPorDwellAfim = false;
  reiniciarCorrecao();
  definirCorrecaoLigada(true);
  corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctx);
});
afterEach(() => {
  EXPERIMENT.correcaoPorDwellKalman = kalmanAntes;
  EXPERIMENT.correcaoPorDwellAfim = afimAntes;
  definirSessaoDoComputador(false);
  reiniciarCorrecao();
});

describe('Kalman da correção por dwell (M15)', () => {
  it('sem a janela em malha aberta não aprende: o cursor já carrega correção, filtro e clamp', () => {
    expect(aprenderComSelecao({
      centroDoAlvo: { x: 1000, y: 500 }, olhar: { x: 940, y: 500 }, agoraMs: 100, viewport,
    })).toBe(false);
    expect(diagnosticoDaCorrecao().recusas.invalidas).toBe(1);
  });

  it('o rótulo espera a quarentena; a próxima ação o consolida', () => {
    expect(selecionar(1000)).toBe(true);
    expect(diagnosticoDaCorrecao().rotuloEmQuarentena).toBe(true);
    expect(estadoDaCorrecao().selecoes).toBe(0);
    registrarAcaoDoUsuario({ desfazer: false, agoraMs: 1500 });
    expect(diagnosticoDaCorrecao().rotuloEmQuarentena).toBe(false);
    expect(estadoDaCorrecao().selecoes).toBe(1);
    expect(diagnosticoDaCorrecao().deslocamentoPx!.x).toBeGreaterThan(10);
  });

  it('desfazer logo depois descarta o rótulo', () => {
    selecionar(1000);
    registrarAcaoDoUsuario({ desfazer: true, agoraMs: 1800 });
    expect(estadoDaCorrecao().selecoes).toBe(0);
    expect(diagnosticoDaCorrecao().recusas.desfeitas).toBe(1);
    expect(diagnosticoDaCorrecao().deslocamentoPx!.x).toBe(0);
  });

  it('sem ação nenhuma, a quarentena vence sozinha no quadro seguinte ao prazo', () => {
    selecionar(1000);
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 1000 + QUARENTENA_MS - 1, ctx);
    expect(estadoDaCorrecao().selecoes).toBe(0);
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 1000 + QUARENTENA_MS, ctx);
    expect(estadoDaCorrecao().selecoes).toBe(1);
  });

  it('a correção nova entra em rampa, sem salto no cursor', () => {
    selecionar(1000);
    registrarAcaoDoUsuario({ desfazer: false, agoraMs: 2000 });
    const x = (t: number) => corrigirPorDwell({ x: 0.5, y: 0.5 }, t, ctx).x;
    // Em ordem de tempo, como o `mapGaze` chama.
    const inicio = x(2000);
    const meio = x(2000 + RAMPA_MS / 2);
    const quadroSeguinte = x(2000 + RAMPA_MS / 2 + 33);
    const fim = x(2000 + RAMPA_MS);
    expect(inicio).toBeCloseTo(0.5, 6);
    expect(meio).toBeGreaterThan(inicio);
    expect(fim).toBeGreaterThan(meio);
    // Passo de um quadro durante a rampa: pequeno.
    expect(Math.abs(quadroSeguinte - meio) * 1920).toBeLessThan(5);
  });

  it('o teto continua valendo e a fração dele continua sendo o termômetro', () => {
    expect(fracaoDoTetoDaCorrecao()).toBeNull();
    // Viés logo acima do teto (0,078 e 0,074 da tela, norma 0,107): o χ²
    // aceita, e o deslocamento encosta no teto sem passar dele.
    for (let i = 0; i < 40; i++) {
      selecionar(1000 + i * 3000, { x: 150, y: 80 });
      registrarAcaoDoUsuario({ desfazer: false, agoraMs: 1000 + i * 3000 + 100 });
    }
    const off = estadoDaCorrecao().offset;
    expect(Math.hypot(off.x, off.y)).toBeLessThanOrEqual(TETO_NORMALIZADO + 1e-12);
    expect(fracaoDoTetoDaCorrecao()).toBeGreaterThan(0.5);
  });

  it(`${RECUSAS_PARA_REAJUSTE} recusas χ² seguidas pedem o reajuste rápido`, () => {
    // Primeiro, muitos rótulos coerentes: a variância cai.
    for (let i = 0; i < 30; i++) {
      selecionar(1000 + i * 2000, { x: 40, y: 0 });
      registrarAcaoDoUsuario({ desfazer: false, agoraMs: 1000 + i * 2000 + 100 });
    }
    expect(diagnosticoDaCorrecao().pedeReajuste).toBe(false);
    // Depois, um desvio que o modelo não explica.
    for (let i = 0; i < RECUSAS_PARA_REAJUSTE; i++) {
      const t = 70_000 + i * 2000;
      selecionar(t, { x: 40, y: -600 }, { x: 1000, y: 900 });
      registrarAcaoDoUsuario({ desfazer: false, agoraMs: t + 100 });
    }
    const d = diagnosticoDaCorrecao();
    expect(d.recusas.chi2).toBe(RECUSAS_PARA_REAJUSTE);
    expect(d.pedeReajuste).toBe(true);
    expect(d.nisMedio).not.toBeNull();
  });

  it('reajuste pelo centro: quase a substituição, e zera a sequência de recusas', () => {
    expect(corrigirDerivaPeloCentro({ x: 0.03, y: -0.02 }, 5000, {
      amostras: 60, dispersao: { x: 20 / 1920, y: 20 / 1080 },
    })).toBe(true);
    const d = diagnosticoDaCorrecao();
    expect(d.deslocamentoPx!.x).toBeGreaterThan(0.9 * 0.03 * 1920);
    expect(d.deslocamentoPx!.y).toBeLessThan(-0.9 * 0.02 * 1080);
    // Sem a dispersão da medida o Kalman não tem R: não aplica.
    expect(corrigirDerivaPeloCentro({ x: 0.01, y: 0 }, 6000)).toBe(false);
    // Acima do teto, recalibrar.
    expect(corrigirDerivaPeloCentro({ x: 0.2, y: 0 }, 7000, { amostras: 60, dispersao: { x: 0.01, y: 0.01 } })).toBe(false);
  });

  it('Modo Computador: o mesmo portão por origem', () => {
    definirSessaoDoComputador(true);
    expect(selecionar(1000)).toBe(false);
    expect(aprenderComSelecao({
      centroDoAlvo: { x: 1000, y: 500 }, olhar: { x: 940, y: 500 }, agoraMs: 1000, viewport,
      origem: 'overlay', tamanhoDoAlvoPx: 64,
      medida: janela({ x: 1000, y: 500 }, { x: 60, y: 0 }), ladoDoAlvoPx: { largura: 64, altura: 64 },
    })).toBe(true);
  });

  it('janela saturada não vale como rótulo', () => {
    expect(aprenderComSelecao({
      centroDoAlvo: { x: 1000, y: 500 }, olhar: { x: 940, y: 500 }, agoraMs: 1000, viewport,
      medida: { ...janela({ x: 1000, y: 500 }, { x: 60, y: 0 }), saturada: true }, ladoDoAlvoPx: lado,
    })).toBe(false);
  });
});

describe('recalibração rápida afim com cinco pontos (M20)', () => {
  /** O olhar com deslocamento (30, −20) px e ganho 1,05 em x em torno do centro. */
  const pontos = [
    { x: 960, y: 540 }, { x: 480, y: 270 }, { x: 1440, y: 270 }, { x: 1440, y: 810 }, { x: 480, y: 810 },
  ].map((alvo) => {
    // Correção necessária: o + g·(m − centro) = alvo − m.
    const mx = (alvo.x - 30 + 0.05 * 960) / 1.05;
    return {
      alvo,
      mediana: { x: mx, y: alvo.y + 20 },
      dispersao: { x: 25, y: 25 },
      amostras: 36,
    };
  });

  it('com o afim, aprende deslocamento e ganho de uma vez', () => {
    EXPERIMENT.correcaoPorDwellAfim = true;
    expect(corrigirPorPontos(pontos, 1000, viewport)).toBe(true);
    const d = diagnosticoDaCorrecao();
    expect(d.ganho!.x).toBeGreaterThan(0.03);
    expect(Math.abs(d.deslocamentoPx!.y + 20)).toBeLessThan(5);
    // Depois da rampa, o canto esquerdo é corrigido para perto do alvo.
    const canto = pontos[1];
    const p = corrigirPorDwell({ x: canto.mediana.x / 1920, y: canto.mediana.y / 1080 }, 1000 + RAMPA_MS, ctx);
    expect(Math.abs(p.x * 1920 - canto.alvo.x)).toBeLessThan(12);
    expect(Math.abs(p.y * 1080 - canto.alvo.y)).toBeLessThan(5);
  });

  it('sem o afim, só o deslocamento', () => {
    EXPERIMENT.correcaoPorDwellAfim = false;
    expect(corrigirPorPontos(pontos, 1000, viewport)).toBe(true);
    expect(diagnosticoDaCorrecao().ganho).toBeNull();
    expect(diagnosticoDaCorrecao().deslocamentoPx!.y).toBeLessThan(-15);
  });

  it('erro médio acima do teto: calibrar de novo, nada muda', () => {
    const longe = pontos.map((p) => ({ ...p, mediana: { x: p.mediana.x - 400, y: p.mediana.y } }));
    expect(corrigirPorPontos(longe, 1000, viewport)).toBe(false);
    expect(diagnosticoDaCorrecao().selecoes).toBe(0);
  });

  it('só existe com o Kalman', () => {
    EXPERIMENT.correcaoPorDwellKalman = false;
    expect(corrigirPorPontos(pontos, 1000, viewport)).toBe(false);
  });

  it('com o ganho, a correção aplicada perto da borda também para no teto', () => {
    // Deslocamento de 140 px e ganho de 12 % em x: o ganho satura em ±0,1 e o
    // deslocamento chega perto do teto; sem limite na correção APLICADA, a
    // borda direita recebia deslocamento + ganho × 912 px, bem além da elipse
    // de que o `isoladoNaTela` depende.
    EXPERIMENT.correcaoPorDwellAfim = true;
    const muitoGanho = pontos.map(({ alvo, dispersao, amostras }) => ({
      alvo,
      mediana: { x: (alvo.x - 140 + 0.12 * 960) / 1.12, y: alvo.y },
      dispersao,
      amostras,
    }));
    expect(corrigirPorPontos(muitoGanho, 1000, viewport)).toBe(true);
    for (const x of [0.02, 0.25, 0.5, 0.75, 0.98]) {
      const p = corrigirPorDwell({ x, y: 0.5 }, 1000 + RAMPA_MS, ctx);
      const norma = Math.hypot(p.x - x, p.y - 0.5);
      expect(norma).toBeLessThanOrEqual(TETO_NORMALIZADO + 1e-12);
    }
  });
});

describe('isoladoNaTela', () => {
  const centro = { x: 960, y: 540 };
  it('vizinho dentro da elipse do teto: não isolado; fora dela: isolado', () => {
    // Teto: 0,08 × 1920 = 153,6 px em x; 0,08 × 1080 = 86,4 px em y.
    const perto = { left: 960 + 100, right: 960 + 300, top: 500, bottom: 580 };
    const longe = { left: 960 + 160, right: 960 + 300, top: 500, bottom: 580 };
    expect(isoladoNaTela(centro, [perto], viewport)).toBe(false);
    expect(isoladoNaTela(centro, [longe], viewport)).toBe(true);
    // Em y o teto é menor: 90 px abaixo já está fora.
    expect(isoladoNaTela(centro, [{ left: 900, right: 1000, top: 540 + 90, bottom: 700 }], viewport)).toBe(true);
    expect(isoladoNaTela(centro, [], viewport)).toBe(true);
  });

  it('retângulo vazio (elemento escondido) não conta', () => {
    expect(isoladoNaTela(centro, [{ left: 960, right: 960, top: 540, bottom: 540 }], viewport)).toBe(true);
  });
});
