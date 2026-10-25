import {
  INICIO,
  TECLAS_DA_GRADE,
  chaveDoNivel,
  prefixoComum,
  type EstadoDoTeclado,
  type IdDaTecla,
} from './maquinaDoTeclado'
import { montarRoteiro, posicaoDoOlhar, quadroNoTempo, type Ponto, type Pouso } from './roteiroDoOlhar'

/**
 * O motor da abertura da home: o laço de quadros que move o ponto do olhar,
 * enche a fixação das teclas e passa ao React só o que muda a tela (um grupo
 * que abre, uma letra que entra). Chega sob demanda, depois da página
 * (EscritaPeloOlhar.tsx), e nem chega com movimento reduzido.
 *
 * - O laço só roda com a abertura na tela (IntersectionObserver) e a aba à
 *   vista; parado, não gasta nada. Pausar também o para.
 * - Por quadro, só transform e opacity mudam: o ponto, o calor e o traço da
 *   tecla sob o olhar.
 */

export type Modo = 'auto' | 'fim'

export type PecasDaTecla = { el: HTMLElement; calor: HTMLElement; traco: HTMLElement }

/** De onde as letras saem quando um grupo abre (o FLIP termina no layout do React). */
export type Flip = { tipo: 'abrir'; itens: Map<string, DOMRect>; origem: DOMRect } | { tipo: 'fechar' }

type Ref<T> = { current: T }

export type Ligacoes = {
  tela: HTMLElement
  grade: () => HTMLElement | null
  texto: () => HTMLElement | null
  ponto: () => HTMLElement | null
  teclas: () => Partial<Record<IdDaTecla, PecasDaTecla>>
  estado: Ref<EstadoDoTeclado>
  modo: Ref<Modo>
  pausado: Ref<boolean>
  flip: Ref<Flip | null>
  aoMudarEstado: (novo: EstadoDoTeclado, chegada: number) => void
  aoMudarModo: (modo: Modo) => void
  aoAcender: (tecla: IdDaTecla | null) => void
  /** 0 = sem fala; outro número = uma fala nova (a chave reinicia as ondas). */
  aoFalar: (id: number) => void
  aoApagar: (ligado: boolean) => void
}

export type Motor = {
  agendar: () => void
  parar: () => void
  recomecar: () => void
  desligar: () => void
}

const TODAS: IdDaTecla[] = [...TECLAS_DA_GRADE, 'voltar', 'falar']

