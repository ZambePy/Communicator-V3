/**
 * Zonas laterais: alvos que o olhar aciona pela COLUNA, qualquer que seja a
 * altura (modo só horizontal, pedido de 21/10/2026).
 *
 * Na ELA o olhar vertical costuma ir embora antes do horizontal: o paciente
 * ainda olha para a esquerda e para a direita, mas para cima e para baixo não,
 * e o `y` que o rastreador estima deixa de dizer para onde ele olha. Uma zona
 * lateral vale pelo `x` da amostra: as metades da `EscolhaLateral` (Sim/Não, o
 * teclado lateral, a pergunta do cuidador) e a faixa da Emergência na borda
 * direita.
 *
 * Quem consulta é o despachante do dwell (`GazeContext`). Sem zona registrada
 * ele não chama nada daqui e faz exatamente o que fazia antes.
 *
 * Uma zona só vale À VISTA naquela coluna: o elemento do topo, na altura do
 * meio dela, é ela (ou está dentro dela). Uma sobreposição por cima (a pergunta
 * do cuidador sobre o teclado lateral, o reajuste rápido) esconde as de baixo.
 * Por isso as zonas mantêm `pointer-events` mesmo sem dwell: um botão
 * `data-no-dwell` do CSS comum some para o `elementFromPoint`.
 */

/**
 * `escolha`: uma metade de `EscolhaLateral` — a tela é uma tela lateral, e no
 * modo só horizontal o resto dela não é acionado pelo olhar. `faixa`: a faixa
 * da Emergência, que aparece em toda tela e não muda o resto dela.
 */
export type TipoDeZonaLateral = 'escolha' | 'faixa';

const zonas = new Map<HTMLElement, TipoDeZonaLateral>();

/** Registra `el` como zona lateral enquanto ele estiver na tela. Devolve o desregistro. */
export function registrarZonaLateral(el: HTMLElement, tipo: TipoDeZonaLateral = 'escolha'): () => void {
  zonas.set(el, tipo);
  return () => {
    if (zonas.get(el) === tipo) zonas.delete(el);
  };
}

export function haZonasLaterais(): boolean {
  return zonas.size > 0;
}

export function ehZonaLateral(el: unknown): el is HTMLElement {
  return el instanceof HTMLElement && zonas.has(el);
}

const limitar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** A zona está à vista na coluna `x` (nada por cima dela, na altura do meio)? */
function aVistaNaColuna(el: HTMLElement, x: number, r: DOMRect): boolean {
  if (typeof document.elementFromPoint !== 'function') return true;
  const largura = window.innerWidth || r.right;
  const altura = window.innerHeight || r.bottom;
  // Dentro da caixa (a borda direita é de quem vem depois) e dentro da janela:
  // fora dela o `elementFromPoint` não acha nada.
  const xSonda = limitar(limitar(x, r.left + 0.5, r.right - 0.5), 0, Math.max(0, largura - 1));
  const ySonda = limitar(r.top + r.height / 2, 0, Math.max(0, altura - 1));
  const topo = document.elementFromPoint(xSonda, ySonda);
  return topo !== null && el.contains(topo);
}

/**
 * Há uma metade de `EscolhaLateral` À VISTA (a tela em uso é uma tela
 * lateral)? Só montada não basta (revisão de 21/10/2026, Important 3): com um
 * modal comum por cima — o lembrete, o aviso da fala —, as metades cobertas
 * faziam o olhar não acionar mais nada, nem o botão do modal.
 */
function haEscolhaLateralAVista(): boolean {
  for (const [el, tipo] of zonas) {
    if (tipo !== 'escolha' || !el.isConnected) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && aVistaNaColuna(el, r.left + r.width / 2, r)) return true;
  }
  return false;
}

/**
 * A zona lateral à vista na coluna `x`, ou `null`. Com mais de uma, vale a
 * registrada por último (a sobreposição mais nova).
 */
export function zonaLateralNoX(x: number): HTMLElement | null {
  if (zonas.size === 0 || !Number.isFinite(x)) return null;
  let achada: HTMLElement | null = null;
  for (const el of zonas.keys()) {
    if (!el.isConnected) continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    if (x < r.left || x > r.right) continue;
    if (!aVistaNaColuna(el, x, r)) continue;
    achada = el;
  }
  return achada;
}

/** Emergência, o CANCELAR dela e a recuperação: fora do modo horizontal, valem sempre pelo ponto. */
function alvoDeSocorro(el: HTMLElement): boolean {
  return el.dataset.emergency === 'true' || el.dataset.cancelarEmergencia === 'true' || el.dataset.recovery === 'true';
}

/**
 * O alvo do olhar com zonas laterais na tela.
 *
 * - A Emergência sob o ponto vale sempre pelo ponto: nenhuma zona rouba o
 *   socorro.
 * - No modo só horizontal (`soHorizontal`) o `y` não diz para onde o paciente
 *   olha: na coluna de uma zona, vale a zona; fora delas, numa tela lateral
 *   (uma metade de escolha à vista), nada mais é acionado pelo olhar — o
 *   Voltar do cabeçalho, sob um `y` que escorregou, levaria o paciente para
 *   fora sem ele querer. O CANCELAR da contagem e os alvos de recuperação
 *   também só valem como zona (revisão de 21/10/2026, Important 2): o CANCELAR
 *   do meio fica logo abaixo do texto da contagem, e quem só lia cancelava o
 *   próprio socorro. Numa tela comum — só a faixa da Emergência, ou as metades
 *   cobertas por um modal —, o ponto vale como antes.
 * - Fora do modo só horizontal, o que está sob o ponto vale como sempre; sem
 *   nada sob o ponto (o `y` fora da tela), vale a zona da coluna.
 */
export function alvoComZonasLaterais(
  noPonto: HTMLElement | null,
  x: number,
  soHorizontal: boolean,
): HTMLElement | null {
  if (noPonto && (soHorizontal ? noPonto.dataset.emergency === 'true' : alvoDeSocorro(noPonto))) return noPonto;
  if (!soHorizontal && noPonto) return noPonto;
  const zona = zonaLateralNoX(x);
  if (zona) return zona;
  if (soHorizontal && haEscolhaLateralAVista()) return null;
  return noPonto;
}

/** Só para testes. */
export function _limparZonasLaterais(): void {
  zonas.clear();
}
