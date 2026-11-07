// Simulador do cursor na tela, quadro a quadro de display.
//
// Para que serve: medir ANTES e DEPOIS de mexer no caminho do cursor sem
// depender de olho humano nem de gravação de tela. O cursor do app anda pelo
// compositor (`cursorNoCompositor.ts`): a cada amostra o planejador escreve o
// destino e a duração da travessia, e o compositor desenha os quadros
// intermediários. Este módulo reproduz essa regra:
//
//   - o passo só vale no primeiro quadro de display (60 Hz) depois do commit
//     da thread principal (`atrasoDeCommitMs` depois da amostra);
//   - a transição nova começa no relógio do quadro em que o estilo foi escrito
//     (`relogioMs`: o `document.timeline.currentTime`, congelado no COMEÇO do
//     quadro) e parte de onde a anterior estava nesse relógio. Com a thread
//     presa 24–41 ms no MediaPipe antes da escrita, ela chega ao compositor com
//     esse tempo já corrido — o que o Chromium faz, medido em 06/11/2026. Sem
//     `relogioMs`, começa no próprio quadro de display em que vale;
//   - entre os passos, a posição segue a curva da transição (linear ou outra).
//
// As métricas (`passosPorQuadro`, `fracaoCongelada`, `histogramaDosPassos`,
// `congelamentosSeguidosDeSalto`) são as da análise do vídeo do usuário de
// 06/11/2026: 30 quadros/s, parado abaixo de 1,5 px, faixas de 1,5/5/15/40/80/
// 200 px. Assim o número da simulação e o do vídeo falam a mesma língua.
//
// O que NÃO modela: quadro de display perdido pelo próprio compositor (GPU
// presa), o atraso de vsync do monitor, e a diferença entre a hora em que a
// thread principal amostra a transição em curso e a hora em que o compositor a
// desenhou. Com a thread principal livre, os três são desprezíveis; presa, não:
// na gravação real do Chromium (§14.9 do MEDICOES), a animação web deu 1,6–18 %
// de paradas no meio do movimento e a transição CSS ~40 %, contra 4,7 % e 35 %
// aqui. O simulador ORDENA variantes (qual para menos, qual atrasa mais); a
// fração na tela se mede gravando a tela.

/** Um quadro de display a 60 Hz, em ms. */
export const QUADRO_60HZ_MS = 1000 / 60;

export type Curva = (u: number) => number;

export interface PassoAgendado {
  /** Quando a amostra chegou ao planejador (relógio do app, ms). */
  tMs: number;
  x: number;
  y: number;
  /** Duração da travessia. 0 = aparece no lugar. */
  duracaoMs: number;
  /** Curva da travessia, de [0,1] em [0,1]. Ausente = linear. */
  easing?: Curva;
  /**
   * O `document.timeline.currentTime` do quadro em que o estilo foi escrito —
   * o COMEÇO do quadro, congelado durante o callback. O Blink usa esse tempo
   * como início da transição e para ler de onde ela parte (medido no Chromium
   * em 06/11/2026). Ausente = o próprio quadro de display em que ela vale.
   */
  relogioMs?: number;
  /**
   * Animação web (`el.animate` com `startTime` explícito): o ponto de partida
   * calculado por quem escreve, no instante da escrita (`tMs`). Com `deX`/`deY`
   * o relógio congelado não se aplica.
   */
  deX?: number;
  deY?: number;
}

export interface QuadroExibido {
  tMs: number;
  x: number;
  y: number;
  /** Destino da transição em vigor neste quadro. */
  alvoX?: number;
  alvoY?: number;
}

export interface OpcoesDoSimulador {
  /** Taxa do display. Padrão 60 Hz. */
  hzDoDisplay?: number;
  /** Da chegada da amostra ao commit do estilo pela thread principal. Padrão 0. */
  atrasoDeCommitMs?: number;
  /** Primeiro quadro simulado. Padrão: o do primeiro passo. */
  inicioMs?: number;
  /** Último quadro simulado. Padrão: o do último passo + 200 ms. */
  fimMs?: number;
}

interface Travessia {
  deX: number; deY: number;
  paraX: number; paraY: number;
  inicioMs: number;
  duracaoMs: number;
  curva: Curva;
}

const LINEAR: Curva = (u) => u;

function posicaoNa(t: Travessia, tMs: number): { x: number; y: number } {
  if (t.duracaoMs <= 0 || tMs >= t.inicioMs + t.duracaoMs) return { x: t.paraX, y: t.paraY };
  const u = Math.max(0, Math.min(1, (tMs - t.inicioMs) / t.duracaoMs));
  const k = t.curva(u);
  return { x: t.deX + (t.paraX - t.deX) * k, y: t.deY + (t.paraY - t.deY) * k };
}

/**
 * A posição exibida em cada quadro de display entre `inicioMs` e `fimMs`.
 * Os passos precisam vir em ordem de `tMs`.
 */
