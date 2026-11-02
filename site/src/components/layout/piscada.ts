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
  /** A cortina subindo sobre a página antiga. */
  fecharMs: 380,
  /** E saindo por cima, revelando a nova. */
  abrirMs: 560,
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
/* As quatro lâminas e a pupila do símbolo (o desenho oficial, em
   /brand/irisflow-simbolo-negativo.svg), para a marca no meio da cortina. */
const LAMINAS_DA_MARCA = [
  'M 68.496 101.066 L 74.339 103.175 C 82.496 104.511 90.597 104.320 98.199 100.882 C 116.265 92.707 127.636 76.867 128.632 57.425 C 139.214 80.062 132.238 105.023 113.410 120.300 C 95.996 123.722 77.937 116.941 68.496 101.066',
  'M 102.25 91.375 L 104.328 85.519 C 105.613 77.355 105.382 69.253 101.902 61.671 C 93.625 43.652 77.718 32.371 58.273 31.484 C 80.847 20.773 105.847 27.609 121.230 46.351 C 124.753 63.75 118.070 81.843 102.25 91.375',
  'M 59.730 67.773 L 57.535 73.582 C 56.082 81.722 56.148 89.824 59.476 97.476 C 67.386 115.660 83.058 127.261 102.480 128.539 C 79.695 138.792 54.839 131.449 39.839 112.398 C 36.671 94.937 43.718 76.980 59.730 67.773',
  'M 92.550 57.187 L 86.699 55.105 C 78.535 53.800 70.433 54.019 62.847 57.488 C 44.812 65.738 33.507 81.625 32.589 101.066 C 21.914 78.472 28.792 53.488 47.562 38.132 C 64.960 34.640 83.046 41.351 92.550 57.187',
]
const PUPILA_DA_MARCA =
  'M 97.664 72.660 C 102.003 83.851 94.531 96.496 82.675 98.003 C 76.667 98.765 71.347 96.339 67.5 92.742 C 63.277 88.785 61.917 83.308 62.402 77.316 C 63.277 66.402 73.515 58.5 84.246 61.507 C 80.976 65.957 80.710 71.339 84.328 74.328 C 88.226 77.542 93.109 77.660 97.664 72.660'

/**
 * A transição entre páginas (desde 01/11/2026, pedido do dono: uma transição
 * mais profissional que as pálpebras de antes). Uma cortina escura, de bordas
 * curvas, sobe sobre a página antiga; no meio dela o símbolo da IrisFlow se
 * forma; com a cortina fechada a rota troca; então ela continua subindo e sai
 * por cima, revelando a página nova (animations.css, `.palpebras`). O nome da
 * capa ficou `palpebras`, para quem já a conhece no código.
 */
export function piscar(doc: Document = document): Palpebras {
  const capa = doc.createElement('div')
  capa.className = 'palpebras'
  capa.setAttribute('aria-hidden', 'true')

  const cortina = doc.createElementNS(SVG, 'svg')
  cortina.setAttribute('class', 'palpebras__cortina')
  cortina.setAttribute('viewBox', '0 0 100 100')
  cortina.setAttribute('preserveAspectRatio', 'none')
  cortina.setAttribute('focusable', 'false')
  const pano = doc.createElementNS(SVG, 'path')
  // Curva em cima (aparece subindo) e embaixo (aparece saindo).
  pano.setAttribute('d', 'M0 7Q50 0 100 7V93Q50 100 0 93Z')
  cortina.appendChild(pano)
  capa.appendChild(cortina)

  const marca = doc.createElementNS(SVG, 'svg')
  marca.setAttribute('class', 'palpebras__marca')
  marca.setAttribute('viewBox', '24 22 113 116')
  marca.setAttribute('focusable', 'false')
  for (const d of LAMINAS_DA_MARCA) {
    const lamina = doc.createElementNS(SVG, 'path')
    lamina.setAttribute('d', d)
    lamina.setAttribute('class', 'palpebras__lamina')
    marca.appendChild(lamina)
  }
  const pupila = doc.createElementNS(SVG, 'path')
  pupila.setAttribute('d', PUPILA_DA_MARCA)
  pupila.setAttribute('class', 'palpebras__pupila')
  marca.appendChild(pupila)
  capa.appendChild(marca)
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
