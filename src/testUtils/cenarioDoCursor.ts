// Cenário de uso para medir o movimento do cursor (com `simuladorDoCursor.ts`).
//
// O olho fixa um ponto da tela por 0,4–1,5 s e salta para outro. A estimativa
// do olhar chega com ruído COLORIDO (AR(1), ρ ≈ 0,8 entre quadros de câmera, o
// medido nos relatórios reais) e em instantes irregulares: a câmera entrega um
// quadro a cada 33 ms, a thread principal leva 24 ms na mediana e 41 ms no p90
// para processar cada um (gravação de 23/09/2026) e perde os que chegam com ela
// ocupada.
//
// Valores do `CENARIO_DO_VIDEO` (o vídeo de 06/11/2026 e o relatório de
// 25/10/2026, que tinham ~22–28 amostras/s): o cenário gera ~25 amostras/s
// (24,6–25,4 em 10 sementes), com intervalos de câmera de 33 ms em ~81 % e de
// 66 ms em ~18 %, e desvio de ~30 px por eixo.
//
// O ruído é por eixo e independente entre eixos. A sacada é instantânea na
// verdade (dura 30–50 ms no olho, menos de um quadro e meio de câmera).

import { mulberry32 } from './gazeSimulator';

export interface OpcoesDoCenario {
  semente: number;
  fixacoes: number;
  /** Duração de cada fixação, sorteada uniforme entre os dois valores (ms). */
  duracaoDaFixacaoMs: readonly [number, number];
  /** Desvio do ruído da estimativa, por eixo (px). */
  sigmaPx: number;
  /** Correlação do ruído entre quadros de câmera seguidos. */
  rho: number;
  hzDaCamera: number;
  /**
   * Tempo de processamento de um quadro na thread principal (ms): um mínimo e
   * uma cauda exponencial com a média dada. Com 22 + 6 ms, a mediana fica em
   * ~26 ms e o p90 em ~36 ms, perto dos 24/41 ms medidos em 23/09/2026.
   */
  processamento: { minimoMs: number; caudaMediaMs: number };
  /** Fração extra de quadros perdidos (thread presa em outra coisa). */
  fracaoPerdida: number;
  larguraPx: number;
  alturaPx: number;
  /** Margem das bordas onde não cai fixação (px). */
  margemPx: number;
  /**
   * Tamanho de cada salto entre fixações (px), sorteado uniforme. Ausente: a
   * fixação seguinte cai em qualquer ponto da tela (sacadas grandes). Com
   * `[40, 120]`, o olhar anda de um botão para o vizinho (1–3°).
   */
  amplitudeDoSaltoPx?: readonly [number, number];
  /**
   * Pálpebra baixa: ao entrar numa fixação abaixo de `abaixoDeYPx` (vindo de
   * cima), as amostras dos primeiros `congelamentoMs` saem com `congelado` —
   * o engine reemite a última posição enquanto o detector de piscada segura
   * (400 ms antes do M27, ~150 ms com ele).
   */
  palpebraBaixa?: { abaixoDeYPx: number; congelamentoMs: number };
  /**
   * O termo do L2CS: um ruído próprio que muda a cada inferência
   * (`periodoMs`), em degraus (antes do M29) ou em rampa até o valor novo.
   */
  l2cs?: { periodoMs: number; sigmaPx: number; rampa: boolean };
}

export interface AmostraDoCenario {
  /** Quando a estimativa chega ao app (ms). */
  tMs: number;
  /**
   * Começo do quadro da thread principal em que ela foi processada: o
   * `document.timeline.currentTime` que o Blink usa como início da transição
   * escrita no fim desse quadro (ver `simuladorDoCursor.ts`).
   */
  inicioDoQuadroMs: number;
  x: number;
  y: number;
  /** Onde o olho está de fato. */
  verdadeX: number;
  verdadeY: number;
  /** Índice da fixação em curso. */
  fixacao: number;
  /** Tempo desde o início da fixação em curso (ms), no quadro de câmera. */
  desdeASacadaMs: number;
  /** O engine reemite a última posição (pálpebra baixa tratada como piscada). */
  congelado?: boolean;
}

export const CENARIO_DO_VIDEO: OpcoesDoCenario = {
  semente: 1,
  fixacoes: 40,
  duracaoDaFixacaoMs: [400, 1500],
  sigmaPx: 30,
  rho: 0.8,
  hzDaCamera: 30,
  processamento: { minimoMs: 22, caudaMediaMs: 6 },
  fracaoPerdida: 0.05,
  larguraPx: 1920,
  alturaPx: 1080,
  margemPx: 120,
};

