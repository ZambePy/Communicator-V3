/**
 * Correção contínua do olhar a partir dos dwells concluídos (sprint S3).
 *
 * ## A ideia
 *
 * Quando o dwell dispara num botão, o centro daquele botão é uma estimativa
 * razoável de onde o olhar estava. A diferença entre esse centro e a posição do
 * cursor no instante do disparo é o desvio corrente do sistema. Guardando o
 * desvio como um deslocamento aditivo e atualizando devagar,
 *
 *     offset ← offset + k · (centro − olhar)
 *
 * o sistema persegue a deriva sozinho, o dia inteiro, sem pedir nada a ninguém.
 * É de graça: o rótulo já existe, só ninguém estava usando.
 *
 * ## Por que aqui e não numa recalibração
 *
 * A medição de deriva do projeto registrou o viés vertical INVERTENDO 190 px
 * entre duas rodadas separadas por dez minutos, com a pessoa saindo da cadeira,
 * e diagnosticou o formato certo: a acurácia piorou enquanto a precisão
 * melhorou, que é assinatura de deslocamento puro. Deslocamento puro é
 * exatamente o que uma correção aditiva remove — e recalibrar custa dois
 * minutos de alguém que se comunica pelo olhar.
 *
 * ## As guardas, que são o que separa isto de um estrago
 *
 * A literatura assume que todo dwell concluído acertou o alvo pretendido. Com
 * botão grande e isolado isso é quase sempre verdade; num teclado ocular, não —
 * e aprender de uma tecla errada ensina o erro. Por isso quem chama decide a
 * elegibilidade (`deveAprender`), e o módulo ainda assim se protege:
 *
 *   1. **Salto grande não é deriva**, é o dwell tendo acertado outra coisa.
 *   2. **Resfriamento** depois de cada seleção: o pós-sacada não é amostra.
 *   3. **Teto de norma**: acima dele não é deriva, é calibração quebrada, e a
 *      resposta certa é recalibrar — não escorregar a tela inteira.
 *   4. **Decaimento**: sem seleção nova, o deslocamento volta devagar para
 *      zero. Evidência velha não governa o cursor de hoje.
 *   5. **Reinício** ao recalibrar, ao trocar de perfil e ao mudar o viewport.
 *      O deslocamento pertence à sessão, não à pessoa.
 *
 * Tudo em espaço NORMALIZADO (0..1), como o resto do `mapGaze` antes da
 * conversão final: assim o deslocamento sobrevive a uma mudança de tamanho de
 * janela sem virar outro número.
 *
 * ## Dois estimadores
 *
 * O integrador acima é o pipeline base. Com `EXPERIMENT.correcaoPorDwellKalman`
 * (M15) a mesma instância passa a ser um filtro de Kalman OU em px, com medida
 * em malha aberta na janela estável do dwell, ruído pelo tamanho do botão e
 * pela dispersão, quarentena de desfazer e aplicação em rampa
 * (`kalmanDoDwell.ts`); com `correcaoPorDwellAfim` (M16), também o ganho.
 */

import { EXPERIMENT } from '../config/experiment';
import { amostrasEfetivas } from '../ruidoDaCalibracao';
import {
  ROTULOS_DO_ESPALHAMENTO,
  atualizarKalman,
  correcaoNoPonto,
  criarKalman,
  excitacaoDoGanho,
  injecaoPorPostura,
  medirDeslocamento,
  preverKalman,
  ruidoDoRotulo,
  FATOR_MEDIANA,
  type EstadoDoKalman,
  type MedidaDoRotulo,
} from './kalmanDoDwell';
import type { MedidaDaJanela } from './janelaDoDwell';

export interface Ponto {
  x: number;
  y: number;
}

/**
 * Fração do resíduo incorporada a cada seleção (só no integrador do pipeline
 * base).
 *
 * É o valor que Krowicki et al. (2026) usaram — escolhido sem ajuste, com
 * rastreador infravermelho, e medido no próprio cursor corrigido: o estudo não
 * é evidência a favor de 0,05 (docs/PESQUISA.md §3.5). Como Kalman de regime,
 * equivale a q/r = 0,0026 por rótulo, um deslocamento quase parado. Fica como
 * está no pipeline base; o V3 troca o integrador pelo Kalman (M15).
 */
export const K = 0.05;

/** Resíduo acima disto não é deriva — é o dwell tendo acertado outro alvo. */
export const SALTO_MAX_PX = 180;

/** Depois de uma seleção, o olhar já está indo embora. */
export const RESFRIAMENTO_MS = 300;

/**
 * Teto da norma do deslocamento, em unidades normalizadas.
 *
 * 0,08 são ~154 px numa tela de 1920 e ~86 px numa de 1080 de altura — pouco
 * mais que o dobro do erro médio medido em M1 (74 px). Acima disso não é
 * deriva: é calibração quebrada, mudança de posição grande ou aprendizado de
 * alvo errado, e nenhum dos três se conserta deslizando a tela.
 */
