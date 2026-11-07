// Medição de antes e depois do cursor (docs/MEDICOES.md §14.9), no cenário do
// vídeo de 06/11/2026: a transição CSS no relógio congelado do quadro, o
// detector de médias lento nos passos pequenos, a pálpebra baixa de 400 ms e os
// degraus do L2CS, contra M25–M29. O estimador e o planejador são os módulos de
// produção; o compositor e o uso vêm do simulador (`simuladorDoCursor.ts`,
// `cenarioDoCursor.ts`). O simulador ordena variantes; a fração de quadros
// parados na tela se mede gravando a tela.
//
// Não roda na suíte (leva ~1 min). Para medir:
//   IRISFLOW_MEDIR_CURSOR=1 npx vitest run src/testUtils/medicaoDoCursor.test.ts
import { it } from 'vitest';
import { EXPERIMENT } from '../config/experiment';
import { EstimadorDeFixacao, janelaParaRho } from '../filters/estimadorDeFixacao';
import { PlanejadorDoCursor } from '../interaction/cursorNoCompositor';
import { CENARIO_DO_VIDEO, gerarCenarioDoCursor, type OpcoesDoCenario } from './cenarioDoCursor';
import {
  simularCompositor, reamostrar, passosPorQuadro, histogramaDosPassos, fracaoCongelada,
  congelamentosSeguidosDeSalto, paradasNoMeioDoMovimento, recuos, type PassoAgendado,
} from './simuladorDoCursor';

const MEDIR = process.env.IRISFLOW_MEDIR_CURSOR === '1';

function rodar(novo: boolean, semente: number, extra: Partial<OpcoesDoCenario>) {
  EXPERIMENT.travessiaContinua = novo;
  EXPERIMENT.deslocamentoPorInovacao = novo;
  EXPERIMENT.rampaDoL2cs = novo;
  const cen = gerarCenarioDoCursor({
    ...CENARIO_DO_VIDEO, sigmaPx: 25, semente, fixacoes: 60,
    palpebraBaixa: { abaixoDeYPx: 700, congelamentoMs: novo ? 150 : 400 },
    l2cs: { periodoMs: 100, sigmaPx: 15, rampa: novo },
    ...extra,
  });
  const est = new EstimadorDeFixacao(janelaParaRho(0.8), 0.8);
  const plan = new PlanejadorDoCursor();
  const s2 = 29 * 29;
  const passos: PassoAgendado[] = [];
  let ultimo: { x: number; y: number } | null = null;
  const filtradas: { tMs: number; d: number; f: number; vx: number; vy: number }[] = [];
  for (const a of cen) {
    // Pálpebra baixa: o engine reemite a última posição e não alimenta o filtro.
    const f = a.congelado && ultimo ? ultimo : est.processar(a.x, a.y, a.tMs, { sxx: s2, syy: s2, sxy: 0 });
    ultimo = f;
    filtradas.push({ tMs: a.tMs, d: a.desdeASacadaMs, f: a.fixacao, vx: a.verdadeX, vy: a.verdadeY });
    const p = plan.passo({ x: f.x, y: f.y, tMs: a.tMs });
    if (!p) continue;
    passos.push(novo ? { tMs: a.tMs, ...p } : { tMs: a.tMs, x: p.x, y: p.y, duracaoMs: p.duracaoMs, relogioMs: a.inicioDoQuadroMs });
  }
  const q = simularCompositor(passos, { atrasoDeCommitMs: 4 });
  const q30 = reamostrar(q, 30);
  const p30 = passosPorQuadro(q30);
  const p60 = passosPorQuadro(q);
  // tremor e pulos na fixação assentada, erro contra a verdade
  let iF = 0; const emFix: number[] = []; let pulos = 0; let tFix = 0; const erros: number[] = [];
  for (let k = 6; k < q.length; k++) {
    while (iF + 1 < filtradas.length && filtradas[iF + 1].tMs <= q[k].tMs) iF++;
    const u = filtradas[iF];
    if (u.d > 500) {
      tFix += q[k].tMs - q[k - 1].tMs;
      emFix.push(Math.hypot(q[k].x - q[k - 1].x, q[k].y - q[k - 1].y));
      if (Math.hypot(q[k].x - q[k - 6].x, q[k].y - q[k - 6].y) > 25 && Math.hypot(q[k - 1].x - q[k - 7].x, q[k - 1].y - q[k - 7].y) <= 25) pulos++;
      erros.push(Math.hypot(q[k].x - u.vx, q[k].y - u.vy));
    }
  }
  // Latência: do começo da fixação nova até o cursor ficar a < 50 px de onde
  // assenta 400 ms depois; e até cobrir 70 % do caminho entre as fixações.
  const lat: number[] = []; const ate70: number[] = [];
  const inicios = [...new Map(cen.map((a) => [a.fixacao, a] as const)).values()];
  for (let f = 1; f < inicios.length; f++) {
    const a = inicios[f], ant = inicios[f - 1];
    const t0 = a.tMs - a.desdeASacadaMs - 30;
    const fim = inicios[f + 1] ? inicios[f + 1].tMs - inicios[f + 1].desdeASacadaMs : Infinity;
    const assentado = q.find((k) => k.tMs >= t0 + 400);
    if (assentado && fim > t0 + 450) {
      const c = q.find((k) => k.tMs >= t0 && Math.hypot(k.x - assentado.x, k.y - assentado.y) < 50);
      if (c) lat.push(c.tMs - t0);
    }
    const dx = a.verdadeX - ant.verdadeX, dy = a.verdadeY - ant.verdadeY, dist = Math.hypot(dx, dy);
    const base = q.find((k) => k.tMs >= t0);
    if (base && dist > 0) {
      const c = q.find((k) => k.tMs >= t0 && k.tMs < fim && ((k.x - base.x) * dx + (k.y - base.y) * dy) / dist >= 0.7 * dist);
      ate70.push(c ? c.tMs - t0 : Math.min(fim, t0 + 3000) - t0);
    }
  }
  const med = (v: number[]) => { const o = [...v].sort((x, y) => x - y); return o[Math.floor(o.length / 2)] ?? NaN; };
  const tremor = Math.sqrt(emFix.filter((v) => v < 40).reduce((t, v) => t + v * v, 0) / Math.max(1, emFix.length));
  return {
    congelado30: 100 * fracaoCongelada(p30),
    paradas60: 100 * paradasNoMeioDoMovimento(p60) / p60.length,
    travaESaltaMin: congelamentosSeguidosDeSalto(p30, { minQuadros: 10, saltoPx: 80 }) / (q.length / 3600),
    recuosMin: recuos(q, 2) / (q.length / 3600),
    pulosMin: pulos / (tFix / 60000),
    tremor,
    erro: erros.reduce((t, v) => t + v, 0) / erros.length,
    hist: histogramaDosPassos(p30),
    latencia: med(lat),
    ate70: med(ate70),
  };
}

