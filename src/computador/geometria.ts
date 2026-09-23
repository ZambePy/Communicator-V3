/**
 * Geometria do Modo Computador: onde o olhar cai na tela do sistema.
 *
 * O motor entrega o olhar em pixels CSS da JANELA do app (o que a calibração
 * aprendeu). O Windows quer pixels FÍSICOS da tela virtual, e a janela de
 * sobreposição desenha em pixels CSS do MONITOR em que ela está. São três
 * sistemas de coordenadas, e a conversão errada entre eles não parece bug:
 * parece calibração ruim — um desvio constante que o paciente tenta compensar.
 *
 * Por isso o cálculo fica aqui, puro e testado, e não espalhado no processo
 * principal do Electron. Três regras:
 *
 *   1. A janela do app pode não cobrir o monitor inteiro (em dev é 1280×800).
 *      A origem dos pontos é `getContentBounds()` da janela, não (0,0).
 *   2. A escala do Windows (125 %, 150 %) só entra na conversão para físico,
 *      e só ali. Em DIP tudo é 1:1 com o que o motor calibrou.
 *   3. Nada sai do monitor: ponto fora dos limites é preso à borda. Um
 *      `SetCursorPos` além da tela virtual falha em silêncio, e o clique
 *      seguinte cai onde o cursor parou — que não é onde o paciente olhou.
 */

export interface Ponto {
  x: number;
  y: number;
}