export const TETO_NORMALIZADO = 0.08;

/**
 * Meia-vida do decaimento, em ms.
 *
 * Dez minutos: com seleções a cada poucos segundos o deslocamento se mantém sem
 * esforço, e uma pausa longa o dissolve. É a resposta honesta a "faz meia hora
 * que ninguém usa; este deslocamento ainda vale?" — provavelmente não.
 */
export const MEIA_VIDA_MS = 10 * 60_000;

export interface EstadoDaCorrecao {
  offset: Ponto;
  /** Instante da última seleção aceita. */
  ultimaSelecaoMs: number | null;
  /** Instante do último decaimento aplicado. */
  ultimoDecaimentoMs: number | null;
  /** Seleções incorporadas desde o último reinício. Só diagnóstico. */
  selecoes: number;
  /** Seleções recusadas por salto grande. Sinal de dwell acertando errado. */
  recusasPorSalto: number;
}

export function criarEstado(): EstadoDaCorrecao {
  return {
    offset: { x: 0, y: 0 },
    ultimaSelecaoMs: null,
    ultimoDecaimentoMs: null,
    selecoes: 0,
    recusasPorSalto: 0,
  };
}

/**
 * De onde veio a seleção.
 *
 *  - `app`      um botão do IrisFlow dentro da janela do app;
 *  - `overlay`  um botão da barra da sobreposição do Modo Computador (clique
 *               esquerdo/direito, rolar…): alvo grande, desenhado por nós;
 *  - `externo`  qualquer coisa do sistema — ícone de 32 px, barra do Windows,
 *               botão de outro programa. NUNCA vira rótulo: o dwell concluído
 *               num ícone pequeno não diz que a pessoa olhava o centro dele.
 */
export type OrigemDaSelecao = 'app' | 'overlay' | 'externo';

/**
 * Menor alvo da sobreposição que vale como rótulo, em px (lado menor).
 *
 * 52 é o menor lado que a barra do Modo Computador desenha
 * (`geometriaDaBarra.ts`: o botão vai de 52 a 96 px conforme a altura do
 * monitor — 81 px num Full HD). Era 96 — e com
 * 96 NENHUM alvo da sobreposição passava, o que deixava a correção sem
 * aprender nada no Modo Computador, exatamente onde o cursor mais importa.
 * Um botão de 52 px com um dwell de 1 s é ~30 amostras cuja média está a no
 * máximo ±26 px do centro; como o rótulo entra num integrador de ganho 0,05
 * com teto de 8 % da tela, esse erro por rótulo se dilui. O que continua
 * fora é o que sempre esteve: ícone de 32 px do Windows (`externo`).
 */
export const ALVO_MINIMO_OVERLAY_PX = 52;

/** Condições de sistema sob as quais um dwell concluído vale como rótulo. */
export interface ContextoDaSelecao {
  /** O alvo é grande e sem vizinho acionável (`data-isolado`). */
  alvoIsolado: boolean;
  /** Ausente = `app`. */
  origem?: OrigemDaSelecao;
  /** Lado menor do alvo, em px. Exigido (≥ `ALVO_MINIMO_OVERLAY_PX`) quando `origem = 'overlay'`. */
  tamanhoDoAlvoPx?: number;
  /** O rastreamento está degradado: a posição não vale como rótulo. */
  degradado: boolean;
  /** Modo apresentação: nada do que acontece na tela é uso real. */
  apresentacao: boolean;
  /** Há uma emergência em curso: o pior momento possível para experimentar. */
  emergencia: boolean;
  /** A seleção veio de um alvo de emergência ou de recuperação. */
  alvoEspecial: boolean;
  /**
   * A predição deste quadro estava SATURADA — o `softClamp` a comprimiu contra
   * a borda.
   *
   * Sem esta guarda existe realimentação positiva: com o alvo perto da borda, o
   * clamp aproxima o cursor da borda, o resíduo contra o centro do botão sai
   * inflado, o deslocamento cresce, e o cursor satura mais ainda — até o teto.
   * Um quadro saturado não diz onde a pessoa olhava; diz onde o clamp a pôs.
   */
  saturado?: boolean;
}

/**
 * A seleção pode virar rótulo?
 *
 * Pura e separada de propósito: é a regra que decide quando o sistema aprende
 * sozinho, e ela merece ser lida e testada sem um DOM em volta.
 */
export function deveAprender(ctx: ContextoDaSelecao): boolean {
  if (!origemAceita(ctx.origem ?? 'app', ctx.tamanhoDoAlvoPx)) return false;
  if (!ctx.alvoIsolado) return false;
  if (ctx.degradado) return false;
  if (ctx.apresentacao) return false;
  if (ctx.emergencia) return false;
  if (ctx.alvoEspecial) return false;
  if (ctx.saturado) return false;
  return true;
}

