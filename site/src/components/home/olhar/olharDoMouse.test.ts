import { describe, expect, it } from 'vitest'
import {
  FIXACAO_DO_MOUSE_MS,
  PAUSA_DEPOIS_DA_SELECAO_MS,
  SEM_PERMANENCIA,
  avancarPermanencia,
  seguirOMouse,
  teclaNoPonto,
  type Permanencia,
} from './olharDoMouse'

/* Com o mouse no teclado, a pessoa assume: o ponto segue com o atraso de um
   cursor de olhar, e parar numa tecla pelo tempo de fixação a aciona, com a
   pausa depois de cada seleção. */

describe('o ponto segue o mouse', () => {
  it('com atraso suave, e o mesmo caminho a 60 ou a 120 quadros por segundo', () => {
    const umPasso = seguirOMouse({ x: 0, y: 0 }, { x: 100, y: 0 }, 16)
    expect(umPasso.x).toBeGreaterThan(0)
    expect(umPasso.x).toBeLessThan(30)
    let a = { x: 0, y: 0 }
    let b = { x: 0, y: 0 }
    for (let i = 0; i < 30; i++) a = seguirOMouse(a, { x: 100, y: 0 }, 1000 / 60)
    for (let i = 0; i < 60; i++) b = seguirOMouse(b, { x: 100, y: 0 }, 1000 / 120)
    expect(a.x).toBeCloseTo(b.x, 6)
    expect(a.x).toBeGreaterThan(99)
  })

  it('acha a tecla sob o ponto', () => {
    const r = [
      { tecla: 'c0' as const, x: 0, y: 0, largura: 100, altura: 50 },
      { tecla: 'c1' as const, x: 110, y: 0, largura: 100, altura: 50 },
    ]
    expect(teclaNoPonto({ x: 50, y: 25 }, r)).toBe('c0')
    expect(teclaNoPonto({ x: 150, y: 25 }, r)).toBe('c1')
    expect(teclaNoPonto({ x: 105, y: 25 }, r)).toBeNull()
  })
})

describe('a fixação pelo mouse', () => {
  function correr(p: Permanencia, tecla: 'c0' | 'c1' | null, de: number, ate: number) {
    let disparos: string[] = []
    let ultima = { permanencia: p, progresso: 0, disparou: null as string | null }
    for (let t = de; t <= ate; t += 10) {
      ultima = avancarPermanencia(ultima.permanencia, tecla, t)
      if (ultima.disparou) disparos = [...disparos, `${ultima.disparou}@${t}`]
    }
    return { ...ultima, disparos }
  }

  it('enche no tempo de fixação e aciona uma vez', () => {
    const r = correr(SEM_PERMANENCIA, 'c0', 1000, 1000 + FIXACAO_DO_MOUSE_MS + 200)
    expect(r.disparos).toEqual([`c0@${1000 + FIXACAO_DO_MOUSE_MS}`])
  })

  it('trocar de tecla recomeça; sair zera', () => {
    const meio = correr(SEM_PERMANENCIA, 'c0', 0, 500)
    expect(meio.progresso).toBeCloseTo(500 / FIXACAO_DO_MOUSE_MS)
    const outra = avancarPermanencia(meio.permanencia, 'c1', 510)
    expect(outra.progresso).toBe(0)
    expect(avancarPermanencia(outra.permanencia, null, 520).progresso).toBe(0)
  })

  it('depois de acionar, a pausa: nada conta, e a tecla parada sob o ponto recomeça depois dela', () => {
    const r = correr(SEM_PERMANENCIA, 'c0', 0, FIXACAO_DO_MOUSE_MS)
    expect(r.disparos).toHaveLength(1)
    const t0 = FIXACAO_DO_MOUSE_MS
    const durante = avancarPermanencia(r.permanencia, 'c0', t0 + PAUSA_DEPOIS_DA_SELECAO_MS - 10)
    expect(durante.progresso).toBe(0)
    const depois = correr(r.permanencia, 'c0', t0 + 10, t0 + PAUSA_DEPOIS_DA_SELECAO_MS + FIXACAO_DO_MOUSE_MS + 20)
    expect(depois.disparos).toEqual([`c0@${t0 + PAUSA_DEPOIS_DA_SELECAO_MS + FIXACAO_DO_MOUSE_MS}`])
  })
})