export function ligarMotor(l: Ligacoes): Motor {
  const roteiro = montarRoteiro()
  const { tela } = l

  let quadro = 0
  let ultimo: number | null = null
  let tempo = 0
  let visivel = typeof IntersectionObserver === 'undefined'
  let aba = document.visibilityState !== 'hidden'
  let geometria: { centros: Record<Pouso, Ponto> } | null = null
  let sobOlhar: IdDaTecla | null = null
  let acesaAgora: IdDaTecla | null = null
  let falaAgora = false
  let apagandoAgora = false
  let idDaFala = 0
  let olho: Ponto | null = null
  let opacidade = 0
  /** Centros de tudo, relativos à tela (onde o ponto é desenhado). */
  const medir = () => {
    const base = tela.getBoundingClientRect()
    const centroDe = (el: Element | null | undefined): Ponto => {
      if (!el) return { x: base.width / 2, y: base.height / 2 }
      const r = el.getBoundingClientRect()
      return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }
    }
    const pecas = l.teclas()
    const centros = {} as Record<Pouso, Ponto>
    for (const id of TODAS) centros[id] = centroDe(pecas[id]?.el)
    centros.repouso = centroDe(l.grade())
    // O olho que confere a frase pousa perto do fim dela, onde fica o cursor.
    const tx = l.texto()?.getBoundingClientRect()
    centros.texto = tx
      ? { x: tx.right - base.left - Math.min(56, tx.width * 0.2), y: tx.top - base.top + tx.height / 2 }
      : centros.repouso
    geometria = { centros }
  }

  const mudarEstado = (novo: EstadoDoTeclado, origem: IdDaTecla | null) => {
    const antes = l.estado.current
    if (chaveDoNivel(antes) === chaveDoNivel(novo) && antes.texto === novo.texto) return
    // O grupo que abre leva as letras dele para as seis teclas: guarda onde
    // cada uma estava antes de a tela mudar.
    if (antes.nivel.tipo === 'grupos' && novo.nivel.tipo !== 'grupos') {
      const id = origem ?? (novo.nivel.tipo === 'grupo' ? TECLAS_DA_GRADE[novo.nivel.grupo] : 'c5')
      const el = l.teclas()[id]?.el
      if (el) {
        const itens = new Map<string, DOMRect>()
        el.querySelectorAll<HTMLElement>('[data-item]').forEach((i) => itens.set(i.dataset.item ?? '', i.getBoundingClientRect()))
        l.flip.current = { tipo: 'abrir', itens, origem: el.getBoundingClientRect() }
      }
    } else if (antes.nivel.tipo !== 'grupos' && novo.nivel.tipo === 'grupos') {
      l.flip.current = { tipo: 'fechar' }
    }
    l.estado.current = novo
    l.aoMudarEstado(novo, prefixoComum(antes.texto, novo.texto))
  }

  const pintarPonto = (p: Ponto, o: number) => {
    const el = l.ponto()
    if (!el) return
    el.style.transform = `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0)`
    el.style.opacity = o.toFixed(3)
  }

  const limparTecla = (id: IdDaTecla) => {
    const t = l.teclas()[id]
    if (!t) return
    delete t.el.dataset.olhar
    t.calor.style.opacity = '0'
    t.traco.style.transform = 'translateX(-50%) scaleX(0)'
  }

  /** A tecla sob o olhar acende o contorno, aquece e o traço sob a letra cresce. */
  const pintarFixacao = (id: IdDaTecla | null, progresso: number) => {
    if (sobOlhar && sobOlhar !== id) limparTecla(sobOlhar)
    sobOlhar = id
    if (!id) return
    const t = l.teclas()[id]
    if (!t) return
    t.el.dataset.olhar = 'sim'
    t.calor.style.opacity = progresso.toFixed(3)
    t.traco.style.transform = `translateX(-50%) scaleX(${progresso.toFixed(3)})`
  }

  const acender = (id: IdDaTecla | null) => {
    if (id === acesaAgora) return
    acesaAgora = id
    l.aoAcender(id)
  }

  const sinalizarFala = (ligada: boolean) => {
    if (ligada === falaAgora) return
    falaAgora = ligada
    if (ligada) idDaFala += 1
    l.aoFalar(ligada ? idDaFala : 0)
  }

  const sinalizarApagar = (ligado: boolean) => {
    if (ligado === apagandoAgora) return
    apagandoAgora = ligado
    l.aoApagar(ligado)
  }

  const mudarModo = (m: Modo) => {
    l.modo.current = m
    l.aoMudarModo(m)
  }

  const deveRodar = () => visivel && aba && l.modo.current === 'auto' && !l.pausado.current

  const agendar = () => {
    if (!quadro && deveRodar()) quadro = window.requestAnimationFrame(tique)
  }

  const parar = () => {
    if (quadro) window.cancelAnimationFrame(quadro)
    quadro = 0
    ultimo = null
  }

  /** Um quadro da abertura sozinha: tudo sai de `quadroNoTempo`. */
  const passoAutomatico = (dt: number): boolean => {
    tempo += dt
    const q = quadroNoTempo(roteiro, tempo)
    if (!geometria) medir()
    mudarEstado(q.estado, q.disparo?.tecla ?? null)
    acender(q.disparo?.tecla ?? null)
    sinalizarFala(q.falou !== null)
    sinalizarApagar(q.apagando !== null)
    pintarFixacao(q.dwell?.tecla ?? null, q.dwell?.progresso ?? 0)
    if (geometria) {
      olho = posicaoDoOlhar(q.olhar, geometria.centros, tempo)
      opacidade = q.olhar.visivel
      pintarPonto(olho, opacidade)
    }
    if (q.fim && q.olhar.visivel <= 0) {
      mudarModo('fim')
      return false
    }
    return true
  }

  function tique(agora: number) {
    quadro = 0
    // Um quadro longo (máquina ocupada) não vira um salto no tempo.
    const dt = ultimo === null ? 16 : Math.min(50, agora - ultimo)
    ultimo = agora
    const segue = l.modo.current === 'auto' ? passoAutomatico(dt) : false
    if (segue) agendar()
    else ultimo = null
  }

  const recomecar = () => {
    parar()
    tempo = 0
    olho = null
    opacidade = 0
    if (sobOlhar) limparTecla(sobOlhar)
    sobOlhar = null
    acender(null)
    sinalizarFala(false)
    sinalizarApagar(false)
    mudarEstado(INICIO, null)
    l.pausado.current = false
    mudarModo('auto')
    agendar()
  }

  let io: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(
      (entradas) => {
        // Vale a última: o navegador pode juntar "saiu" e "voltou" numa
        // chamada só (num redimensionamento, por exemplo), e ler só a
        // primeira deixava o laço parado com a tela à vista.
        visivel = entradas[entradas.length - 1].isIntersecting
        if (visivel) agendar()
        else parar()
      },
      { threshold: 0.2 },
    )
    io.observe(tela)
  }
  const aoMudarAba = () => {
    aba = document.visibilityState !== 'hidden'
    if (aba) agendar()
    else parar()
  }
  document.addEventListener('visibilitychange', aoMudarAba)
  // A tela mudou de tamanho (janela, giro do celular): mede de novo no próximo quadro.
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      geometria = null
    })
    ro.observe(tela)
  }

  const desligar = () => {
    parar()
    io?.disconnect()
    ro?.disconnect()
    document.removeEventListener('visibilitychange', aoMudarAba)
  }

  agendar()
  return { agendar, parar, recomecar, desligar }
}