/**
 * Isolamento MEDIDO na tela (M15), além do `data-isolado` declarado.
 *
 * Um rótulo errado (o dwell concluiu no vizinho do que a pessoa olhava) puxa a
 * correção para o vizinho, e o ponto fixo desse puxão é o próprio vizinho
 * (docs/PESQUISA.md §3.5). A correção nunca passa do teto; então, se nenhum
 * outro alvo acionável cai dentro da elipse do teto em torno do centro deste,
 * nenhuma sequência de rótulos daqui consegue arrastar o cursor para dentro de
 * outro alvo. Mede os retângulos do DOM no momento da seleção: o `isolado` da
 * marcação envelhece com o layout; a medida, não.
 */
export function isoladoNaTela(
  centro: Ponto,
  vizinhos: readonly { left: number; top: number; right: number; bottom: number }[],
  viewport: { largura: number; altura: number },
): boolean {
  const tx = TETO_NORMALIZADO * viewport.largura;
  const ty = TETO_NORMALIZADO * viewport.altura;
  if (!(tx > 0) || !(ty > 0)) return false;
  for (const r of vizinhos) {
    if (!(r.right > r.left) || !(r.bottom > r.top)) continue;
    const dx = Math.max(r.left - centro.x, 0, centro.x - r.right);
    const dy = Math.max(r.top - centro.y, 0, centro.y - r.bottom);
    if ((dx / tx) ** 2 + (dy / ty) ** 2 <= 1) return false;
  }
  return true;
}

/**
 * A origem pode virar rótulo? `externo` nunca; `overlay` só com alvo de pelo
 * menos `ALVO_MINIMO_OVERLAY_PX`; `app` sempre (as outras guardas decidem).
 */
export function origemAceita(origem: OrigemDaSelecao, tamanhoDoAlvoPx?: number): boolean {
  if (origem === 'externo') return false;
  if (origem === 'overlay') {
    return typeof tamanhoDoAlvoPx === 'number' && tamanhoDoAlvoPx >= ALVO_MINIMO_OVERLAY_PX;
  }
  return true;
}

function norma(p: Ponto): number {
  return Math.hypot(p.x, p.y);
}

export interface ResultadoDaSelecao {
  estado: EstadoDaCorrecao;
  aceita: boolean;
  motivo: 'aceita' | 'resfriamento' | 'salto' | 'invalida';
}

/**
 * Incorpora uma seleção concluída.
 *
 * `centroDoAlvo` e `olhar` chegam em PIXELS (é o que o DOM tem); `viewport` é o
 * que converte para o espaço normalizado em que o deslocamento vive.
 */
export function registrarSelecao(
  estado: EstadoDaCorrecao,
  entrada: {
    centroDoAlvo: Ponto;
    olhar: Ponto;
    agoraMs: number;
    viewport: { largura: number; altura: number };
  },
): ResultadoDaSelecao {
  const { centroDoAlvo, olhar, agoraMs, viewport } = entrada;

  const finito = (p: Ponto) => Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!finito(centroDoAlvo) || !finito(olhar) || !Number.isFinite(agoraMs)) {
    return { estado, aceita: false, motivo: 'invalida' };
  }
  if (!(viewport.largura > 0) || !(viewport.altura > 0)) {
    return { estado, aceita: false, motivo: 'invalida' };
  }

  if (estado.ultimaSelecaoMs !== null && agoraMs - estado.ultimaSelecaoMs < RESFRIAMENTO_MS) {
    return { estado, aceita: false, motivo: 'resfriamento' };
  }

  const residuoPx = { x: centroDoAlvo.x - olhar.x, y: centroDoAlvo.y - olhar.y };
  if (norma(residuoPx) > SALTO_MAX_PX) {
    return {
      estado: { ...estado, recusasPorSalto: estado.recusasPorSalto + 1 },
      aceita: false,
      motivo: 'salto',
    };
  }

  const residuo = {
    x: residuoPx.x / viewport.largura,
    y: residuoPx.y / viewport.altura,
  };

  let offset = {
    x: estado.offset.x + K * residuo.x,
    y: estado.offset.y + K * residuo.y,
  };

  // Teto pela NORMA, não por eixo: limitar cada eixo em separado deformaria a
  // direção da correção, corrigindo mais em X do que em Y por acidente.
  const n = norma(offset);
  if (n > TETO_NORMALIZADO) {
    const escala = TETO_NORMALIZADO / n;
    offset = { x: offset.x * escala, y: offset.y * escala };
  }

  return {
    estado: {
      ...estado,
      offset,
      ultimaSelecaoMs: agoraMs,
      ultimoDecaimentoMs: agoraMs,
      selecoes: estado.selecoes + 1,
    },
    aceita: true,
    motivo: 'aceita',
  };
}