it.skipIf(!MEDIR)('antes × depois do cursor (M25–M29), 5 sementes por cenário', () => {
  const salvo = {
    travessia: EXPERIMENT.travessiaContinua,
    inovacao: EXPERIMENT.deslocamentoPorInovacao,
    rampa: EXPERIMENT.rampaDoL2cs,
  };
  try {
    for (const [nome, extra] of [['uso (sacadas pela tela toda)', {}], ['botões vizinhos (80–160 px)', { amplitudeDoSaltoPx: [80, 160] as const }]] as const) {
      for (const novo of [false, true]) {
        const r = [1, 2, 3, 4, 5].map((s) => rodar(novo, s, extra));
        const m = (k: keyof typeof r[0]) => (r.reduce((t, x) => t + (x[k] as number), 0) / r.length).toFixed(1);
        const h = r[0].hist.map((_, i) => r.reduce((t, x) => t + x.hist[i], 0)).join('/');
        console.log(`${nome.padEnd(30)} ${novo ? 'DEPOIS' : 'ANTES '} | parados 30fps ${m('congelado30')}% | paradas no movimento ${m('paradas60')}% | congelamento ≥10 quadros + salto ${m('travaESaltaMin')}/min | recuos>2px ${m('recuosMin')}/min | pulos parado ${m('pulosMin')}/min | tremor ${m('tremor')} px/quadro | erro ${m('erro')} px | até 50 px de onde assenta ${m('latencia')} ms | 70% do caminho ${m('ate70')} ms | passos 30fps ${h}`);
      }
    }
  } finally {
    EXPERIMENT.travessiaContinua = salvo.travessia;
    EXPERIMENT.deslocamentoPorInovacao = salvo.inovacao;
    EXPERIMENT.rampaDoL2cs = salvo.rampa;
  }
}, 600000);