/** Normal padrão por Box–Muller. */
function normal(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export function gerarCenarioDoCursor(o: OpcoesDoCenario): AmostraDoCenario[] {
  const r = mulberry32(o.semente);
  const periodo = 1000 / o.hzDaCamera;
  // Inovação do AR(1) com a variância estacionária pedida.
  const inovacao = o.sigmaPx * Math.sqrt(1 - o.rho * o.rho);
  let ruidoX = normal(r) * o.sigmaPx;
  let ruidoY = normal(r) * o.sigmaPx;

  const amostras: AmostraDoCenario[] = [];
  let tCamera = 0;
  let livreEm = 0; // quando a thread principal termina o quadro em curso
  let vx = o.larguraPx / 2;
  let vy = o.alturaPx / 2;
  // L2CS: valor da inferência anterior e da atual, e quando a atual chegou.
  let l2csAnterior = { x: 0, y: 0 };
  let l2csAtual = { x: 0, y: 0 };
  let l2csDesde = -Infinity;
  const termoDoL2cs = (t: number): { x: number; y: number } => {
    const l = o.l2cs;
    if (!l) return { x: 0, y: 0 };
    while (t >= l2csDesde + l.periodoMs) {
      l2csDesde = l2csDesde === -Infinity ? t : l2csDesde + l.periodoMs;
      l2csAnterior = l2csAtual;
      l2csAtual = { x: normal(r) * l.sigmaPx, y: normal(r) * l.sigmaPx };
    }
    if (!l.rampa) return l2csAtual;
    const u = Math.min(1, (t - l2csDesde) / l.periodoMs);
    return { x: l2csAnterior.x + (l2csAtual.x - l2csAnterior.x) * u, y: l2csAnterior.y + (l2csAtual.y - l2csAnterior.y) * u };
  };
  let yAnterior = vy;
  for (let f = 0; f < o.fixacoes; f++) {
    if (o.amplitudeDoSaltoPx) {
      // Salto curto numa direção sorteada; se sair da área útil, vai ao contrário.
      const amp = o.amplitudeDoSaltoPx[0] + r() * (o.amplitudeDoSaltoPx[1] - o.amplitudeDoSaltoPx[0]);
      const ang = 2 * Math.PI * r();
      let nx = vx + amp * Math.cos(ang);
      let ny = vy + amp * Math.sin(ang);
      if (nx < o.margemPx || nx > o.larguraPx - o.margemPx) nx = vx - amp * Math.cos(ang);
      if (ny < o.margemPx || ny > o.alturaPx - o.margemPx) ny = vy - amp * Math.sin(ang);
      vx = nx;
      vy = ny;
    } else {
      vx = o.margemPx + r() * (o.larguraPx - 2 * o.margemPx);
      vy = o.margemPx + r() * (o.alturaPx - 2 * o.margemPx);
    }
    const dur = o.duracaoDaFixacaoMs[0] + r() * (o.duracaoDaFixacaoMs[1] - o.duracaoDaFixacaoMs[0]);
    const inicio = tCamera;
    const desceu = o.palpebraBaixa !== undefined && vy > o.palpebraBaixa.abaixoDeYPx && yAnterior <= o.palpebraBaixa.abaixoDeYPx;
    yAnterior = vy;
    for (; tCamera < inicio + dur; tCamera += periodo) {
      ruidoX = o.rho * ruidoX + inovacao * normal(r);
      ruidoY = o.rho * ruidoY + inovacao * normal(r);
      const processamento = o.processamento.minimoMs - o.processamento.caudaMediaMs * Math.log(Math.max(r(), 1e-12));
      // Quadro que chega com a thread ocupada é descartado (o engine pega
      // sempre o mais novo); além disso, uma fração perdida por outras tarefas.
      const l2 = termoDoL2cs(tCamera);
      if (tCamera < livreEm || r() < o.fracaoPerdida) continue;
      livreEm = tCamera + processamento;
      const congelado = desceu && tCamera - inicio < o.palpebraBaixa!.congelamentoMs;
      amostras.push({
        ...(congelado ? { congelado: true } : {}),
        tMs: tCamera + processamento,
        inicioDoQuadroMs: tCamera,
        x: vx + ruidoX + l2.x,
        y: vy + ruidoY + l2.y,
        verdadeX: vx,
        verdadeY: vy,
        fixacao: f,
        desdeASacadaMs: tCamera - inicio,
      });
    }
  }
  return amostras;
}
