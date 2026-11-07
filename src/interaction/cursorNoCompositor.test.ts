import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  PlanejadorDoCursor,
  transicaoDoPasso,
  DURACAO_DA_SACADA_MS,
  DURACAO_MAXIMA_MS,
  DURACAO_MINIMA_MS,
  MARGEM_DA_TRAVESSIA_MS,
  DURACAO_MAXIMA_CONTINUA_MS,
} from './cursorNoCompositor';
import { DISTANCIA_DE_SALTO_PX } from './seguidorDeCursor';
import { EXPERIMENT } from '../config/experiment';
import { EstimadorDeFixacao, janelaParaRho } from '../filters/estimadorDeFixacao';
import { CENARIO_DO_VIDEO, gerarCenarioDoCursor } from '../testUtils/cenarioDoCursor';
import {
  simularCompositor,
  passosPorQuadro,
  paradasNoMeioDoMovimento,
  type PassoAgendado,
} from '../testUtils/simuladorDoCursor';

const salvo = EXPERIMENT.travessiaContinua;
afterEach(() => { EXPERIMENT.travessiaContinua = salvo; });

// Gravação de 30/09: o cursor andava aos degraus porque o laço de rAF que o
// interpolava divide a thread com o MediaPipe. O planejador decide destino e
// duração de cada travessia; quem desenha os quadros é o compositor.

/** Amostras a `hz`, andando `passoPx` na horizontal. Devolve os passos planejados. */
function amostras(p: PlanejadorDoCursor, n: number, hz: number, passoPx: number, x0 = 400, t0 = 1000) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(p.passo({ x: x0 + i * passoPx, y: 300, tMs: t0 + (i * 1000) / hz }));
  return out;
}

describe('planejador do cursor pelo compositor (base: travessia de um intervalo)', () => {
  beforeEach(() => { EXPERIMENT.travessiaContinua = false; });

  it('a primeira amostra aparece no lugar, sem travessia', () => {
    const p = new PlanejadorDoCursor();
    expect(p.passo({ x: 500, y: 300, tMs: 10 })).toEqual({ x: 500, y: 300, duracaoMs: 0 });
  });

  it('a 30 Hz a travessia dura um intervalo: o cursor chega quando a próxima amostra chega', () => {
    const passos = amostras(new PlanejadorDoCursor(), 10, 30, 5);
    for (const passo of passos.slice(1)) expect(passo!.duracaoMs).toBe(33);
  });

  it('câmera a 15 quadros/s: travessia de ~67 ms; muito lenta, presa no teto', () => {
    expect(amostras(new PlanejadorDoCursor(), 6, 15, 5).at(-1)!.duracaoMs).toBe(67);
    expect(amostras(new PlanejadorDoCursor(), 6, 4, 5).at(-1)!.duracaoMs).toBe(DURACAO_MAXIMA_MS);
  });

  it('câmera rápida demais não pede travessia menor que um quadro de display', () => {
    expect(amostras(new PlanejadorDoCursor(), 6, 120, 1).at(-1)!.duracaoMs).toBe(DURACAO_MINIMA_MS);
  });

  it('a mediana dos intervalos ignora um quadro perdido isolado', () => {
    const p = new PlanejadorDoCursor();
    const ts = [0, 33, 66, 166, 199, 232];
    let ultimo = null;
    for (const t of ts) ultimo = p.passo({ x: 400 + t / 10, y: 300, tMs: t });
    expect(ultimo!.duracaoMs).toBe(33);
  });

  it('sacada atravessa em ~1 quadro: o olho já está lá', () => {
    const p = new PlanejadorDoCursor();
    amostras(p, 5, 30, 2);
    const salto = p.passo({ x: 408 + DISTANCIA_DE_SALTO_PX + 50, y: 300, tMs: 1000 + (5 * 1000) / 30 });
    expect(salto!.duracaoMs).toBe(DURACAO_DA_SACADA_MS);
  });

  it('amostra relida (mesmo carimbo) ou inválida não produz passo', () => {
    const p = new PlanejadorDoCursor();
    p.passo({ x: 500, y: 300, tMs: 100 });
    expect(p.passo({ x: 510, y: 300, tMs: 100 })).toBeNull();
    expect(p.passo({ x: 510, y: 300, tMs: 90 })).toBeNull();
    expect(p.passo({ x: NaN, y: 300, tMs: 200 })).toBeNull();
  });

  it('depois de reiniciar (cursor escondido e de volta), aparece no lugar de novo', () => {
    const p = new PlanejadorDoCursor();
    amostras(p, 5, 30, 5);
    p.reiniciar();
    expect(p.idadeMs(5000)).toBeNull();
    expect(p.passo({ x: 900, y: 700, tMs: 5000 })).toEqual({ x: 900, y: 700, duracaoMs: 0 });
  });

  it('a idade da última amostra alimenta o aviso de fonte seca', () => {
    const p = new PlanejadorDoCursor();
    p.passo({ x: 1, y: 1, tMs: 1000 });
    expect(p.idadeMs(1350)).toBe(350);
    expect(p.idadeMs(900)).toBe(0);
  });

  it('a propriedade `transition` leva a travessia e as outras transições do elemento', () => {
    expect(transicaoDoPasso(33)).toBe('transform 33ms linear');
    expect(transicaoDoPasso(0, 'opacity 600ms ease 300ms')).toBe('transform 0ms linear, opacity 600ms ease 300ms');
    expect(transicaoDoPasso(33.4)).toBe('transform 33ms linear');
  });
});

