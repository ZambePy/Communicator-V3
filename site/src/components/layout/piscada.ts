import { routeKey } from '@/routes'

/**
 * A piscada entre páginas (pedido de 20/10/2026): na navegação interna as
 * duas pálpebras fecham sobre a página antiga e abrem sobre a nova — o gesto
 * que o olho faz, e não um esmaecer qualquer.
 *
 * - No clique num link para outra página, duas pálpebras marinho, de borda
 *   curva, descem e sobem até se encontrar (160 ms). Com elas fechadas a rota
 *   troca e a página nova é montada — a espera pelo pedaço da rota fica
 *   escondida aí —; então elas voltam (220 ms), e a fresta entre as duas
 *   bordas curvas é a de um olho abrindo (animations.css, `.palpebras`).
 * - Uma capa no DOM, e não a View Transitions API: na primeira versão, de
 *   20/10/2026, a abertura era uma View Transition, mas as duas capturas de
 *   tela da API deixavam a tela fechada ~0,2 s a mais (medido no Chromium) e
 *   só existiam em parte dos navegadores, que ficavam só com a abertura. A
 *   capa faz o mesmo gesto em todos, e o tempo fechado é só o da montagem.
 * - Nada em âncora (a mesma página), nada com movimento reduzido, nada no
 *   voltar e avançar do navegador (que têm o próprio gesto no celular).
 *
 * Funções puras aqui, para o teste decidir sem navegador.
 */

export const PISCADA = {
  /** A pálpebra fechando sobre a página antiga. */
  fecharMs: 160,
  /** E abrindo sobre a nova. */
  abrirMs: 220,
  /** O máximo que a troca espera a página nova aparecer antes de abrir mesmo assim. */
  esperaMaximaMs: 700,
  /** Folga sobre o tempo de cada animação, quando a página está ocupada. */
  folgaMs: 250,
} as const

/** O link leva a OUTRA página? Âncora e busca na mesma página não piscam. */
export function trocaDePagina(href: string, pathnameAtual: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false
  return routeKey(href) !== routeKey(pathnameAtual)
}

export type Clique = {
  /** O href interno do link (null se não é link interno). */
  href: string | null
  pathnameAtual: string
  botao: number
  comModificador: boolean
  jaTratado: boolean
  /** A pessoa pediu menos movimento. */
  reduzido: boolean
}

/**
 * Este clique vira uma piscada? Só o clique comum (botão principal, sem
 * Ctrl/Cmd/Shift/Alt, que abrem aba ou janela) num link para outra página,
 * e sem o pedido de menos movimento. Os outros seguem direto para o roteador.
 */
export function interceptarParaPiscar(c: Clique): boolean {
  if (c.reduzido || c.jaTratado || c.botao !== 0 || c.comModificador || !c.href) return false
  return trocaDePagina(c.href, c.pathnameAtual)
}

/**
 * A página nova já está na tela? O <main> do Layout traz a rota em
 * `data-rota` e é montado de novo a cada rota; enquanto o pedaço da página
 * carrega, dentro dele fica o esqueleto (`.route-fallback`).
 */
export function paginaNovaPronta(doc: Document, destino: string): boolean {
  const main = doc.querySelector<HTMLElement>('main#conteudo')
  if (!main || routeKey(main.dataset.rota ?? '') !== routeKey(destino)) return false
  return main.childElementCount > 0 && !main.querySelector('.route-fallback')
}

/**
 * Espera a página nova aparecer por baixo das pálpebras fechadas, com teto:
 * se o pedaço da rota demorar, abre assim mesmo (e o esqueleto aparece).
 * Nunca rejeita.
 */
export function aguardarPaginaNova(destino: string, doc: Document = document, limiteMs: number = PISCADA.esperaMaximaMs): Promise<void> {
  return new Promise((resolve) => {
    let feito = false
    let observador: MutationObserver | null = null
    let checagem = 0
    let teto = 0
    const terminar = () => {
      if (feito) return
      feito = true
      observador?.disconnect()
      window.clearInterval(checagem)
      window.clearTimeout(teto)
      resolve()
    }
    if (paginaNovaPronta(doc, destino)) {
      terminar()
      return
    }
    // A mutação do DOM avisa na hora; a checagem a cada quadro cobre o que o
    // observador não vê (um atributo trocado fora da subárvore).
    observador = new MutationObserver(() => {
      if (paginaNovaPronta(doc, destino)) terminar()
    })
    observador.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-rota'] })
    checagem = window.setInterval(() => {
      if (paginaNovaPronta(doc, destino)) terminar()
    }, 16)
    teto = window.setTimeout(terminar, limiteMs)
  })
}

