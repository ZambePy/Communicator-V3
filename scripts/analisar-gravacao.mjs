#!/usr/bin/env node
/**
 * analisar-gravacao.mjs — diagnóstico de uma gravação do rastreador (JSONL).
 *
 *   node scripts/analisar-gravacao.mjs caminho/para/gravacao.jsonl
 *
 * A gravação sai de Configurações → (modo desenvolvedor) → Gravação → Exportar.
 * Ela já traz, quadro a quadro, landmarks, L2CS, pose, piscada, o ponto ANTES
 * do filtro (`preFilter`) e o ponto emitido (`predicted`). Este script responde
 * às três perguntas que um vídeo de tela não responde:
 *
 *   1. CONGELAMENTO — cada trecho com o cursor imóvel é piscada (e de quanto
 *      tempo), perda de rosto ou outra coisa?
 *   2. LATÊNCIA — quanto tempo o processamento de um quadro leva, e qual a taxa
 *      efetiva de quadros?
 *   3. CURSOR "DESENFREADO" — o vaivém lento durante a fixação acompanha a
 *      CABEÇA (compensação de pose/translação), o L2CS (aparência) ou nenhum
 *      dos dois (landmark da íris)? A resposta decide onde mexer.
 *
 * Também mede o EAR por olho contra a altura do olhar na tela: com óculos, a
 * armação pode derrubar o EAR quando a pessoa olha para cima, e é isso que faz
 * o detector de piscada congelar o cursor.
 *
 * Sem dependências: Node puro. Nada sai do computador.
 */

import { readFileSync } from 'node:fs';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('uso: node scripts/analisar-gravacao.mjs gravacao.jsonl');
  process.exit(2);
}

const linhas = readFileSync(arquivo, 'utf8').split(/\r?\n/).filter(Boolean);
const header = JSON.parse(linhas[0]);
const quadros = linhas.slice(1).map((l) => JSON.parse(l));
if (quadros.length < 30) {
  console.error(`gravação curta demais (${quadros.length} quadros)`);
  process.exit(1);
}

// ── utilitários ───────────────────────────────────────────────────────────
const pct = (a, p) => {
  if (a.length === 0) return NaN;
  const o = [...a].sort((x, y) => x - y);
  return o[Math.min(o.length - 1, Math.floor((p / 100) * o.length))];
};
const media = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');

/** R² da regressão linear múltipla y ~ 1 + X (mínimos quadrados, normal eq.). */
function r2(y, X) {
  const n = y.length;
  const k = X[0].length + 1;
  if (n < k + 5) return NaN;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const row = [1, ...X[i]];
    for (let r = 0; r < k; r++) {
      b[r] += row[r] * y[i];
      for (let c = 0; c < k; c++) A[r][c] += row[r] * row[c];
    }
  }
  for (let d = 0; d < k; d++) A[d][d] += 1e-9;
  // Gauss-Jordan
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    const piv = A[c][c];
    if (Math.abs(piv) < 1e-12) return NaN;
    for (let j = c; j < k; j++) A[c][j] /= piv;
    b[c] /= piv;
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let j = c; j < k; j++) A[r][j] -= f * A[c][j];
      b[r] -= f * b[c];
    }
  }
  const my = media(y);
  let ssr = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const row = [1, ...X[i]];
    const yh = row.reduce((s, v, j) => s + v * b[j], 0);
    ssr += (y[i] - yh) ** 2;
    sst += (y[i] - my) ** 2;
  }
  return sst > 0 ? 1 - ssr / sst : NaN;
}

// ── 1. taxa e latência ────────────────────────────────────────────────────
const cap = quadros.map((q) => q.captureTs);
const dts = cap.slice(1).map((t, i) => t - cap[i]).filter((d) => d > 0 && d < 1000);
const proc = quadros.map((q) => q.emitTs - q.captureTs).filter((d) => d >= 0 && d < 2000);
const duracaoS = (cap.at(-1) - cap[0]) / 1000;