/**
 * Aplica o decaimento e devolve o deslocamento corrente.
 *
 * Separado de `aplicar` porque o decaimento depende do tempo e a aplicação
 * acontece a 30 Hz: chamar isto uma vez por quadro é o que faz a meia-vida ser
 * de verdade.
 */
export function decair(estado: EstadoDaCorrecao, agoraMs: number): EstadoDaCorrecao {
  if (!Number.isFinite(agoraMs)) return estado;
  if (estado.ultimoDecaimentoMs === null) {
    return { ...estado, ultimoDecaimentoMs: agoraMs };
  }
  const dt = agoraMs - estado.ultimoDecaimentoMs;
  if (dt <= 0) return estado;
  const fator = Math.pow(0.5, dt / MEIA_VIDA_MS);
  return {
    ...estado,
    offset: { x: estado.offset.x * fator, y: estado.offset.y * fator },
    ultimoDecaimentoMs: agoraMs,
  };
}

/** Soma o deslocamento a um ponto normalizado. */
export function aplicar(estado: EstadoDaCorrecao, p: Ponto): Ponto {
  return { x: p.x + estado.offset.x, y: p.y + estado.offset.y };
}

// ── Instância do app ────────────────────────────────────────────────────────
//
// O módulo é puro acima desta linha; abaixo vive a única instância que o
// `mapGaze` consulta. Mantida aqui, e não num contexto do React, porque
// `mapGaze` roda fora da árvore de componentes.

let estadoGlobal = criarEstado();
/** Espelha `EXPERIMENT.correcaoPorDwell`, lido uma vez no import. A medição
 *  troca a flag pela URL e recarrega — não em tempo de execução. */
let ligado = EXPERIMENT.correcaoPorDwell;

/** Kalman do V3 (M15/M16). Só anda com `EXPERIMENT.correcaoPorDwellKalman`. */
function usaKalman(): boolean {
  return EXPERIMENT.correcaoPorDwellKalman;
}

/** O que o `mapGaze` informa a cada quadro e o Kalman precisa. */
export interface ContextoDoQuadro {
  viewport: { largura: number; altura: number };
  /** Pose da cabeça no quadro (rad), para a injeção por mudança de postura. */
  pose?: { yaw: number; pitch: number } | null;
  /** Distância olho–tela em px, idem. */
  distanciaPx?: number;
  /** ρ₁ do ruído medido na calibração, para o N efetivo da janela. */
  rho1?: number | null;
}

/**
 * Quarentena de desfazer: um rótulo espera até a próxima ação que não seja
 * desfazer, ou até este prazo. Se a ação seguinte for desfazer (Voltar,
 * Apagar), o rótulo é descartado — a seleção provavelmente estava errada, e
 * aprender dela é o que trava a correção no vizinho (docs/PESQUISA.md §3.5).
 * Custa quase nada: as constantes de tempo do filtro são de minutos.
 */
export const QUARENTENA_MS = 4000;
/**
 * Recusas χ² seguidas em alvos isolados que fazem a correção pedir o reajuste
 * rápido: sob o modelo, três recusas falsas seguidas têm chance de 0,01³.
 */
export const RECUSAS_PARA_REAJUSTE = 3;
/**
 * Duração da rampa com que uma correção nova entra no cursor. É o resfriamento
 * pós-seleção: o olhar já está saindo do botão e o deslocamento termina de
 * entrar sem salto.
 */
export const RAMPA_MS = RESFRIAMENTO_MS;
/** NIS guardados para a média de consistência (diagnóstico). */
const NIS_GUARDADOS = 20;

interface RotuloPendente {
  tMs: number;
  medida: MedidaDoRotulo;
  viewport: { largura: number; altura: number };
  pose: { yaw: number; pitch: number } | null;
  distanciaPx: number;
}

let kalman: EstadoDoKalman = criarKalman();
let contexto: ContextoDoQuadro | null = null;
let pendente: RotuloPendente | null = null;
let rampa: { inicioMs: number; anterior: EstadoDoKalman } | null = null;
let posturaNoUltimoRotulo: { yaw: number; pitch: number } | null = null;
let posicoesDosRotulos: { x: number; y: number }[] = [];
let aceitasKalman = 0;
let recusas = { chi2: 0, desfeitas: 0, invalidas: 0 };
let recusasSeguidas = 0;
let nisRecentes: number[] = [];

function zerarKalman(): void {
  kalman = criarKalman();
  pendente = null;
  rampa = null;
  posturaNoUltimoRotulo = null;
  posicoesDosRotulos = [];
  aceitasKalman = 0;
  recusas = { chi2: 0, desfeitas: 0, invalidas: 0 };
  recusasSeguidas = 0;
  nisRecentes = [];
}

