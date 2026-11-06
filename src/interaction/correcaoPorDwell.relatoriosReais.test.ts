import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EXPERIMENT } from '../config/experiment';
import {
  RAMPA_MS,
  corrigirDerivaPeloCentro,
  corrigirPorDwell,
  corrigirPorPontos,
  definirCorrecaoLigada,
  reiniciarCorrecao,
} from './correcaoPorDwell';

// M23 nos relatórios REAIS versionados (docs/medicoes/historico, 9 sessões de
// 05/09 a 22/09/2026, uma pessoa): as predições de cada ponto do teste de
// precisão passam pelo módulo de produção, e o erro dos outros pontos é medido
// depois de uma medida deliberada. Não é medição ao vivo — o ponto deliberado
// é um ponto do próprio teste —, mas são os olhos de verdade, não um simulador.
// Com os 6 relatórios mais novos (fora do repositório) a direção é a mesma
// (docs/MEDICOES.md §14.8).

const PASTA = join(process.cwd(), 'docs', 'medicoes', 'historico');
/**
 * As 9 sessões que fixam estes números, pelo nome: relatório novo guardado na
 * pasta (o roteiro manda guardar lá) não muda nem quebra este teste.
 */
const RELATORIOS = [
  '1788579312251', '1788580524778', '1788736866711', '1788740744920', '1788741070521',
  '1788741409103', '1789914216975', '1790115416496', '1790127248014',
].map((id) => `accuracy-report-${id}.json`);
const viewport = { largura: 1920, altura: 1080 };

interface Ponto { nome: string; alvo: { x: number; y: number }; pred: { x: number; y: number }; sd: { x: number; y: number }; n: number }
interface Sessao { pontos: Ponto[]; distanciaPx: number }

function sessoes(): Sessao[] {
  const presentes = new Set(readdirSync(PASTA));
  return RELATORIOS.filter((f) => presentes.has(f)).map((f) => {
    const r = JSON.parse(readFileSync(join(PASTA, f), 'utf8')) as {
      geometry: { pxPorCm: number };
      diagnostics: { name: string; isEdge: boolean; groundX: number; groundY: number; predX: number; predY: number; sdX?: number; sdY?: number; nSamples?: number }[];
    };
    const pontos = r.diagnostics.filter((d) => !d.isEdge).map((d) => ({
      nome: d.name,
      alvo: { x: d.groundX, y: d.groundY },
      pred: { x: d.predX, y: d.predY },
      sd: { x: d.sdX ?? 25, y: d.sdY ?? 25 },
      n: d.nSamples ?? 40,
    }));
    return { pontos, distanciaPx: 60 * r.geometry.pxPorCm };
  });
}

const S = sessoes();

/** Erro médio (px) dos pontos fora de `medidos`, depois da medida deliberada. */
function erroDosOutros(
  medir: ((s: Sessao, ctx: ReturnType<typeof contexto>) => void) | null,
  medidos: readonly string[],
): number {
  const erros: number[] = [];
  for (const s of S) {
    reiniciarCorrecao();
    definirCorrecaoLigada(true);
    const ctx = contexto(s);
    corrigirPorDwell({ x: 0.5, y: 0.5 }, 0, ctx);
    if (medir) medir(s, ctx);
    const t = 5000 + RAMPA_MS + 1;
    for (const p of s.pontos) {
      if (medidos.includes(p.nome)) continue;
      const c = corrigirPorDwell({ x: p.pred.x / viewport.largura, y: p.pred.y / viewport.altura }, t, ctx);
      erros.push(Math.hypot(c.x * viewport.largura - p.alvo.x, c.y * viewport.altura - p.alvo.y));
    }
  }
  return erros.reduce((a, b) => a + b, 0) / erros.length;
}

function contexto(s: Sessao) {
  return { viewport, pose: { yaw: 0, pitch: 0 }, distanciaPx: s.distanciaPx, rho1: 0.8 };
}