export function simularCompositor(passos: readonly PassoAgendado[], opcoes: OpcoesDoSimulador = {}): QuadroExibido[] {
  if (passos.length === 0) return [];
  const periodo = 1000 / (opcoes.hzDoDisplay ?? 60);
  const atraso = opcoes.atrasoDeCommitMs ?? 0;
  const inicio = opcoes.inicioMs ?? passos[0].tMs;
  const fim = opcoes.fimMs ?? passos[passos.length - 1].tMs + 200;

  // O quadro de display em que cada passo passa a valer.
  const aplicacoes = passos.map((p) => ({ p, quadroMs: Math.ceil((p.tMs + atraso) / periodo - 1e-9) * periodo }));

  const quadros: QuadroExibido[] = [];
  let atual: Travessia | null = null;
  let i = 0;
  for (let k = Math.ceil(inicio / periodo - 1e-9); k * periodo <= fim + 1e-9; k++) {
    const tv = k * periodo;
    // Vários passos no mesmo quadro: só o último vale, partindo da posição
    // exibida (a mesma para todos, porque nenhum deles foi desenhado).
    while (i < aplicacoes.length && aplicacoes[i].quadroMs <= tv + 1e-9) {
      const { p, quadroMs } = aplicacoes[i];
      const animacaoWeb = p.deX !== undefined && p.deY !== undefined;
      const inicioMs = animacaoWeb ? p.tMs : (p.relogioMs ?? quadroMs);
      const de: { x: number; y: number } = animacaoWeb
        ? { x: p.deX!, y: p.deY! }
        : atual ? posicaoNa(atual, inicioMs) : { x: p.x, y: p.y };
      atual = {
        deX: de.x, deY: de.y, paraX: p.x, paraY: p.y,
        inicioMs, duracaoMs: Math.max(0, p.duracaoMs), curva: p.easing ?? LINEAR,
      };
      i++;
    }
    if (!atual) continue;
    const pos = posicaoNa(atual, tv);
    quadros.push({ tMs: tv, x: pos.x, y: pos.y, alvoX: atual.paraX, alvoY: atual.paraY });
  }
  return quadros;
}

/** Um quadro a cada `60/hz` de display — como a câmera que gravou a tela. */
export function reamostrar(quadros: readonly QuadroExibido[], hz = 30): QuadroExibido[] {
  const passo = Math.max(1, Math.round(60 / hz));
  return quadros.filter((_, i) => i % passo === 0);
}

/** Deslocamento, em px, de um quadro para o seguinte. */
export function passosPorQuadro(quadros: readonly QuadroExibido[]): number[] {
  const passos: number[] = [];
  for (let i = 1; i < quadros.length; i++) {
    passos.push(Math.hypot(quadros[i].x - quadros[i - 1].x, quadros[i].y - quadros[i - 1].y));
  }
  return passos;
}

/** Faixas da análise do vídeo: [0,1.5) [1.5,5) [5,15) [15,40) [40,80) [80,200) [200,∞). */
export const FAIXAS_DOS_PASSOS_PX = [1.5, 5, 15, 40, 80, 200] as const;

export function histogramaDosPassos(passos: readonly number[], limites: readonly number[] = FAIXAS_DOS_PASSOS_PX): number[] {
  const contagem = new Array<number>(limites.length + 1).fill(0);
  for (const p of passos) {
    let faixa = limites.findIndex((l) => p < l);
    if (faixa === -1) faixa = limites.length;
    contagem[faixa]++;
  }
  return contagem;
}

/** Fração dos quadros em que o cursor não andou (passo abaixo de `limiarPx`). */
export function fracaoCongelada(passos: readonly number[], limiarPx = 1.5): number {
  if (passos.length === 0) return 0;
  return passos.filter((p) => p < limiarPx).length / passos.length;
}

/**
 * Quantas vezes o cursor ficou parado por `minQuadros` ou mais e então saltou
 * mais de `saltoPx` — o padrão "trava e teleporta".
 */
export function congelamentosSeguidosDeSalto(
  passos: readonly number[],
  opcoes: { minQuadros?: number; saltoPx?: number; limiarPx?: number } = {},
): number {
  const minQuadros = opcoes.minQuadros ?? 4;
  const salto = opcoes.saltoPx ?? 80;
  const limiar = opcoes.limiarPx ?? 1.5;
  let parado = 0;
  let eventos = 0;
  for (const p of passos) {
    if (p < limiar) { parado++; continue; }
    if (parado >= minQuadros && p > salto) eventos++;
    parado = 0;
  }
  return eventos;
}

/**
 * Quadros de parada CURTA (até `maxQuadros` seguidos) com movimento antes e
 * depois — o "anda, para, anda" de uma travessia que termina antes da amostra
 * seguinte chegar. Paradas longas são fixação, não contam.
 */
export function paradasNoMeioDoMovimento(
  passos: readonly number[],
  opcoes: { limiarPx?: number; maxQuadros?: number } = {},
): number {
  const limiar = opcoes.limiarPx ?? 1.5;
  const max = opcoes.maxQuadros ?? 2;
  let total = 0;
  let i = 0;
  while (i < passos.length) {
    if (passos[i] >= limiar) { i++; continue; }
    let j = i;
    while (j < passos.length && passos[j] < limiar) j++;
    const comecaDepoisDeMovimento = i > 0;
    const terminaEmMovimento = j < passos.length;
    if (comecaDepoisDeMovimento && terminaEmMovimento && j - i <= max) total += j - i;
    i = j;
  }
  return total;
}

/**
 * Quadros em que o cursor se AFASTA do destino em vigor (mais de `limiarPx`
 * em relação ao quadro anterior, medido até o mesmo destino) — o recuo de uma
 * transição que parte de um ponto atrás de onde ele já estava.
 */
export function recuos(quadros: readonly QuadroExibido[], limiarPx = 0.5): number {
  let n = 0;
  for (let i = 1; i < quadros.length; i++) {
    const q = quadros[i];
    if (q.alvoX === undefined || q.alvoY === undefined) continue;
    const antes = Math.hypot(quadros[i - 1].x - q.alvoX, quadros[i - 1].y - q.alvoY);
    const agora = Math.hypot(q.x - q.alvoX, q.y - q.alvoY);
    if (agora > antes + limiarPx) n++;
  }
  return n;
}
