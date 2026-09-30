// O estimador de fixação (M9) com o ruído REAL de uma gravação. Só roda com
// uma gravação apontada:
//
//   IRISFLOW_GRAVACAO=/caminho/irisflow-recording-….jsonl npx vitest run src/filters/estimadorDeFixacao.ruidoReal.test.ts
//
// Método (docs/MEDICOES.md §14.7): os resíduos das fixações do teste de
// precisão da gravação (a predição menos a média do alvo, depois de 600 ms de
// assentamento — com a correlação e as caudas do ruído de verdade) são
// emendados numa trajetória de uso de 4 min, com uma fixação de 0,8–1,6 s por
// alvo e passos de 40 a 700 px em direções sorteadas. A Σ por ponto sai dos
// mesmos resíduos, por `estimarRuido`, como na calibração. Mede-se quanto a
// saída demora para cobrir 50 % e 90 % de cada passo, e quantas vezes ela pula
// mais de 25 px com o olhar parado.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerGravacao } from '../testUtils/replayDeGravacao';
import { covarianciaNoPonto, estimarRuido, type RuidoDaCalibracao } from '../ruidoDaCalibracao';
import { EstimadorDeFixacao, janelaParaRho } from './estimadorDeFixacao';

const CAMINHO = process.env.IRISFLOW_GRAVACAO;
const VW = 1920;
const VH = 1080;

type Residuo = { dt: number; x: number; y: number };

function gerador(semente: number) {
  let s = semente >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s + 0.5) / 4294967296;
  };
}

/** Resíduos por alvo do teste de precisão, e as amostras para a Σ da calibração. */
function residuosDaGravacao(texto: string) {
  const { quadros } = lerGravacao(texto);
  const porAlvo = new Map<string, { t: number; x: number; y: number; ax: number; ay: number }[]>();
  for (const q of quadros) {
    if (q.target?.kind !== 'accuracy' || !q.preFilter || !q.target.label) continue;
    const l = porAlvo.get(q.target.label) ?? [];
    l.push({ t: q.captureTs, x: q.preFilter.x, y: q.preFilter.y, ax: q.target.xPx, ay: q.target.yPx });
    porAlvo.set(q.target.label, l);
  }
  const residuos: Residuo[][] = [];
  const amostras: { grupo: string; alvoX: number; alvoY: number; x: number; y: number }[] = [];
  for (const [grupo, s] of porAlvo) {
    const w = s.filter((q) => q.t - s[0].t >= 600);
    if (w.length < 15) continue;
    const mx = w.reduce((a, q) => a + q.x, 0) / w.length;
    const my = w.reduce((a, q) => a + q.y, 0) / w.length;
    // Alvo em que a predição saturou no clamp da borda: o "ruído" é zero.
    if (w.every((q) => Math.abs(q.x - mx) < 1 && Math.abs(q.y - my) < 1)) continue;
    residuos.push(w.map((q, i) => ({ dt: i === 0 ? 1000 / 30 : q.t - w[i - 1].t, x: q.x - mx, y: q.y - my })));
    for (const q of w) amostras.push({ grupo, alvoX: q.ax, alvoY: q.ay, x: q.x, y: q.y });
  }
  return { residuos, ruido: estimarRuido(amostras, VW, VH) };
}

/** Trajetória de uso com o ruído real multiplicado por `escala`. */
function trajetoria(residuos: Residuo[][], semente: number, escala: number) {
  const TAMANHOS = [40, 70, 100, 140, 180, 240, 300, 400, 550, 700];
  const u = gerador(semente);
  const amostras: { t: number; x: number; y: number; vx: number; vy: number }[] = [];
  const passos: { t: number; de: { x: number; y: number }; para: { x: number; y: number }; d: number }[] = [];
  let pos = { x: 960, y: 540 };
  let de = pos;
  let para = pos;
  let tPasso = -1e9;
  let proximo = 1000 + u() * 600;
  let r = Math.floor(u() * residuos.length);
  let i = 0;
  let t = 0;
  while (t < 240_000) {
    if (i >= residuos[r].length) { r = Math.floor(u() * residuos.length); i = 0; continue; }
    const n = residuos[r][i++];
    t += n.dt;
    if (t >= proximo) {
      const d = TAMANHOS[Math.floor(u() * TAMANHOS.length)];
      for (let k = 0; k < 20; k++) {
        const a = u() * 2 * Math.PI;
        const nx = pos.x + d * Math.cos(a);
        const ny = pos.y + d * Math.sin(a);
        if (nx > 150 && nx < VW - 150 && ny > 120 && ny < VH - 120) { de = pos; para = { x: nx, y: ny }; break; }
      }
      tPasso = proximo;
      passos.push({ t: tPasso, de, para, d: Math.hypot(para.x - de.x, para.y - de.y) });
      pos = para;
      proximo = t + 800 + u() * 800;
    }
    // O passo leva ~2 quadros na predição (câmera, filtro do MediaPipe, L2CS).
    const f = Math.min(1, Math.max(0, (t - tPasso) / 66));
    const vx = de.x + (para.x - de.x) * f;
    const vy = de.y + (para.y - de.y) * f;
    amostras.push({ t, x: vx + escala * n.x, y: vy + escala * n.y, vx, vy });
  }
  return { amostras, passos };
}

