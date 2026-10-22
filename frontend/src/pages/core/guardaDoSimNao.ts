/**
 * Guarda da tela Sim · Não com a piscada longa ligada (revisão de UX de
 * 19/10/2026, achado 4).
 *
 * Com a piscada ligada, SIM e NÃO têm dois caminhos ao mesmo tempo: o olhar
 * (dwell de 1,5 s) e a piscada longa (uma = SIM, duas = NÃO). Eles se
 * atropelavam: com o olhar parado no NÃO, o paciente piscava longo para dizer
 * SIM; o olho fechado PAUSA o dwell e guarda o progresso
 * (`src/interaction/dwell.ts`), e ao reabrir o dwell completava "Não"; 2,5 s
 * depois a piscada dizia "Sim". As duas respostas, opostas, eram faladas e
 * iam para o celular do cuidador.
 *
 * As regras, só com a piscada ligada:
 *
 *  1. **Uma resposta trava a outra** por `TRAVA_DA_RESPOSTA_MS`: nenhuma outra
 *     resposta vale — olhar, piscada, mouse, teclado ou acionador —, e o botão
 *     respondido fica em destaque. Um fechamento de olho que começa durante a
 *     trava não conta como piscada nem depois dela.
 *  2. **A piscada longa em curso tira o dwell** dos três botões: do momento em
 *     que o olho fechado chega ao mínimo da piscada longa até a piscada
 *     decidir (resposta, ou desistência), mais `CAUDA_DA_PISCADA_MS`. O dwell
 *     guardado com o olho fechado é descartado (`dwell.ts` zera o progresso
 *     num alvo sem dwell) e não recomeça enquanto a piscada espera a segunda.
 *     A cauda passa da memória de saída do dwell (até 400 ms), senão o
 *     progresso guardado voltaria ao alvo.
 *  3. **O olhar parado não responde sozinho**: o botão em que o olhar ficou
 *     durante a piscada só volta a aceitar o dwell depois de o olhar sair dele
 *     por `SAIDA_PARA_REARMAR_MS` — o mesmo rearme dos cliques pelo olhar
 *     (`rearmePorSaida.ts`). Sem isso, acabada a trava, o olhar ainda parado
 *     no NÃO completava "Não" 1,5 s depois do "Sim" da piscada.
 *
 * O "Chamar atenção" entra em 2 e 3 (um dwell guardado nele chamava o
 * cuidador sem querer ao reabrir os olhos), nunca em 1: chamar atenção não
 * espera trava. Fechar os olhos menos que o mínimo da piscada longa — a
 * piscada espontânea — continua só pausando o dwell, como sempre.
 *
 * Com a piscada desligada nada disto vale e o olhar responde como antes.
 * Módulo puro: sem DOM e sem relógio próprio.
 */
import { SAIDA_PARA_REARMAR_MS } from '@tracker/interaction/rearmePorSaida';
import { limitarPiscadaMin, type EstadoSimNao, type RespostaSimNao } from '@tracker/interaction/simNaoPorPiscada';

export type BotaoDoSimNao = 'sim' | 'nao' | 'chamar';
export const BOTOES_DO_SIM_NAO: readonly BotaoDoSimNao[] = ['sim', 'nao', 'chamar'];

/** Quanto tempo uma resposta trava a outra (e fica em destaque). */
export const TRAVA_DA_RESPOSTA_MS = 3000;
/** Quanto o dwell continua tirado depois de a piscada longa decidir. Acima da memória de saída do dwell (400 ms). */
export const CAUDA_DA_PISCADA_MS = 1000;

export interface GuardaDoSimNao {
  /** Até quando nenhuma outra resposta vale (`-Infinity`: sem trava). */
  travadaAte: number;
  /** A resposta que travou, para o destaque. */
  respostaTravada: RespostaSimNao | null;
  /** Até quando a piscada longa (em curso ou à espera da segunda) tira o dwell. */
  piscadaAte: number;
  /** Botões em que o olhar ficou parado durante a piscada: só voltam depois de o olhar sair. */
  presoAoOlhar: Record<BotaoDoSimNao, boolean>;
  /** Desde quando o olhar está fora de cada botão (`null`: em cima dele, ou nunca visto fora). */
  foraDesde: Record<BotaoDoSimNao, number | null>;
  /** O olho fechou durante a trava: esse fechamento não vira piscada. */
  fechouNaTrava: boolean;
}

export function criarGuarda(): GuardaDoSimNao {
  return {
    travadaAte: -Infinity,
    respostaTravada: null,
    piscadaAte: -Infinity,
    presoAoOlhar: { sim: false, nao: false, chamar: false },
    foraDesde: { sim: null, nao: null, chamar: null },
    fechouNaTrava: false,
  };
}

/** Uma resposta vale agora (fora da trava)? */
export function respostaLiberada(g: GuardaDoSimNao, agoraMs: number): boolean {
  return agoraMs >= g.travadaAte;
}

/** Uma resposta foi aceita: trava a outra. */
export function registrarResposta(g: GuardaDoSimNao, r: RespostaSimNao, agoraMs: number): GuardaDoSimNao {
  return { ...g, travadaAte: agoraMs + TRAVA_DA_RESPOSTA_MS, respostaTravada: r };
}

