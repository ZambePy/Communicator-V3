import {
  INICIO,
  TECLAS_DA_GRADE,
  chaveDoNivel,
  prefixoComum,
  selecionar,
  teclasAtivas,
  type EstadoDoTeclado,
  type IdDaTecla,
} from './maquinaDoTeclado'
import { montarRoteiro, posicaoDoOlhar, quadroNoTempo, tremor, type Ponto, type Pouso } from './roteiroDoOlhar'
import { SEM_PERMANENCIA, avancarPermanencia, seguirOMouse, teclaNoPonto, type Retangulo } from './olharDoMouse'

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

export type Modo = 'auto' | 'pessoa' | 'fim'

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
  assumir: (p: Ponto) => void
  mover: (p: Ponto) => void
  soltar: () => void
  acionar: (tecla: IdDaTecla) => void
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
  let geometria: { centros: Record<Pouso, Ponto>; retangulos: Retangulo[] } | null = null
  let sobOlhar: IdDaTecla | null = null
  let acesaAgora: IdDaTecla | null = null
  let falaAgora = false
  let apagandoAgora = false
  let idDaFala = 0
  const mouse = { dentro: false, ponto: { x: 0, y: 0 } }
  let olho: Ponto | null = null
  let opacidade = 0
  let permanencia = SEM_PERMANENCIA
  const timers = new Set<number>()

  const depois = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
  }

  /** Centros e retângulos de tudo, relativos à tela (onde o ponto é desenhado). */
  const medir = () => {
    const base = tela.getBoundingClientRect()
    const centroDe = (el: Element | null | undefined): Ponto => {
      if (!el) return { x: base.width / 2, y: base.height / 2 }
      const r = el.getBoundingClientRect()
      return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }
    }
    const pecas = l.teclas()
    const centros = {} as Record<Pouso, Ponto>
    const retangulos: Retangulo[] = []
    for (const id of TODAS) {
      const el = pecas[id]?.el
      centros[id] = centroDe(el)
      if (el) {
        const r = el.getBoundingClientRect()
        retangulos.push({ tecla: id, x: r.left - base.left, y: r.top - base.top, largura: r.width, altura: r.height })
      }
    }
    centros.repouso = centroDe(l.grade())
    // O olho que confere a frase pousa perto do fim dela, onde fica o cursor.
    const tx = l.texto()?.getBoundingClientRect()
    centros.texto = tx
      ? { x: tx.right - base.left - Math.min(56, tx.width * 0.2), y: tx.top - base.top + tx.height / 2 }
      : centros.repouso
    geometria = { centros, retangulos }
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

  const deveRodar = () =>
    visivel &&
    aba &&
    ((l.modo.current === 'auto' && !l.pausado.current) || (l.modo.current === 'pessoa' && (mouse.dentro || opacidade > 0)))

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

  /** Um quadro com a pessoa no comando: o ponto segue o mouse e a fixação conta. */
  const passoDaPessoa = (dt: number, agora: number): boolean => {
    if (!geometria) medir()
    if (!geometria) return false
    if (mouse.dentro) {
      olho = olho ? seguirOMouse(olho, mouse.ponto, dt) : { ...mouse.ponto }
      opacidade = Math.min(1, opacidade + dt / 180)
    } else {
      opacidade = Math.max(0, opacidade - dt / 250)
    }
    const ativas = new Set(teclasAtivas(l.estado.current))
    const alvos = geometria.retangulos.filter((r) => ativas.has(r.tecla))
    const tecla = mouse.dentro && olho ? teclaNoPonto(olho, alvos) : null
    const r = avancarPermanencia(permanencia, tecla, agora)
    permanencia = r.permanencia
    pintarFixacao(tecla, r.progresso)
    if (olho) {
      const tr = tremor(agora)
      pintarPonto({ x: olho.x + tr.x, y: olho.y + tr.y }, opacidade)
    }
    if (r.disparou) acionar(r.disparou)
    return mouse.dentro || opacidade > 0
  }

  function tique(agora: number) {
    quadro = 0
    // Um quadro longo (máquina ocupada) não vira um salto no tempo.
    const dt = ultimo === null ? 16 : Math.min(50, agora - ultimo)
    ultimo = agora
    const segue =
      l.modo.current === 'auto' ? passoAutomatico(dt) : l.modo.current === 'pessoa' ? passoDaPessoa(dt, agora) : false
    if (segue) agendar()
    else ultimo = null
  }

  /**
   * A pessoa aciona uma tecla: pela fixação do mouse ou num clique. A tecla
   * acende com o que foi escolhido nela e, um instante depois, a tela muda —
   * como no roteiro. Um segundo acionamento nesse instante não conta.
   */
  let pendente = false
  function acionar(id: IdDaTecla) {
    if (pendente || selecionar(l.estado.current, id).efeito === 'nada') return
    pendente = true
    acender(id)
    depois(roteiro.tempos.disparoMs, () => {
      pendente = false
      acender(null)
      const { estado: novo, efeito } = selecionar(l.estado.current, id)
      if (efeito === 'nada') return
      mudarEstado(novo, id)
      if (efeito === 'falou') {
        sinalizarFala(false)
        sinalizarFala(true)
        const esta = idDaFala
        depois(roteiro.tempos.falouMs, () => {
          if (esta === idDaFala) sinalizarFala(false)
        })
      }
    })
  }

  const assumir = (p: Ponto) => {
    mouse.dentro = true
    mouse.ponto = p
    medir()
    if (l.modo.current !== 'pessoa') {
      mudarModo('pessoa')
      acender(null)
      sinalizarFala(false)
      // A frase que estava sumindo some de vez: a pessoa começa do vazio.
      if (apagandoAgora) mudarEstado(INICIO, null)
      sinalizarApagar(false)
      permanencia = SEM_PERMANENCIA
      if (opacidade <= 0 || !olho) olho = { ...p }
    }
    agendar()
  }

  const mover = (p: Ponto) => {
    // Voltou para o teclado depois de sair: a página pode ter rolado, mede de novo.
    if (!mouse.dentro) medir()
    mouse.dentro = true
    mouse.ponto = p
    agendar()
  }

  const soltar = () => {
    mouse.dentro = false
    agendar()
  }

  const recomecar = () => {
    parar()
    timers.forEach((t) => window.clearTimeout(t))
    timers.clear()
    pendente = false
    tempo = 0
    olho = null
    opacidade = 0
    permanencia = SEM_PERMANENCIA
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
    timers.forEach((t) => window.clearTimeout(t))
    timers.clear()
  }

  agendar()
  return { agendar, parar, recomecar, assumir, mover, soltar, acionar, desligar }
}