function medir(residuos: Residuo[][], ruido: RuidoDaCalibracao, escalaDoUso: number) {
  const t90: { d: number; ms: number }[] = [];
  let pulos = 0;
  let quadrosParados = 0;
  for (const semente of [1, 2, 3, 4]) {
    const { amostras, passos } = trajetoria(residuos, semente, escalaDoUso);
    const e = new EstimadorDeFixacao(janelaParaRho(ruido.rho1), ruido.rho1);
    const saidas = amostras.map((a) => ({ ...a, o: e.processar(a.x, a.y, a.t, covarianciaNoPonto(ruido, a.x, a.y, VW, VH)) }));
    let j = 0;
    for (const [k, p] of passos.entries()) {
      const fim = k + 1 < passos.length ? passos[k + 1].t : Infinity;
      const ux = (p.para.x - p.de.x) / p.d;
      const uy = (p.para.y - p.de.y) / p.d;
      while (j < saidas.length && saidas[j].t < p.t) j++;
      let chegou = Number.NaN;
      let anterior: { x: number; y: number } | null = null;
      for (let i = j; i < saidas.length && saidas[i].t < fim; i++) {
        const s = saidas[i];
        if (Number.isNaN(chegou) && ((s.o.x - p.de.x) * ux + (s.o.y - p.de.y) * uy) / p.d >= 0.9) chegou = s.t - p.t;
        if (s.t - p.t >= 700) {
          if (anterior && Math.hypot(s.o.x - anterior.x, s.o.y - anterior.y) > 25) pulos++;
          if (anterior) quadrosParados++;
          anterior = s.o;
        }
      }
      t90.push({ d: p.d, ms: chegou });
    }
  }
  const mediana = (a: number, b: number) => {
    const v = t90.filter((q) => q.d >= a && q.d < b && Number.isFinite(q.ms)).map((q) => q.ms).sort((x, y) => x - y);
    return v[v.length >> 1];
  };
  return {
    t90: { '90-160': mediana(90, 160), '160-260': mediana(160, 260), '260-450': mediana(260, 450), '450-800': mediana(450, 800) },
    pulosPorMinuto: (pulos / (quadrosParados / 30)) * 60,
  };
}

describe.skipIf(!CAMINHO)('estimador de fixação com o ruído real da gravação', () => {
  // Lido no primeiro teste, não na coleta: sem gravação o bloco é pulado, mas
  // o corpo do `describe` roda mesmo assim.
  let lida: ReturnType<typeof residuosDaGravacao> | null = null;
  const gravacao = () => (lida ??= residuosDaGravacao(readFileSync(CAMINHO!, 'utf-8')));
  const escalar = (r: RuidoDaCalibracao, k: number): RuidoDaCalibracao =>
    ({ rho1: r.rho1, alvos: r.alvos.map((a) => ({ ...a, sxx: a.sxx * k * k, syy: a.syy * k * k, sxy: a.sxy * k * k })) });

  it('ruído dobrado (calibração e uso): passo de 160–260 px chega a 90 % em até 250 ms', () => {
    const { residuos, ruido } = gravacao();
    const m = medir(residuos, escalar(ruido!, 2), 2);
    console.log('ruído ×2', m);
    // Antes da revisão de 30/09: 326 ms (o passo escorregava pela janela).
    expect(m.t90['160-260']).toBeLessThanOrEqual(250);
    expect(m.t90['450-800']).toBeLessThanOrEqual(130);
  });

  it('ruído do uso 1,6× o da calibração: poucos pulos com o olhar parado', () => {
    const { residuos, ruido } = gravacao();
    const m = medir(residuos, ruido!, 1.6);
    console.log('uso 1,6×', m);
    // Antes: 6,8 pulos > 25 px por minuto (a escala subestimava o ruído).
    expect(m.pulosPorMinuto).toBeLessThan(6);
  });
});