/**
 * Espera dois quadros: a página nova é pintada uma vez por baixo das
 * pálpebras fechadas antes de elas abrirem. A primeira pintura de uma página
 * longa é a mais cara, e não pode comer o começo da abertura. Com teto, para
 * uma aba escondida (que não tem quadros) não prender a piscada.
 */
export function depoisDaPintura(tetoMs = 100): Promise<void> {
  return new Promise((resolve) => {
    let feito = false
    const fim = () => {
      if (feito) return
      feito = true
      resolve()
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(fim))
    window.setTimeout(fim, tetoMs)
  })
}

/**
 * Resolve quando as animações das pálpebras terminam DE VERDADE (a promessa
 * `finished` da Web Animations API), com teto. Com a página ocupada no
 * clique, a animação começa alguns quadros depois de a capa entrar: pelo
 * relógio, a rota trocava com as pálpebras ainda abertas, e a capa saía
 * antes de elas abrirem (visto nas gravações de 20/10/2026, num navegador
 * sem GPU). Sem a API (jsdom), pelo relógio.
 */
export function quandoTerminarem(capa: Element, ms: number, folgaMs: number = PISCADA.folgaMs): Promise<void> {
  return new Promise((resolve) => {
    let feito = false
    const fim = () => {
      if (feito) return
      feito = true
      resolve()
    }
    window.setTimeout(fim, ms + folgaMs)
    // getAnimations calcula o estilo na hora: as animações do CSS já existem.
    const animacoes = typeof capa.getAnimations === 'function' ? capa.getAnimations({ subtree: true }) : []
    if (animacoes.length === 0) {
      window.setTimeout(fim, ms)
      return
    }
    // Cancelada (a capa saiu, ou a animação foi desligada), também acaba.
    void Promise.all(animacoes.map((a) => a.finished)).then(fim, fim)
  })
}

export type Palpebras = {
  /** Resolve quando terminam de fechar. */
  fechadas: Promise<void>
  /** Abre (as duas voltam, a de cima mais) e tira a capa no fim. */
  abrir: () => Promise<void>
  /** Tira a capa na hora. */
  tirar: () => void
}

const SVG = 'http://www.w3.org/2000/svg'

/**
 * As duas pálpebras, numa capa fixa sob o cabeçalho: a de cima com a borda de
 * baixo em arco (mais alta no meio, como a margem da pálpebra sobre o olho), a
 * de baixo com a de cima em arco ao contrário. Fechadas, elas se sobrepõem um
 * pouco abaixo do meio da tela (a de cima anda mais). O CSS anima só
 * `transform` (animations.css): fechar já ao entrar, abrir com `.is-abrindo`;
 * cada fase acaba quando a animação acaba (`quandoTerminarem`).
 */
export function piscar(doc: Document = document): Palpebras {
  const capa = doc.createElement('div')
  capa.className = 'palpebras'
  capa.setAttribute('aria-hidden', 'true')
  const lados: Array<[string, string]> = [
    ['palpebras__cima', 'M0 0H100V66Q50 52 0 66Z'],
    ['palpebras__baixo', 'M0 100H100V50Q50 64 0 50Z'],
  ]
  for (const [classe, d] of lados) {
    const svg = doc.createElementNS(SVG, 'svg')
    svg.setAttribute('class', classe)
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.setAttribute('focusable', 'false')
    const caminho = doc.createElementNS(SVG, 'path')
    caminho.setAttribute('d', d)
    svg.appendChild(caminho)
    capa.appendChild(svg)
  }
  doc.body.appendChild(capa)

  let fora = false
  const tirar = () => {
    fora = true
    capa.remove()
  }
  const fechadas = quandoTerminarem(capa, PISCADA.fecharMs)
  const abrir = async () => {
    if (fora) return
    capa.classList.add('is-abrindo')
    await quandoTerminarem(capa, PISCADA.abrirMs)
    tirar()
  }
  return { fechadas, abrir, tirar }
}