export interface Retangulo {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** O que o processo principal congela ao entrar no modo. */
export interface QuadroDeTela {
  /** `BrowserWindow.getContentBounds()` da janela do app, em DIP de tela. */
  janela: Retangulo;
  /** `Display.bounds` do monitor em que a janela está, em DIP de tela. */
  monitor: Retangulo;
  /** `Display.scaleFactor` desse monitor. */
  escala: number;
}

/** Olhar em px CSS da janela → DIP da tela virtual. */
export function janelaParaTela(p: Ponto, quadro: QuadroDeTela): Ponto {
  return { x: quadro.janela.x + p.x, y: quadro.janela.y + p.y };
}

/** Prende o ponto dentro do retângulo (inclusive nas bordas). */
export function prenderNoRetangulo(p: Ponto, r: Retangulo): Ponto {
  const maxX = r.x + Math.max(0, r.width - 1);
  const maxY = r.y + Math.max(0, r.height - 1);
  return {
    x: Math.min(maxX, Math.max(r.x, p.x)),
    y: Math.min(maxY, Math.max(r.y, p.y)),
  };
}

/**
 * Olhar em px CSS da janela → px CSS da sobreposição (que cobre o monitor).
 * Já preso aos limites do monitor.
 */
export function janelaParaSobreposicao(p: Ponto, quadro: QuadroDeTela): Ponto {
  const tela = prenderNoRetangulo(janelaParaTela(p, quadro), quadro.monitor);
  return { x: tela.x - quadro.monitor.x, y: tela.y - quadro.monitor.y };
}

/**
 * px CSS da sobreposição → px CSS da janela do app. Inversa exata de
 * `janelaParaSobreposicao` fora da faixa em que aquela prende ao monitor —
 * e é só fora dela que o ponto vai virar rótulo da correção por dwell, porque
 * um alvo da barra nunca fica além da borda do monitor. Sem clamp de
 * propósito: prender aqui esconderia um erro de quadro em vez de deixá-lo
 * aparecer no rótulo (que a correção, com seu teto de salto, recusa).
 */
export function sobreposicaoParaJanela(p: Ponto, quadro: QuadroDeTela): Ponto {
  return { x: p.x + quadro.monitor.x - quadro.janela.x, y: p.y + quadro.monitor.y - quadro.janela.y };
}

/** px CSS da sobreposição → DIP da tela virtual, preso ao monitor. */
export function sobreposicaoParaTela(p: Ponto, quadro: QuadroDeTela): Ponto {
  return prenderNoRetangulo(
    { x: quadro.monitor.x + p.x, y: quadro.monitor.y + p.y },
    quadro.monitor,
  );
}

/**
 * DIP da tela → pixels físicos, quando o SO não oferece a conversão.
 *
 * O Electron tem `screen.dipToScreenPoint` no Windows, que respeita escala
 * por monitor; este é o cálculo de reserva para os outros sistemas e para o
 * teste. Vale para o monitor do quadro: a origem física de um monitor
 * secundário com escala diferente não é `bounds × escala` em geral, e é por
 * isso que a conversão nativa tem preferência.
 */
export function telaParaFisicoAproximado(p: Ponto, quadro: QuadroDeTela): Ponto {
  const m = quadro.monitor;
  return {
    x: Math.round(m.x * quadro.escala + (p.x - m.x) * quadro.escala),
    y: Math.round(m.y * quadro.escala + (p.y - m.y) * quadro.escala),
  };
}

// ── clamp da predição na borda ───────────────────────────────────────────────
//
// A predição do Ridge sai em fração de tela e pode passar de [0,1]. Dentro do
// app o clamp é SUAVE: um Hermite cúbico de 2 % (38 px em 1920) que freia o
// cursor antes da borda, porque ali os alvos são grandes e uma parede dura
// faz o cursor "grudar". Sobre o Windows a conta muda: o X da janela, a barra
// de tarefas e a barra do IrisFlow ficam NA borda, e 38 px de freio é o
// cursor "não chegar". O Modo Computador usa o clamp DURO: [0,1] com uma
// margem em pixels configurável (0–4 px), que é o que basta para o cursor
// não cair no monitor vizinho.

export type ModoDeClamp = 'suave' | 'duro';

/** Margem do clamp suave, em fração da tela. */
export const MARGEM_SUAVE = 0.02;
/** Maior margem aceita pelo clamp duro, em px. */
export const MARGEM_DURA_MAX_PX = 4;

/**
 * Hermite cúbico com derivada contínua nas duas junções (C¹): f(0)=0,
 * f(m)=m, f'(m)=1 e o espelho do outro lado. Dentro de [m, 1−m] é identidade.
 */
export function clampSuave(v: number, margem = MARGEM_SUAVE): number {
  if (!Number.isFinite(v)) return 0.5;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  if (v < margem) {
    // t = v/m ∈ [0,1], f(v) = m · t²(2−t): f(0)=0, f(m)=m, f'(0)=0, f'(m)=1.
    const t = v / margem;
    return margem * t * t * (2 - t);
  }
  if (v > 1 - margem) {
    const t = (1 - v) / margem;
    return 1 - margem * t * t * (2 - t);
  }
  return v;
}

/** Clamp em [margem, 1 − margem], com a margem dada em px do eixo. */
export function clampDuro(v: number, margemPx: number, tamanhoPx: number): number {
  if (!Number.isFinite(v)) return 0.5;
  const m = tamanhoPx > 0 && Number.isFinite(margemPx)
    ? Math.min(MARGEM_DURA_MAX_PX, Math.max(0, margemPx)) / tamanhoPx
    : 0;
  return Math.min(1 - m, Math.max(m, v));
}

export function clampNaBorda(
  v: number,
  modo: ModoDeClamp,
  opts: { margemPx?: number; tamanhoPx: number },
): number {
  return modo === 'duro' ? clampDuro(v, opts.margemPx ?? 0, opts.tamanhoPx) : clampSuave(v);
}

/**
 * Diâmetro do cursor do IrisFlow quando ele sai do app e passa a andar sobre
 * o Windows.
 *
 * Dentro do app o cursor é grande (48 px por padrão) porque os alvos são
 * grandes e o cursor não pode sumir sobre um botão colorido. Sobre a área de
 * trabalho ele cobre justamente o que o paciente quer ver — o botão de fechar
 * do Chrome tem 46×30 px — então encolhe para ~60 %, sem descer do piso em que
 * o anel ainda é visível por cima do jitter (24 px, ver `cursorStyle.ts`).
 */
export const CURSOR_SISTEMA_MIN_PX = 24;
export const CURSOR_SISTEMA_MAX_PX = 40;
export const CURSOR_SISTEMA_FATOR = 0.6;

export function tamanhoDoCursorNoSistema(tamanhoNoAppPx: number): number {
  const base = Number.isFinite(tamanhoNoAppPx) ? tamanhoNoAppPx : 48;
  const alvo = Math.round(base * CURSOR_SISTEMA_FATOR);
  return Math.min(CURSOR_SISTEMA_MAX_PX, Math.max(CURSOR_SISTEMA_MIN_PX, alvo));
}

/**
 * Região que a lupa recorta em volta de um ponto, presa ao monitor.
 *
 * `raio` é em DIP. A região é sempre um quadrado de lado `2·raio` deslocado
 * para dentro quando encosta na borda — o paciente vê a borda da tela na
 * lupa em vez de um recorte cortado, e o mapeamento inverso continua linear.
 */
export function regiaoDaLupa(centro: Ponto, raio: number, monitor: Retangulo): Retangulo {
  const lado = Math.max(2, Math.round(2 * raio));
  const largura = Math.min(lado, monitor.width);
  const altura = Math.min(lado, monitor.height);
  const x = Math.min(monitor.x + monitor.width - largura, Math.max(monitor.x, Math.round(centro.x - largura / 2)));
  const y = Math.min(monitor.y + monitor.height - altura, Math.max(monitor.y, Math.round(centro.y - altura / 2)));
  return { x, y, width: largura, height: altura };
}

/**
 * Onde, dentro da região ampliada, um ponto da lupa cai na tela real.
 *
 * `pontoNaLupa` é relativo ao painel da lupa (0..ladoDoPainel); o painel mostra
 * a região inteira, então a conversão é proporcional.
 */
export function lupaParaTela(
  pontoNaLupa: Ponto,
  painel: { width: number; height: number },
  regiao: Retangulo,
): Ponto {
  const fx = painel.width > 0 ? pontoNaLupa.x / painel.width : 0;
  const fy = painel.height > 0 ? pontoNaLupa.y / painel.height : 0;
  return prenderNoRetangulo(
    { x: regiao.x + fx * regiao.width, y: regiao.y + fy * regiao.height },
    regiao,
  );
}

/** O que fazer quando o sistema avisa que as métricas do monitor mudaram. */
export type ReacaoAMudancaDeTela =
  /** Nada relevante para o modo mudou (ex.: barra de tarefas). */
  | 'ignorar'
  /** Só a escala (DPI) mudou: os mesmos pixels físicos, outra contagem em
   *  DIP. O quadro é recalculado e o modo continua. */
  | 'reajustar'
  /** A geometria física mudou (outro monitor, rotação, resolução): a
   *  calibração do olhar não vale mais. Encerrar. */
  | 'encerrar';

/**
 * Mudança de DPI não é mudança de tela.
 *
 * O Windows, ao trocar a escala de 100 % para 125 %, reporta `bounds` E
 * `scaleFactor` alterados — mas o monitor é o mesmo e o olhar do paciente
 * cai nos mesmos pixels FÍSICOS. Encerrar o modo aqui (o comportamento
 * antigo) derrubava a sessão por um evento que não muda nada do que a
 * calibração assume. Só a geometria física — resolução, rotação, monitor
 * removido — invalida o mapa olhar→tela.
 *
 * `mudou` é a lista de métricas que o Electron diz terem mudado; ausente,
 * assume-se o pior e a decisão vem da comparação física.
 */
export function reacaoAMudancaDeTela(
  antes: { monitor: Retangulo; escala: number },
  depois: { monitor: Retangulo; escala: number },
  mudou?: readonly string[] | null,
): ReacaoAMudancaDeTela {
  if (Array.isArray(mudou) && !mudou.some((m) => m === 'bounds' || m === 'scaleFactor' || m === 'rotation')) {
    return 'ignorar';
  }
  if (Array.isArray(mudou) && mudou.includes('rotation')) return 'encerrar';

  const fisico = (r: Retangulo, k: number) => ({ w: Math.round(r.width * k), h: Math.round(r.height * k) });
  const a = fisico(antes.monitor, antes.escala);
  const d = fisico(depois.monitor, depois.escala);
  // Um pixel de folga: o arredondamento em DIP pode não fechar exato.
  const mesmoFisico = Math.abs(a.w - d.w) <= 1 && Math.abs(a.h - d.h) <= 1;
  if (!mesmoFisico) return 'encerrar';
  if (Math.abs(antes.escala - depois.escala) < 1e-9 &&
      antes.monitor.x === depois.monitor.x && antes.monitor.y === depois.monitor.y &&
      antes.monitor.width === depois.monitor.width && antes.monitor.height === depois.monitor.height) {
    return 'ignorar';
  }
  return 'reajustar';
}