export function reiniciarCorrecao(): void {
  estadoGlobal = criarEstado();
  zerarKalman();
}

export function definirCorrecaoLigada(v: boolean): void {
  ligado = v;
  if (!v) reiniciarCorrecao();
}

export function correcaoLigada(): boolean {
  return ligado;
}

function centroDaTela(v: { largura: number; altura: number }) {
  return { x: v.largura / 2, y: v.altura / 2 };
}

/** Deslocamento do Kalman em unidades normalizadas (para o teto e o vigia). */
function deslocamentoNormalizado(): Ponto | null {
  const v = contexto?.viewport;
  if (!v || !(v.largura > 0) || !(v.altura > 0)) return null;
  return { x: kalman.x.o / v.largura, y: kalman.y.o / v.altura };
}

/**
 * O teto de sempre, agora sobre o deslocamento do Kalman: acima dele não é
 * deriva, e a resposta certa continua sendo recalibrar.
 */
function aplicarTeto(v: { largura: number; altura: number }): void {
  const n = Math.hypot(kalman.x.o / v.largura, kalman.y.o / v.altura);
  if (n > TETO_NORMALIZADO) {
    const f = TETO_NORMALIZADO / n;
    kalman = { ...kalman, x: { ...kalman.x, o: kalman.x.o * f }, y: { ...kalman.y, o: kalman.y.o * f } };
  }
}

/**
 * Limita a correção APLICADA ao teto. `aplicarTeto` segura o deslocamento, mas
 * com o ganho (M16) a correção num ponto é deslocamento + ganho × distância ao
 * centro, e perto da borda passava do teto. É deste limite que o
 * `isoladoNaTela` depende: nenhuma sequência de rótulos pode levar o cursor
 * além da elipse do teto. A saturação é radial e contínua — encolhe o vetor,
 * não liga nem desliga nada.
 */
function limitadaAoTeto(c: Ponto, v: { largura: number; altura: number }): Ponto {
  const n = Math.hypot(c.x / v.largura, c.y / v.altura);
  if (!(n > TETO_NORMALIZADO)) return c;
  const f = TETO_NORMALIZADO / n;
  return { x: c.x * f, y: c.y * f };
}

/** Estado corrente, para diagnóstico e testes. Cópia rasa: não mute. */
export function estadoDaCorrecao(): Readonly<EstadoDaCorrecao> {
  if (!usaKalman()) return estadoGlobal;
  // A mesma forma do integrador, para o vigia de recalibração e a checagem
  // rápida lerem os dois do mesmo jeito.
  return {
    offset: deslocamentoNormalizado() ?? { x: 0, y: 0 },
    ultimaSelecaoMs: kalman.ultimoMs,
    ultimoDecaimentoMs: kalman.ultimoMs,
    selecoes: aceitasKalman,
    recusasPorSalto: 0,
  };
}

/**
 * Quanto do teto o deslocamento já consumiu, de 0 a 1. Lê a translação, e não
 * o ganho (M16): o ganho depende de onde o olhar está e é limitado à parte.
 *
 * É o termômetro da deriva (macete B2): enquanto a correção dá conta, ninguém
 * precisa recalibrar; quando ela encosta no teto, o que mudou não é deriva —
 * é a cadeira, a luz ou a distância. `null` com a correção desligada ou sem
 * nenhuma seleção aprendida, porque aí o número não significa nada.
 */
export function fracaoDoTetoDaCorrecao(): number | null {
  if (!ligado) return null;
  const e = estadoDaCorrecao();
  if (e.selecoes === 0) return null;
  return Math.min(1, norma(e.offset) / TETO_NORMALIZADO);
}

/** Diagnóstico da correção, só para o cuidador (painel de diagnóstico). */
export interface DiagnosticoDaCorrecao {
  modo: 'integrador' | 'kalman';
  /** Deslocamento em uso, em px, e o desvio dele (só no Kalman). */
  deslocamentoPx: { x: number; y: number } | null;
  desvioPx: { x: number; y: number } | null;
  /** Desvio de ganho aprendido (M16), por eixo. */
  ganho: { x: number; y: number } | null;
  selecoes: number;
  recusas: { chi2: number; desfeitas: number; invalidas: number };
  /** Três recusas χ² seguidas: o desvio não é deriva lenta, peça o reajuste rápido. */
  pedeReajuste: boolean;
  /** Média de NIS/2 nos últimos rótulos (≈ 1 quando o modelo está certo). */
  nisMedio: number | null;
  /** Um rótulo esperando a quarentena de desfazer. */
  rotuloEmQuarentena: boolean;
}

