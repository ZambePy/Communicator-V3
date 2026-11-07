/**
 * Cursor pelo compositor por ANIMAÇÃO WEB (M25, `EXPERIMENT.travessiaContinua`).
 *
 * A transição CSS de `transform` não serve quando o estilo é escrito no fim de
 * um quadro ocupado. O Blink dá à transição nova o `document.timeline.
 * currentTime` do quadro, que fica congelado no COMEÇO dele. Medido no
 * Chromium em 06/11/2026 com 30 ms de trabalho na thread: `startTime` igual ao
 * começo do quadro, 30–46 ms antes da escrita. No app, o MediaPipe ocupa 24–41
 * ms antes de cada amostra (gravação de 23/09/2026): a transição alcança o
 * compositor com esse tempo já corrido — o cursor salta e para.
 *
 * `el.animate` com `startTime` explícito não tem esse problema: a animação
 * começa no instante dado, a partir do ponto dado (`deX`, `deY` do
 * `PlanejadorDoCursor`, onde a travessia anterior está agora). Numa gravação
 * a 60 fps de um Chromium com a thread presa 22–40 ms por quadro, os quadros
 * parados no meio de um movimento contínuo caíram de 40 % para 1,6–18 % (média
 * ~10 % em 3 gravações).
 *
 * `fill: 'both'` segura o primeiro quadro-chave antes do início e o último
 * depois do fim, para o cursor nunca mostrar o valor de base no meio do
 * caminho. Quem chama escreve também o destino como valor de base: sem
 * animação (cancelada, ou duração zero), o cursor fica nele.
 *
 * O `prefers-reduced-motion` do index.css zera as TRANSIÇÕES; animação web não
 * é atingida por ele — o mesmo efeito do `!important` que a transição do
 * cursor usava para escapar da regra (ver `escreverNoCursor`). É de propósito:
 * no cursor do olhar o deslocamento é o conteúdo (WCAG 2.3.3), e a exceção
 * está escrita na regra do CLAUDE.md. Não cancelar estas animações por
 * `matchMedia('(prefers-reduced-motion)')`.
 */

const animacoes = new WeakMap<Element, Animation>();

/** O elemento sabe animar (`el.animate`)? No jsdom e em navegador antigo, não. */
export function podeAnimar(el: Element): boolean {
  return typeof (el as Partial<Element>).animate === 'function';
}

/** Cancela a animação de `transform` que este módulo deixou no elemento. */
export function pararAnimacao(el: Element): void {
  animacoes.get(el)?.cancel();
  animacoes.delete(el);
}

/**
 * Anima o `transform` de `de` até `para` em `duracaoMs`, começando em
 * `inicioMs` (no relógio do `performance.now()`, que é o do
 * `document.timeline`). Duração zero só cancela a animação em curso. Devolve
 * `false` sem `el.animate`: quem chama segue pela transição CSS.
 */
export function animarTransform(el: Element, de: string, para: string, duracaoMs: number, inicioMs: number): boolean {
  if (!podeAnimar(el)) return false;
  pararAnimacao(el);
  if (!(duracaoMs > 0)) return true;
  const a = el.animate([{ transform: de }, { transform: para }], { duration: duracaoMs, easing: 'linear', fill: 'both' });
  a.startTime = inicioMs;
  animacoes.set(el, a);
  return true;
}