console.log(`\n=== ${arquivo}`);
console.log(`vetor ${header.featureVectorId ?? '?'} · viewport ${header.resolution?.w}×${header.resolution?.h} · vídeo ${header.videoResolution?.w}×${header.videoResolution?.h}`);
console.log(`${quadros.length} quadros em ${f1(duracaoS)} s · descartados ${header.droppedFrames ?? 0}`);
console.log('\n[LATÊNCIA E TAXA]');
console.log(`  intervalo entre quadros: mediana ${f1(pct(dts, 50))} ms (≈ ${f1(1000 / pct(dts, 50))} Hz) · p95 ${f1(pct(dts, 95))} ms`);
console.log(`  quadros com intervalo > 66 ms (perdeu ≥1 quadro da câmera): ${f1((100 * dts.filter((d) => d > 66).length) / dts.length)} %`);
console.log(`  processamento (captura → emissão): mediana ${f1(pct(proc, 50))} ms · p95 ${f1(pct(proc, 95))} ms`);
const l2csValidos = quadros.filter((q) => q.l2cs?.valid).length;
console.log(`  L2CS válido em ${f1((100 * l2csValidos) / quadros.length)} % dos quadros`);

// ── 2. congelamentos ──────────────────────────────────────────────────────
console.log('\n[CONGELAMENTOS] cursor imóvel (≤ 0,5 px) por ≥ 10 quadros');
const episodios = [];
let ini = null;
for (let i = 1; i < quadros.length; i++) {
  const a = quadros[i - 1].predicted;
  const b = quadros[i].predicted;
  const parado = a && b && Math.hypot(a.x - b.x, a.y - b.y) <= 0.5;
  if (parado && ini === null) ini = i - 1;
  if ((!parado || i === quadros.length - 1) && ini !== null) {
    const fim = parado ? i : i - 1;
    if (fim - ini + 1 >= 10) episodios.push([ini, fim]);
    ini = null;
  }
}
if (episodios.length === 0) console.log('  nenhum');
for (const [a, b] of episodios) {
  const trecho = quadros.slice(a, b + 1);
  const ms = trecho.at(-1).captureTs - trecho[0].captureTs;
  const piscada = trecho.filter((q) => q.blink).length / trecho.length;
  const semRosto = trecho.filter((q) => !q.hasFace).length / trecho.length;
  const causa = piscada > 0.5 ? 'PISCADA (detector)' : semRosto > 0.5 ? 'SEM ROSTO' : 'outra (contraluz / features vazias / predição nula)';
  const p = trecho[0].predicted;
  console.log(`  t=${f1((trecho[0].captureTs - cap[0]) / 1000)} s · ${f1(ms)} ms · em (${Math.round(p.x)}, ${Math.round(p.y)}) · ${causa}`);
}

// ── 3. piscadas e EAR (óculos) ────────────────────────────────────────────
const aspecto = header.videoResolution?.w > 0 ? header.videoResolution.h / header.videoResolution.w : 1;
function ear(lm, ext, int, sup, inf) {
  const p = (i) => [lm[3 * i], lm[3 * i + 1], lm[3 * i + 2]];
  const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  return (d(p(sup), p(inf)) / (d(p(ext), p(int)) + 1e-9)) * aspecto;
}
const earE = [];
const earD = [];
const alturaDoOlhar = [];
let piscadaIni = null;
const piscadas = [];
for (const q of quadros) {
  if (q.blink && piscadaIni === null) piscadaIni = q.captureTs;
  if (!q.blink && piscadaIni !== null) { piscadas.push(q.captureTs - piscadaIni); piscadaIni = null; }
  if (q.landmarks?.length >= 478 * 3 && q.preFilter) {
    earE.push(ear(q.landmarks, 33, 133, 159, 145));
    earD.push(ear(q.landmarks, 263, 362, 386, 374));
    alturaDoOlhar.push(q.preFilter.y / (header.resolution?.h || 1080));
  }
}
console.log('\n[PISCADA E EAR]');
console.log(`  quadros marcados como piscada: ${f1((100 * quadros.filter((q) => q.blink).length) / quadros.length)} %`);
console.log(`  episódios: ${piscadas.length} · mediana ${f1(pct(piscadas, 50))} ms · > 400 ms: ${piscadas.filter((d) => d > 400).length} · máx ${f1(Math.max(0, ...piscadas))} ms`);
if (earE.length > 30) {
  const terco = (lo, hi) => {
    const idx = alturaDoOlhar.map((y, i) => [y, i]).filter(([y]) => y >= lo && y < hi).map(([, i]) => i);
    if (idx.length === 0) return { n: 0, e: NaN, d: NaN };
    return { n: idx.length, e: media(idx.map((i) => earE[i])), d: media(idx.map((i) => earD[i])) };
  };
  const topo = terco(-1, 1 / 3);
  const meio = terco(1 / 3, 2 / 3);
  const base = terco(2 / 3, 2);
  console.log('  EAR por olho conforme a ALTURA do olhar na tela (esq / dir):');
  console.log(`    topo  (${topo.n} q): ${f2(topo.e)} / ${f2(topo.d)}`);
  console.log(`    meio  (${meio.n} q): ${f2(meio.e)} / ${f2(meio.d)}`);
  console.log(`    base  (${base.n} q): ${f2(base.e)} / ${f2(base.d)}`);
  console.log('    (EAR menor no TOPO que no meio sugere a armação dos óculos sobre a pálpebra;');
  console.log('     uma diferença grande entre os olhos sugere reflexo em uma das lentes.)');
}