export function diagnosticoDaCorrecao(): DiagnosticoDaCorrecao {
  if (!usaKalman()) {
    const v = contexto?.viewport;
    return {
      modo: 'integrador',
      deslocamentoPx: v ? { x: estadoGlobal.offset.x * v.largura, y: estadoGlobal.offset.y * v.altura } : null,
      desvioPx: null,
      ganho: null,
      selecoes: estadoGlobal.selecoes,
      recusas: { chi2: 0, desfeitas: 0, invalidas: estadoGlobal.recusasPorSalto },
      pedeReajuste: false,
      nisMedio: null,
      rotuloEmQuarentena: false,
    };
  }
  return {
    modo: 'kalman',
    deslocamentoPx: { x: kalman.x.o, y: kalman.y.o },
    desvioPx: { x: Math.sqrt(kalman.x.poo), y: Math.sqrt(kalman.y.poo) },
    ganho: EXPERIMENT.correcaoPorDwellAfim ? { x: kalman.x.g, y: kalman.y.g } : null,
    selecoes: aceitasKalman,
    recusas: { ...recusas },
    pedeReajuste: recusasSeguidas >= RECUSAS_PARA_REAJUSTE,
    nisMedio: nisRecentes.length > 0
      ? nisRecentes.reduce((a, b) => a + b, 0) / nisRecentes.length / 2
      : null,
    rotuloEmQuarentena: pendente !== null,
  };
}

/**
 * Sessão do Modo Computador em curso.
 *
 * Com ela ativa, só a SOBREPOSIÇÃO alimenta a correção, e só com alvo grande:
 * o dwell do app está suspenso, mas uma seleção que chegasse por outro caminho
 * (clique externo relatado pelo processo principal, ícone do Windows) não pode
 * ensinar o modelo.
 */
let sessaoDoComputadorAtiva = false;

export function definirSessaoDoComputador(ativa: boolean): void {
  sessaoDoComputadorAtiva = ativa;
}

export function sessaoDoComputador(): boolean {
  return sessaoDoComputadorAtiva;
}

/**
 * Correção de deriva pelo CENTRO — o reajuste rápido de 2 s.
 *
 * Com a pessoa olhando o centro da tela, a diferença entre o centro e a
 * mediana da predição (ANTES desta correção) é o viés corrente do sistema,
 * medido de uma vez e com ~60 quadros — muito mais evidência que uma seleção.
 * No integrador, SUBSTITUI o deslocamento em vez de somar uma fração dele: é a
 * "drift correction" dos rastreadores de laboratório. No Kalman é uma medida
 * direta do deslocamento com R = (π/2)·s²/N_eff, que dá ganho perto de 1 e
 * deixa a variância coerente para os rótulos seguintes. As referências
 * geométricas da calibração NÃO mudam: a compensação de pose e distância
 * continua medindo contra elas, que é o que a física pede (ver
 * `referenciaLenta` em `config/experiment.ts`).
 *
 * Acima do teto não aplica nada e devolve `false`: um viés desse tamanho não é
 * deriva — é calibração quebrada ou posição muito diferente, e a resposta
 * certa é calibrar de novo, não escorregar a tela inteira.
 */
export function corrigirDerivaPeloCentro(
  residuo: Ponto,
  agoraMs: number,
  /** Kalman: quadros válidos e dispersão robusta da predição, em fração da tela. */
  medida?: { amostras: number; dispersao: Ponto } | null,
): boolean {
  if (!ligado) return false;
  if (!Number.isFinite(residuo.x) || !Number.isFinite(residuo.y) || !Number.isFinite(agoraMs)) return false;
  if (norma(residuo) > TETO_NORMALIZADO) return false;
  if (usaKalman()) {
    const v = contexto?.viewport;
    if (!v || !medida || !(medida.amostras > 0)) return false;
    const nEff = Math.max(1, amostrasEfetivas(medida.amostras, contexto?.rho1 ?? 0.8));
    const r = {
      x: Math.max(1, FATOR_MEDIANA * (medida.dispersao.x * v.largura) ** 2 / nEff),
      y: Math.max(1, FATOR_MEDIANA * (medida.dispersao.y * v.altura) ** 2 / nEff),
    };
    const anterior = preverKalman(kalman, agoraMs);
    kalman = medirDeslocamento(anterior, { x: residuo.x * v.largura, y: residuo.y * v.altura }, r);
    aplicarTeto(v);
    rampa = { inicioMs: agoraMs, anterior };
    aceitasKalman++;
    recusasSeguidas = 0;
    // O reajuste é a nova postura de referência para a injeção.
    posturaNoUltimoRotulo = contexto?.pose ? { ...contexto.pose } : null;
    return true;
  }
  estadoGlobal = {
    ...estadoGlobal,
    offset: { x: residuo.x, y: residuo.y },
    ultimaSelecaoMs: agoraMs,
    ultimoDecaimentoMs: agoraMs,
    selecoes: estadoGlobal.selecoes + 1,
  };
  return true;
}