/**
 * A amostra não deve alimentar a piscada: trava em curso, ou o olho fechou
 * durante ela e ainda não reabriu.
 */
export function piscadaSuspensa(g: GuardaDoSimNao, agoraMs: number): boolean {
  return agoraMs < g.travadaAte || g.fechouNaTrava;
}

/**
 * A piscada longa está em curso? O olho fechado há pelo menos o mínimo da
 * piscada longa, ou uma longa já contada à espera da segunda.
 */
export function piscadaLongaEmCurso(e: EstadoSimNao, agoraMs: number, piscadaMinMs: number): boolean {
  if (e.longas > 0) return true;
  return e.fechadoDesde !== null && agoraMs - e.fechadoDesde >= limitarPiscadaMin(piscadaMinMs);
}

export interface AmostraDaGuarda {
  agoraMs: number;
  /** `true` olho fechado, `false` aberto, `null` sem informação. */
  fechado: boolean | null;
  /** `piscadaLongaEmCurso` do estado da piscada DEPOIS desta amostra. */
  piscadaEmCurso: boolean;
  /**
   * Botão sob o olhar, ou `null` fora dos três. `undefined` quando a posição
   * não diz para onde a pessoa olha (olho fechado, rosto perdido, posição não
   * medida): o rearme não anda com ela.
   */
  sob: BotaoDoSimNao | null | undefined;
}

/** Avança a guarda em uma amostra do olhar. */
export function passoDaGuarda(g: GuardaDoSimNao, a: AmostraDaGuarda): GuardaDoSimNao {
  // Fechamento que começa na trava: marcado até o olho reabrir.
  let fechouNaTrava = g.fechouNaTrava;
  if (a.fechado === false) fechouNaTrava = false;
  else if (a.fechado === true && a.agoraMs < g.travadaAte) fechouNaTrava = true;

  const piscadaAte = a.piscadaEmCurso ? Math.max(g.piscadaAte, a.agoraMs + CAUDA_DA_PISCADA_MS) : g.piscadaAte;
  const piscadaSegura = a.agoraMs < piscadaAte;

  let presoAoOlhar = g.presoAoOlhar;
  let foraDesde = g.foraDesde;
  if (a.sob !== undefined) {
    presoAoOlhar = { ...g.presoAoOlhar };
    foraDesde = { ...g.foraDesde };
    for (const b of BOTOES_DO_SIM_NAO) {
      if (a.sob === b) {
        foraDesde[b] = null;
        // O olhar está neste botão enquanto a piscada segura o dwell: quando
        // ela soltar, ele não pode responder sem antes sair.
        if (piscadaSegura) presoAoOlhar[b] = true;
      } else {
        const desde = foraDesde[b] ?? a.agoraMs;
        foraDesde[b] = desde;
        if (presoAoOlhar[b] && a.agoraMs - desde >= SAIDA_PARA_REARMAR_MS) presoAoOlhar[b] = false;
      }
    }
  }
  return { ...g, piscadaAte, presoAoOlhar, foraDesde, fechouNaTrava };
}

/** O que a tela mostra e marca a partir da guarda. */
export interface VisualDoSimNao {
  /** Botões sem dwell agora (`data-no-dwell`). */
  semDwell: Record<BotaoDoSimNao, boolean>;
  /** A resposta em destaque durante a trava. */
  respondida: RespostaSimNao | null;
  /** Uma piscada longa contada, à espera da segunda. */
  esperandoSegunda: boolean;
}

export const VISUAL_LIVRE: VisualDoSimNao = {
  semDwell: { sim: false, nao: false, chamar: false },
  respondida: null,
  esperandoSegunda: false,
};

/**
 * `marcarDwell`: a tela pode tirar o dwell dos botões. Falso no modo
 * acionador — lá a varredura também pula botão sem dwell, e o olhar parado
 * (que o acionador não usa) tiraria um botão da volta sem prazo para voltar.
 * A trava continua valendo pela resposta (`respostaLiberada`).
 */
export function visualDoSimNao(
  g: GuardaDoSimNao,
  piscada: EstadoSimNao,
  agoraMs: number,
  marcarDwell: boolean,
): VisualDoSimNao {
  const travado = agoraMs < g.travadaAte;
  const piscadaSegura = marcarDwell && agoraMs < g.piscadaAte;
  const preso = (b: BotaoDoSimNao) => marcarDwell && g.presoAoOlhar[b];
  return {
    semDwell: {
      sim: (marcarDwell && travado) || piscadaSegura || preso('sim'),
      nao: (marcarDwell && travado) || piscadaSegura || preso('nao'),
      chamar: piscadaSegura || preso('chamar'),
    },
    respondida: travado ? g.respostaTravada : null,
    esperandoSegunda: piscada.longas > 0,
  };
}

export function mesmoVisual(a: VisualDoSimNao, b: VisualDoSimNao): boolean {
  return a.respondida === b.respondida
    && a.esperandoSegunda === b.esperandoSegunda
    && BOTOES_DO_SIM_NAO.every((k) => a.semDwell[k] === b.semDwell[k]);
}