// ── 4. vaivém na fixação: cabeça × L2CS × íris ────────────────────────────
// Janelas de 1 s em que o ponto pré-filtro fica dentro de ~4° (≈ 150 px):
// aí a pessoa está fixando, e o que o ponto anda é erro de estimação.
console.log('\n[VAIVÉM NA FIXAÇÃO] o que acompanha o erro lento do ponto pré-filtro?');
const JANELA = 30;
const resultados = { cabeca: [], l2cs: [], sd: [] };
for (let i = 0; i + JANELA <= quadros.length; i += JANELA / 2) {
  const w = quadros.slice(i, i + JANELA).filter((q) => q.preFilter && q.quality && q.l2cs?.valid);
  if (w.length < JANELA * 0.8) continue;
  const xs = w.map((q) => q.preFilter.x);
  const ys = w.map((q) => q.preFilter.y);
  const alcance = (Math.max(...xs) - Math.min(...xs)) + (Math.max(...ys) - Math.min(...ys));
  if (alcance > 300) continue;
  const cabeca = w.map((q) => {
    const lm = q.landmarks ?? [];
    return [q.quality.yaw ?? 0, q.quality.pitch ?? 0, lm[3] ?? 0, lm[4] ?? 0];
  });
  const l2cs = w.map((q) => [q.l2cs.yaw, q.l2cs.pitch]);
  const rx = [r2(xs, cabeca), r2(ys, cabeca)];
  const lx = [r2(xs, l2cs), r2(ys, l2cs)];
  if (rx.every(Number.isFinite) && lx.every(Number.isFinite)) {
    resultados.cabeca.push((rx[0] + rx[1]) / 2);
    resultados.l2cs.push((lx[0] + lx[1]) / 2);
    const mx = media(xs);
    const my = media(ys);
    resultados.sd.push(Math.sqrt(media(xs.map((x, k) => (x - mx) ** 2 + (ys[k] - my) ** 2))));
  }
}
if (resultados.sd.length === 0) {
  console.log('  nenhuma janela de fixação com pose e L2CS válidos');
} else {
  console.log(`  ${resultados.sd.length} janelas de 1 s · desvio do ponto na fixação: mediana ${f1(pct(resultados.sd, 50))} px`);
  console.log(`  parte do vaivém explicada pela CABEÇA (pose + posição do nariz): R² mediano ${f2(pct(resultados.cabeca, 50))}`);
  console.log(`  parte do vaivém explicada pelo L2CS (yaw/pitch):                 R² mediano ${f2(pct(resultados.l2cs, 50))}`);
  console.log('  Leitura: R² da cabeça alto → a compensação de pose/translação está sobrando ou');
  console.log('  faltando; R² do L2CS alto com cabeça baixa → ruído de aparência (reflexo nos óculos);');
  console.log('  os dois baixos → landmark da íris (tremor do MediaPipe).');
}
console.log('');
