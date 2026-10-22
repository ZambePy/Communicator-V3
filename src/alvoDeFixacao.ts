/**
 * O alvo de fixação — o MESMO na calibração e no teste de precisão (pedido de
 * 19/10/2026), para os dois medirem a mesma coisa. Antes a calibração usava
 * uma bola azul de 36 px que pulsava e ficava verde, e o teste um círculo azul
 * claro com cruz e anel pulsante: duas fixações diferentes, comparadas como se
 * fossem uma.
 *
 * ## O desenho: o alvo "ABC"
 *
 * Thaler, L., Schütz, A. C., Goodale, M. A., & Gegenfurtner, K. R. (2013).
 * What is the best fixation target? The effect of target shape on stability of
 * fixational eye movements. Vision Research, 76, 31–42.
 *
 * Entre sete formas fixadas por 17 s, só a combinação de bull's eye com cruz
 * deu ao mesmo tempo dispersão e taxa de microssacadas baixas. É um disco de
 * 0,6°, uma cruz de 0,2° de largura no contraste oposto atravessando o disco e
 * um ponto central de 0,2°. Aqui nas mesmas proporções (3 : 1 : 1), com as
 * cores da marca: disco azul #1B54A8 sobre o fundo #091B33, a cruz recortada
 * na cor do fundo e o ponto central vermelho — o lugar exato para onde olhar,
 * na cor que o painel do teste já usa para "alvo". O diâmetro de fixação é o
 * da bola antiga (36 px ≈ 0,9° na bancada de referência), maior que os 0,6° do
 * artigo porque quem olha aqui pode ter a acuidade de quem tem ELA e está a
 * 60 cm de uma webcam, não num queixeiro de laboratório.
 *
 * ## A chegada: o alvo se contrai
 *
 * O alvo chega 1,5× maior e se contrai até o tamanho de fixação em 560 ms. É a
 * prática dos calibradores comerciais para puxar o olho ao centro do alvo;
 * Thaler et al. NÃO estudam isso (o artigo não mede latência de sacada nem
 * alvo animado). O que garante que a contração não contamine a medida é o
 * tempo: ela cabe inteira na janela de acomodação, que é descartada — 800 ms
 * contados da chegada na calibração (M8) e 600 ms no teste. Durante a coleta
 * útil o alvo fica PARADO, a condição em que o ABC foi medido.
 *
 * ## A confirmação
 *
 * Fechado o ponto, o disco passa de azul a verde numa transição de cor, sem
 * mudar de tamanho. Antes o pulso de escala (0,90 ↔ 1,14) seguia até o fim da
 * coleta e a confirmação parecia um tranco.
 *
 * Com `prefers-reduced-motion`, nem a contração nem as transições acontecem:
 * o alvo tem um tamanho só.
 */

import { EXPERIMENT } from './config/experiment';

/** Diâmetro do disco, no tamanho de fixação, em px. */
export const DIAMETRO_DO_ALVO_PX = 36;

/** Largura da cruz e diâmetro do ponto central, em fração do diâmetro (0,2° de 0,6°). */
export const PROPORCAO_DO_CENTRO = 1 / 3;

/** Quanto o alvo chega maior, antes de se contrair. */
export const ESCALA_DE_CHEGADA = 1.5;

/**
 * Duração da contração, em ms. Menor que a menor acomodação descartada (600 ms
 * no teste de precisão; 800 ms na calibração com M8) — ver o cabeçalho.
 */
export const CONTRACAO_MS = 560;

export const COR_DO_ALVO = '#1B54A8';
export const COR_DO_FUNDO = '#091B33';
export const COR_DO_CENTRO = '#EF4444';
export const COR_DE_CONFIRMACAO = '#22C55E';

/** Classe do alvo; o estilo está em `frontend/src/index.css` (bloco "Alvo de fixação ABC"). */
export const CLASSE_DO_ALVO = 'alvo-abc';
/** Chegando: 1,5× e a caminho do tamanho de fixação. */
export const CLASSE_CHEGANDO = 'alvo-abc--chegando';
/** Ponto fechado: o disco fica verde. */
export const CLASSE_CONFIRMADO = 'alvo-abc--confirmado';

/**
 * As três camadas do alvo, em HTML. Constante e sem dado nenhum de fora: a
 * calibração (React, `dangerouslySetInnerHTML`) e o teste (DOM puro) usam a
 * MESMA marcação, então não há como os dois alvos divergirem.
 */
export const MARCACAO_DO_ALVO_ABC =
  '<span class="alvo-abc__disco"></span>' +
  '<span class="alvo-abc__cruz"></span>' +
  '<span class="alvo-abc__centro"></span>';

// ── O estímulo de ANTES de 19/10/2026 (flag `estimuloAntigo`) ──────────────
//
// Revisão do pipeline de 19/10/2026: a troca do alvo e do fundo mudou o
// estímulo da calibração E do teste sem flag nenhuma, e o "antes" de uma
// sessão de medição só existia noutro build. Ligada a flag
// (`?exp.estimuloAntigo=1`), os dois voltam a ser os de `pc-atual`: na
// calibração a bola azul lisa de 36 px, que pulsa durante a coleta e fica
// verde ao fechar o ponto, sobre fundo preto; no teste o círculo azul-claro
// de 26 px com cruz, anel pulsante e ponto escuro no centro, sobre fundo preto.
// Desligada (o padrão, pedido pelo dono), nada aqui é usado.

/** O fundo de antes (preto), da calibração e do teste. */
export const COR_DO_FUNDO_ANTIGA = '#000000';
/** A bola antiga da calibração: o azul da marca enquanto mede, verde ao fechar o ponto. */
export const COR_DA_BOLA_ANTIGA = '#1B54A8';
export const COR_DA_BOLA_ANTIGA_CONFIRMADA = '#22C55E';
/** Classe da bola antiga (o estilo, como era, no `<style>` do CalibrationCheck). */
export const CLASSE_DA_BOLA_ANTIGA = 'cf-bola-antiga';
/** O alvo antigo do teste e o fundo antigo do overlay (index.css, bloco "estímulo de antes"). */
export const CLASSE_DO_ALVO_ANTIGO_DO_TESTE = 'accuracy-dot--antigo';
export const CLASSE_DO_FUNDO_ANTIGO_DO_TESTE = 'accuracy-overlay--antigo';
export const MARCACAO_DO_ALVO_ANTIGO_DO_TESTE = '<div class="dot-cross"></div><div class="dot-inner"></div>';

/** A rodada usa o estímulo de antes de 19/10? (lida na hora: a flag vale da carga da página). */
export function usarEstimuloAntigo(): boolean {
  return EXPERIMENT.estimuloAntigo === true;
}

/** O fundo da calibração e do teste em vigor. */
export function corDoFundoDoEstimulo(): string {
  return usarEstimuloAntigo() ? COR_DO_FUNDO_ANTIGA : COR_DO_FUNDO;
}
