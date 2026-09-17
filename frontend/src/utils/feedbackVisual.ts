/**
 * Estado do rastreamento como atributo do documento, e confirmação de seleção
 * como classe no alvo. Só DOM — o CSS em `index.css` desenha:
 *
 *  - `html[data-gaze='perdido']`: a interface esmaece um pouco, sem alarme.
 *    Voltar ao normal quando o rosto reaparece é o "brilho" de olhar
 *    detectado — a transição, não um flash.
 *  - `html[data-gaze='degradado']`: leve dessaturação, entre os dois.
 *  - `.gaze-selecionado`: um anel que se expande e some no alvo clicado por
 *    dwell. Curto, porque o olho já está indo para o próximo lugar.
 *
 * Funções idempotentes e sem estado: escrever o mesmo valor duas vezes não
 * dispara nada, e é isso que permite chamá-las a cada quadro do rastreador.
 */

export type EstadoDoOlhar = 'ok' | 'perdido' | 'degradado';

export const DURACAO_DA_CONFIRMACAO_MS = 450;

export function sinalizarEstadoDoOlhar(estado: EstadoDoOlhar): void {
  if (typeof document === 'undefined') return;
  const raiz = document.documentElement;
  if (raiz.dataset.gaze !== estado) raiz.dataset.gaze = estado;
}

export function limparEstadoDoOlhar(): void {
  if (typeof document === 'undefined') return;
  delete document.documentElement.dataset.gaze;
}

export function confirmarSelecao(alvo: HTMLElement): void {
  // Reinicia a animação se o mesmo alvo for escolhido de novo em seguida.
  alvo.classList.remove('gaze-selecionado');
  void alvo.offsetWidth;
  alvo.classList.add('gaze-selecionado');
  window.setTimeout(() => alvo.classList.remove('gaze-selecionado'), DURACAO_DA_CONFIRMACAO_MS);
}