/** Um ponto da recalibração rápida (M20), em px. */
export interface PontoDaRecalibracao {
  alvo: Ponto;
  /** Mediana da predição sem esta correção enquanto a pessoa olhava o alvo. */
  mediana: Ponto;
  /** Desvio robusto da predição, por eixo. */
  dispersao: Ponto;
  amostras: number;
}

/**
 * Recalibração rápida afim (M20): poucos pontos olhados de propósito (Tobii
 * Dynavox oferece 1, 2, 5 ou 9, e "melhorar ponto"), sem retreinar o Ridge.
 * Cada ponto é uma medida do Kalman com H = [1, x − centro] — deslocamento e,
 * com o afim (M16), ganho — e R pela dispersão da própria coleta. Os pontos
 * cobrem a tela, então o ganho pode andar por inteiro. Só existe com o Kalman;
 * acima do teto, calibrar de novo.
 */
export function corrigirPorPontos(
  pontos: readonly PontoDaRecalibracao[],
  agoraMs: number,
  viewport: { largura: number; altura: number },
): boolean {
  if (!ligado || !usaKalman() || !Number.isFinite(agoraMs)) return false;
  if (!(viewport.largura > 0) || !(viewport.altura > 0)) return false;
  const validos = pontos.filter((p) =>
    [p.alvo.x, p.alvo.y, p.mediana.x, p.mediana.y, p.dispersao.x, p.dispersao.y].every(Number.isFinite)
    && p.amostras > 0);
  if (validos.length === 0) return false;
  const medio = {
    x: validos.reduce((s, p) => s + (p.alvo.x - p.mediana.x), 0) / validos.length / viewport.largura,
    y: validos.reduce((s, p) => s + (p.alvo.y - p.mediana.y), 0) / validos.length / viewport.altura,
  };
  if (norma(medio) > TETO_NORMALIZADO) return false;
  const afim = EXPERIMENT.correcaoPorDwellAfim;
  const anterior = preverKalman(kalman, agoraMs);
  let e = anterior;
  for (const p of validos) {
    const nEff = Math.max(1, amostrasEfetivas(p.amostras, contexto?.rho1 ?? 0.8));
    const r = {
      x: Math.max(1, FATOR_MEDIANA * p.dispersao.x ** 2 / nEff),
      y: Math.max(1, FATOR_MEDIANA * p.dispersao.y ** 2 / nEff),
    };
    e = atualizarKalman(e, { centro: p.alvo, mediana: p.mediana, r }, {
      centroDaTela: centroDaTela(viewport), afim, excitacao: { x: 1, y: 1 }, deliberada: true,
    }).estado;
  }
  kalman = e;
  aplicarTeto(viewport);
  rampa = { inicioMs: agoraMs, anterior };
  aceitasKalman++;
  recusasSeguidas = 0;
  posturaNoUltimoRotulo = contexto?.pose ? { ...contexto.pose } : null;
  posicoesDosRotulos = validos.map((p) => ({ ...p.mediana })).slice(-ROTULOS_DO_ESPALHAMENTO);
  return true;
}

/** Incorpora o rótulo em quarentena ao Kalman. */
function consolidarPendente(agoraMs: number): void {
  const p = pendente;
  pendente = null;
  if (!p) return;
  const anterior = preverKalman(kalman, Math.max(agoraMs, p.tMs));
  const delta = posturaNoUltimoRotulo && p.pose
    ? { yaw: p.pose.yaw - posturaNoUltimoRotulo.yaw, pitch: p.pose.pitch - posturaNoUltimoRotulo.pitch }
    : { yaw: 0, pitch: 0 };
  const posicoes = [...posicoesDosRotulos, { x: p.medida.mediana.x, y: p.medida.mediana.y }];
  const afim = EXPERIMENT.correcaoPorDwellAfim;
  const r = atualizarKalman(anterior, p.medida, {
    centroDaTela: centroDaTela(p.viewport),
    afim,
    excitacao: afim
      ? {
          x: excitacaoDoGanho(posicoes.map((q) => q.x), p.viewport.largura),
          y: excitacaoDoGanho(posicoes.map((q) => q.y), p.viewport.altura),
        }
      : undefined,
    injecao: injecaoPorPostura(delta, p.distanciaPx),
  });
  kalman = r.estado;
  if (r.nis !== null && r.aceita) {
    nisRecentes = [...nisRecentes, r.nis].slice(-NIS_GUARDADOS);
  }
  if (!r.aceita) {
    if (r.motivo === 'chi2') {
      recusas.chi2++;
      recusasSeguidas++;
    } else {
      recusas.invalidas++;
    }
    return;
  }
  aplicarTeto(p.viewport);
  rampa = { inicioMs: agoraMs, anterior };
  aceitasKalman++;
  recusasSeguidas = 0;
  posturaNoUltimoRotulo = p.pose ? { ...p.pose } : posturaNoUltimoRotulo;
  posicoesDosRotulos = posicoes.slice(-ROTULOS_DO_ESPALHAMENTO);
}