function reajustePeloCentro(s: Sessao): void {
  const c = s.pontos.find((p) => p.nome === 'P5')!;
  corrigirDerivaPeloCentro(
    { x: (c.alvo.x - c.pred.x) / viewport.largura, y: (c.alvo.y - c.pred.y) / viewport.altura },
    5000,
    { amostras: c.n, dispersao: { x: c.sd.x / viewport.largura, y: c.sd.y / viewport.altura } },
  );
}

const QUATRO = ['P1', 'P3', 'P7', 'P9'];
function recalibracaoRapida(s: Sessao): void {
  corrigirPorPontos(
    s.pontos.filter((p) => QUATRO.includes(p.nome)).map((p) => ({ alvo: p.alvo, mediana: p.pred, dispersao: p.sd, amostras: p.n })),
    5000,
    viewport,
  );
}

const salvo = {
  kalman: EXPERIMENT.correcaoPorDwellKalman,
  afim: EXPERIMENT.correcaoPorDwellAfim,
  m23: EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada,
};
beforeEach(() => {
  EXPERIMENT.correcaoPorDwellKalman = true;
  EXPERIMENT.correcaoPorDwellAfim = true;
});
afterEach(() => {
  EXPERIMENT.correcaoPorDwellKalman = salvo.kalman;
  EXPERIMENT.correcaoPorDwellAfim = salvo.afim;
  EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = salvo.m23;
  reiniciarCorrecao();
});

describe('M23 nas predições reais dos relatórios versionados', () => {
  it('são as 9 sessões com os 9 pontos internos', () => {
    expect(S).toHaveLength(9);
    for (const s of S) expect(s.pontos).toHaveLength(9);
  });

  it('reajuste pelo centro: com o ruído do mapa, o erro dos outros oito pontos cai mais', () => {
    const nada = erroDosOutros(null, ['P5']);
    EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = false;
    const semM23 = erroDosOutros(reajustePeloCentro, ['P5']);
    EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = true;
    const comM23 = erroDosOutros(reajustePeloCentro, ['P5']);
    expect(comM23).toBeLessThan(semM23);
    expect(comM23).toBeLessThan(nada);
  });

  it('recalibração rápida com os quatro cantos internos: com o ruído do mapa, também cai mais', () => {
    EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = false;
    const semM23 = erroDosOutros(recalibracaoRapida, QUATRO);
    EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = true;
    const comM23 = erroDosOutros(recalibracaoRapida, QUATRO);
    expect(comM23).toBeLessThan(semM23);
  });
});

describe('M24 nas predições reais dos relatórios versionados', () => {
  // Nas sessões de erro maior o resíduo do ponto olhado passa do teto, e o
  // reajuste era recusado inteiro. Aceitando até o dobro (deslocamento ainda no
  // teto), o erro dos outros pontos cai nas duas medidas deliberadas.
  afterEach(() => { EXPERIMENT.medidaDeliberadaAteODobroDoTeto = salvoM24; });
  const salvoM24 = EXPERIMENT.medidaDeliberadaAteODobroDoTeto;

  for (const [nome, medir, medidos] of [
    ['reajuste pelo centro', reajustePeloCentro, ['P5']],
    ['recalibração rápida pelos quatro cantos internos', recalibracaoRapida, QUATRO],
  ] as const) {
    it(`${nome}: até o dobro do teto, o erro dos outros pontos cai`, () => {
      EXPERIMENT.ruidoDoMapaNaCorrecaoDeliberada = true;
      EXPERIMENT.medidaDeliberadaAteODobroDoTeto = false;
      const semM24 = erroDosOutros(medir, medidos);
      EXPERIMENT.medidaDeliberadaAteODobroDoTeto = true;
      const comM24 = erroDosOutros(medir, medidos);
      expect(comM24).toBeLessThan(semM24);
    });
  }
});