// M25 — o cursor andava aos trancos por dois motivos, medidos no Chromium em
// 06/11/2026. (1) A travessia de um intervalo só emenda quando a amostra
// seguinte chega na hora; com o MediaPipe na thread principal elas chegam a
// ~22–28 por segundo, em intervalos de 33, 50 e 66 ms. (2) A transição CSS
// escrita no fim de um quadro ocupado ganha como início o COMEÇO do quadro
// (medido com 30 ms de trabalho na thread): chega ao compositor quase
// terminada, e o cursor salta e para. Numa gravação a 60 fps de um Chromium com
// a thread presa 22–40 ms por quadro, 40 % dos quadros ficavam parados no meio
// de um movimento contínuo; com a animação web partindo do ponto calculado,
// 1,6–18 % (média ~10 % em 3 gravações).
describe('travessia contínua (M25)', () => {
  beforeEach(() => { EXPERIMENT.travessiaContinua = true; });

  it('a 30 Hz a travessia dura um intervalo mais um quadro de display', () => {
    const passos = amostras(new PlanejadorDoCursor(), 10, 30, 5);
    for (const passo of passos.slice(1)) expect(passo!.duracaoMs).toBe(33 + MARGEM_DA_TRAVESSIA_MS);
  });

  it('câmera a 15 quadros/s: 67 ms mais a margem; muito lenta, presa no teto', () => {
    expect(amostras(new PlanejadorDoCursor(), 6, 15, 5).at(-1)!.duracaoMs).toBe(67 + MARGEM_DA_TRAVESSIA_MS);
    expect(amostras(new PlanejadorDoCursor(), 6, 4, 5).at(-1)!.duracaoMs).toBe(DURACAO_MAXIMA_CONTINUA_MS);
  });

  it('sacada continua atravessando em ~1 quadro (o olho já está lá)', () => {
    const p = new PlanejadorDoCursor();
    amostras(p, 5, 30, 2);
    const salto = p.passo({ x: 408 + DISTANCIA_DE_SALTO_PX + 50, y: 300, tMs: 1000 + (5 * 1000) / 30 });
    expect(salto!.duracaoMs).toBe(DURACAO_DA_SACADA_MS);
  });

  it('o passo diz de onde partir: onde a travessia anterior está no instante da amostra', () => {
    const p = new PlanejadorDoCursor();
    expect(p.passo({ x: 0, y: 0, tMs: 0 })).toMatchObject({ deX: 0, deY: 0 });
    const primeiro = p.passo({ x: 60, y: 0, tMs: 33 })!;
    expect(primeiro).toMatchObject({ deX: 0, deY: 0 });
    // 25 ms depois, a travessia de 0 a 60 está na metade do caminho.
    const segundo = p.passo({ x: 60, y: 80, tMs: 33 + primeiro.duracaoMs / 2 })!;
    expect(segundo.deX).toBeCloseTo(30, 6);
    expect(segundo.deY).toBeCloseTo(0, 6);
  });

  it('depois de reiniciar, aparece no lugar e parte dele', () => {
    const p = new PlanejadorDoCursor();
    amostras(p, 5, 30, 5);
    p.reiniciar();
    expect(p.passo({ x: 900, y: 700, tMs: 5000 })).toEqual({ x: 900, y: 700, duracaoMs: 0, deX: 900, deY: 700 });
  });

  it('no cenário do vídeo, o cursor para no meio do movimento em menos de 5 % dos quadros (hoje, ~35 %)', () => {
    const fracao = (continua: boolean) => {
      EXPERIMENT.travessiaContinua = continua;
      let parados = 0;
      let quadros = 0;
      for (const semente of [1, 2, 3]) {
        const cen = gerarCenarioDoCursor({ ...CENARIO_DO_VIDEO, semente, fixacoes: 40 });
        const est = new EstimadorDeFixacao(janelaParaRho(0.8), 0.8);
        const plan = new PlanejadorDoCursor();
        const s2 = CENARIO_DO_VIDEO.sigmaPx ** 2;
        const passos: PassoAgendado[] = [];
        for (const a of cen) {
          const f = est.processar(a.x, a.y, a.tMs, { sxx: s2, syy: s2, sxy: 0 });
          const p = plan.passo({ x: f.x, y: f.y, tMs: a.tMs });
          if (!p) continue;
          // Hoje: transição CSS, com o relógio do quadro congelado no começo
          // dele. M25: animação web partindo do ponto que o passo calculou.
          passos.push(continua ? { tMs: a.tMs, ...p } : { tMs: a.tMs, x: p.x, y: p.y, duracaoMs: p.duracaoMs, relogioMs: a.inicioDoQuadroMs });
        }
        const p60 = passosPorQuadro(simularCompositor(passos, { atrasoDeCommitMs: 4 }));
        parados += paradasNoMeioDoMovimento(p60);
        quadros += p60.length;
      }
      return parados / quadros;
    };
    expect(fracao(false)).toBeGreaterThan(0.25);
    expect(fracao(true)).toBeLessThan(0.05);
  });
});
