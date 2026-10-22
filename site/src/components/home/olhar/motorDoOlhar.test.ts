import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INICIO, TECLAS_DA_GRADE, type EstadoDoTeclado, type IdDaTecla } from './maquinaDoTeclado'
import { QUADRO_FINAL } from './frasesDaAbertura'
import { montarRoteiro } from './roteiroDoOlhar'
import { ligarMotor, type Ligacoes, type Modo, type PecasDaTecla } from './motorDoOlhar'

/* O laço da abertura: só anda com a tela à vista e a aba aberta, para quando
   a pessoa pausa, faz duas frases e para no quadro final; com o mouse, a
   pessoa assume e a fixação aciona a tecla. Relógio e observadores falsos. */

let filaDeQuadros: Map<number, FrameRequestCallback>
let proximoId: number
let agora: number
let avisarVisibilidade: ((e: Partial<IntersectionObserverEntry>[]) => void) | null

function caixa(x: number, y: number, w: number, h: number): DOMRect {
  return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect
}

function comCaixa<T extends HTMLElement>(el: T, r: DOMRect): T {
  el.getBoundingClientRect = () => r
  return el
}

/** Uma tela de 600 × 400 com a barra de cima e a grade de 3 × 2. */
function montarTela() {
  const tela = comCaixa(document.createElement('div'), caixa(0, 0, 600, 400))
  const grade = comCaixa(document.createElement('div'), caixa(0, 80, 600, 320))
  const texto = comCaixa(document.createElement('div'), caixa(200, 10, 390, 60))
  const ponto = document.createElement('span')
  const teclas: Partial<Record<IdDaTecla, PecasDaTecla>> = {}
  const pecas = (id: IdDaTecla, r: DOMRect) => {
    const el = comCaixa(document.createElement('div'), r)
    el.dataset.tecla = id
    teclas[id] = { el, calor: document.createElement('span'), traco: document.createElement('span') }
  }
  TECLAS_DA_GRADE.forEach((id, i) => pecas(id, caixa((i % 3) * 200 + 5, 80 + Math.floor(i / 3) * 160 + 5, 190, 150)))
  pecas('voltar', caixa(10, 10, 80, 60))
  pecas('falar', caixa(100, 10, 80, 60))
  document.body.append(tela)
  return { tela, grade, texto, ponto, teclas }
}

function ligar(extra: Partial<Ligacoes> = {}) {
  const t = montarTela()
  const estado = { current: INICIO as EstadoDoTeclado }
  const modo = { current: 'auto' as Modo }
  const pausado = { current: false }
  const avisos = { estados: [] as EstadoDoTeclado[], modos: [] as Modo[] }
  const motor = ligarMotor({
    tela: t.tela,
    grade: () => t.grade,
    texto: () => t.texto,
    ponto: () => t.ponto,
    teclas: () => t.teclas,
    estado,
    modo,
    pausado,
    flip: { current: null },
    aoMudarEstado: (novo) => avisos.estados.push(novo),
    aoMudarModo: (m) => avisos.modos.push(m),
    aoAcender: () => {},
    aoFalar: () => {},
    aoApagar: () => {},
    ...extra,
  })
  return { ...t, estado, modo, pausado, avisos, motor }
}

/** Roda os quadros pedidos, 16 ms cada, até `ms` passarem (ou ninguém pedir mais). */
function rodar(ms: number) {
  const fim = agora + ms
  while (agora < fim && filaDeQuadros.size > 0) {
    agora += 16
    const vez = Array.from(filaDeQuadros.entries())
    filaDeQuadros.clear()
    for (const [, cb] of vez) cb(agora)
  }
}

beforeEach(() => {
  filaDeQuadros = new Map()
  proximoId = 1
  agora = 1000
  avisarVisibilidade = null
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = proximoId++
    filaDeQuadros.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => filaDeQuadros.delete(id))
  class ObservadorFalso {
    constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) {
      avisarVisibilidade = cb
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', ObservadorFalso)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

const naTela = (sim: boolean) => avisarVisibilidade?.([{ isIntersecting: sim, intersectionRatio: sim ? 1 : 0 }])

describe('o laço da abertura', () => {
  it('fora da tela não pede quadro nenhum; na tela, anda; ao sair, para', () => {
    const m = ligar()
    try {
      expect(filaDeQuadros.size).toBe(0)
      naTela(true)
      expect(filaDeQuadros.size).toBe(1)
      rodar(3800)
      expect(m.avisos.estados.some((e) => e.texto === 'E')).toBe(true)
      naTela(false)
      expect(filaDeQuadros.size).toBe(0)
      const antes = m.avisos.estados.length
      rodar(3000)
      expect(m.avisos.estados.length).toBe(antes)
    } finally {
      m.motor.desligar()
    }
  })

  it('com a aba escondida para, e volta quando ela aparece', () => {
    const m = ligar()
    try {
      naTela(true)
      rodar(500)
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
      expect(filaDeQuadros.size).toBe(0)
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
      expect(filaDeQuadros.size).toBe(1)
    } finally {
      m.motor.desligar()
    }
  })

  it('pausado, não anda', () => {
    const m = ligar()
    try {
      m.pausado.current = true
      naTela(true)
      expect(filaDeQuadros.size).toBe(0)
      m.pausado.current = false
      m.motor.agendar()
      expect(filaDeQuadros.size).toBe(1)
    } finally {
      m.motor.desligar()
    }
  })

  it('escreve as duas frases e para no quadro final, sem pedir mais quadros', () => {
    const m = ligar()
    try {
      naTela(true)
      rodar(montarRoteiro().duracao + 2000)
      expect(m.avisos.modos).toEqual(['fim'])
      expect(m.estado.current).toEqual(QUADRO_FINAL)
      expect(m.avisos.estados.some((e) => e.texto === 'Estou com sede. ')).toBe(true)
      expect(filaDeQuadros.size).toBe(0)
      // O ponto sumiu no fim.
      expect(Number(m.ponto.style.opacity)).toBe(0)
    } finally {
      m.motor.desligar()
    }
  })

  it('o mouse assume: parado numa tecla pelo tempo de fixação, ela aciona', () => {
    // Só os temporizadores; os quadros continuam nas mãos do teste.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const m = ligar()
      naTela(true)
      // No meio da primeira tecla (A B C / D E F).
      m.motor.assumir({ x: 100, y: 155 })
      expect(m.modo.current).toBe('pessoa')
      rodar(900)
      vi.advanceTimersByTime(300)
      const abriu = m.avisos.estados.find((e) => e.nivel.tipo === 'grupo')
      expect(abriu).toEqual({ nivel: { tipo: 'grupo', grupo: 0 }, texto: '' })
      // Clicar também aciona (depois da pausa da seleção).
      m.motor.acionar('c4')
      vi.advanceTimersByTime(300)
      expect(m.estado.current.texto).toBe('E')
      // O mouse saiu: o ponto apaga e o laço para.
      m.motor.soltar()
      rodar(600)
      expect(filaDeQuadros.size).toBe(0)
      expect(Number(m.ponto.style.opacity)).toBe(0)
      // Voltou: o ponto reaparece e segue o mouse de novo.
      m.motor.mover({ x: 300, y: 155 })
      rodar(300)
      expect(Number(m.ponto.style.opacity)).toBeGreaterThan(0.9)
      m.motor.desligar()
    } finally {
      vi.useRealTimers()
    }
  })
})
