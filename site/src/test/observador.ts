import { act } from '@testing-library/react'
import { vi } from 'vitest'

/* Ferramentas de teste para os efeitos que dependem de "estar na tela", "aba
   visível", "movimento reduzido" e "ponteiro fino" (rodada 3, 21/10/2026). O
   jsdom não tem nenhum dos quatro: aqui o teste os controla. */

type Entrada = Partial<IntersectionObserverEntry>
type Aviso = (entradas: Entrada[]) => void

type Instancia = { aviso: Aviso; alvos: Set<Element> }

/** Troca o IntersectionObserver por um que o teste comanda. */
export function instalarObservadorFalso() {
  const instancias: Instancia[] = []
  class Falso {
    private i: Instancia
    constructor(aviso: Aviso) {
      this.i = { aviso, alvos: new Set() }
      instancias.push(this.i)
    }
    observe(el: Element) {
      this.i.alvos.add(el)
    }
    unobserve(el: Element) {
      this.i.alvos.delete(el)
    }
    disconnect() {
      this.i.alvos.clear()
    }
  }
  vi.stubGlobal('IntersectionObserver', Falso)
  return {
    /** Quantos elementos estão sendo observados agora, somando todos os observadores. */
    observados: () => instancias.reduce((s, i) => s + i.alvos.size, 0),
    /** Avisa que `alvo` (um elemento, vários, ou tudo o que está observado) entrou ou saiu da tela. */
    avisar(dentro: boolean, alvo?: Element | Element[]) {
      const escolhidos = alvo === undefined ? null : Array.isArray(alvo) ? alvo : [alvo]
      act(() => {
        for (const i of instancias) {
          // Um aviso por observador, com uma entrada por elemento observado: como o navegador entrega.
          const entradas = Array.from(i.alvos)
            .filter((el) => !escolhidos || escolhidos.includes(el))
            .map((el) => ({
              isIntersecting: dentro,
              intersectionRatio: dentro ? 1 : 0,
              boundingClientRect: { height: 300 } as DOMRectReadOnly,
              rootBounds: null,
              target: el,
            }))
          if (entradas.length) i.aviso(entradas)
        }
      })
    },
  }
}

/** Liga ou desliga a aba visível (document.visibilityState) e avisa quem escuta. */
export function mudarAba(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => estado === 'hidden' })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** matchMedia que responde "sim" só às consultas que contêm algum dos trechos pedidos. */
export function responderMidia(...trechos: string[]) {
  const original = window.matchMedia
  window.matchMedia = ((q: string) => ({
    matches: trechos.some((t) => q.includes(t)),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}

export const MOVIMENTO_REDUZIDO = 'reduce'
export const PONTEIRO_FINO = 'pointer: fine'