/**
 * Ação do usuário concluída (dwell ou piscada). Desfazer descarta o rótulo em
 * quarentena; qualquer outra ação o consolida. No integrador não faz nada.
 */
export function registrarAcaoDoUsuario(acao: { desfazer: boolean; agoraMs: number }): void {
  if (!ligado || !usaKalman() || !pendente) return;
  if (acao.desfazer) {
    pendente = null;
    recusas.desfeitas++;
    return;
  }
  consolidarPendente(acao.agoraMs);
}

/** Chamado pelo dispatcher quando um dwell elegível conclui. */
export function aprenderComSelecao(entrada: {
  centroDoAlvo: Ponto;
  olhar: Ponto;
  agoraMs: number;
  viewport: { largura: number; altura: number };
  /** Ausente = `app`. */
  origem?: OrigemDaSelecao;
  tamanhoDoAlvoPx?: number;
  /**
   * Kalman (M15): a janela estável do dwell em malha aberta, em px, e o lado
   * do alvo. Sem elas, o Kalman não aprende — o `olhar` do cursor já carrega a
   * correção, o filtro e o clamp.
   */
  medida?: MedidaDaJanela | null;
  ladoDoAlvoPx?: { largura: number; altura: number };
}): boolean {
  if (!ligado) return false;
  const origem = entrada.origem ?? 'app';
  if (!origemAceita(origem, entrada.tamanhoDoAlvoPx)) return false;
  // No Modo Computador só a sobreposição ensina: a janela do app está oculta
  // e qualquer seleção "do app" ali é acidente. O caminho existe de verdade
  // desde 22/09: `Overlay.tsx` manda `selecao` ao main, que a devolve à
  // janela do app em coordenadas dela, e `useModoComputador` chama aqui.
  if (sessaoDoComputadorAtiva && origem !== 'overlay') return false;
  if (!usaKalman()) {
    const r = registrarSelecao(estadoGlobal, entrada);
    estadoGlobal = r.estado;
    return r.aceita;
  }
  const { medida, ladoDoAlvoPx: lado } = entrada;
  if (!medida || medida.saturada || !lado || !(lado.largura > 0) || !(lado.altura > 0)) {
    recusas.invalidas++;
    return false;
  }
  // A ação que trouxe este rótulo encerra a quarentena do anterior.
  if (pendente) consolidarPendente(entrada.agoraMs);
  const nEff = amostrasEfetivas(medida.n, contexto?.rho1 ?? 0.8);
  pendente = {
    tMs: entrada.agoraMs,
    medida: {
      centro: { ...entrada.centroDoAlvo },
      mediana: { ...medida.mediana },
      r: ruidoDoRotulo(lado, medida.dispersao, nEff),
    },
    viewport: { ...entrada.viewport },
    pose: contexto?.pose ? { ...contexto.pose } : null,
    distanciaPx: contexto?.distanciaPx ?? 0,
  };
  return true;
}

/**
 * Aplica a correção a um ponto normalizado, decaindo primeiro.
 *
 * Chamado uma vez por quadro no `mapGaze`, depois das compensações de
 * distância e pose e ANTES do `softClamp` — o clamp é quem garante que o
 * resultado final caiba na tela, e corrigir depois dele poderia empurrar o
 * ponto para fora de novo. No Kalman, também consolida o rótulo cuja
 * quarentena venceu e mistura a correção nova com a anterior durante a rampa.
 */
export function corrigirPorDwell(p: Ponto, agoraMs: number, ctx?: ContextoDoQuadro): Ponto {
  if (!ligado) return p;
  if (!usaKalman()) {
    estadoGlobal = decair(estadoGlobal, agoraMs);
    return aplicar(estadoGlobal, p);
  }
  if (ctx) contexto = ctx;
  const v = contexto?.viewport;
  if (!v || !(v.largura > 0) || !(v.altura > 0) || !Number.isFinite(agoraMs)) return p;
  if (pendente && agoraMs - pendente.tMs >= QUARENTENA_MS) consolidarPendente(agoraMs);
  kalman = preverKalman(kalman, agoraMs);
  const centro = centroDaTela(v);
  const ponto = { x: p.x * v.largura, y: p.y * v.altura };
  let c = correcaoNoPonto(kalman, ponto, centro);
  if (rampa) {
    const t = (agoraMs - rampa.inicioMs) / RAMPA_MS;
    if (t >= 1) {
      rampa = null;
    } else {
      const a = correcaoNoPonto(rampa.anterior, ponto, centro);
      const f = Math.max(0, t);
      c = { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f };
    }
  }
  c = limitadaAoTeto(c, v);
  return { x: p.x + c.x / v.largura, y: p.y + c.y / v.altura };
}
