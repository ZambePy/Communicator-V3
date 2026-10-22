import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useTique } from './useTique'
import { mudarAba } from '@/test/observador'

/* O relógio dos efeitos de fundo (rodada 3, 21/10/2026): bate enquanto a
   seção está na tela E a aba está visível, e só então. Fora disso não há
   temporizador nenhum rodando — nada gasta bateria com ninguém olhando. */

function Sonda({ ativo, aoTique }: { ativo: boolean; aoTique: () => void }) {
  useTique(ativo, 1000, aoTique)
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  mudarAba('visible')
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useTique', () => {
  it('bate a cada intervalo enquanto está ativo e a aba está visível', () => {
    const tique = vi.fn()
    render(<Sonda ativo aoTique={tique} />)
    expect(tique).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(3000))
    expect(tique).toHaveBeenCalledTimes(3)
  })

  it('fora da tela (inativo): nenhum temporizador, nenhum tique', () => {
    const tique = vi.fn()
    render(<Sonda ativo={false} aoTique={tique} />)
    expect(vi.getTimerCount()).toBe(0)
    act(() => void vi.advanceTimersByTime(5000))
    expect(tique).not.toHaveBeenCalled()
  })

  it('para ao sair da tela e volta ao voltar', () => {
    const tique = vi.fn()
    const { rerender } = render(<Sonda ativo aoTique={tique} />)
    act(() => void vi.advanceTimersByTime(2000))
    expect(tique).toHaveBeenCalledTimes(2)
    rerender(<Sonda ativo={false} aoTique={tique} />)
    expect(vi.getTimerCount()).toBe(0)
    act(() => void vi.advanceTimersByTime(5000))
    expect(tique).toHaveBeenCalledTimes(2)
    rerender(<Sonda ativo aoTique={tique} />)
    act(() => void vi.advanceTimersByTime(1000))
    expect(tique).toHaveBeenCalledTimes(3)
  })

  it('com a aba escondida: para (o temporizador é desfeito); ao voltar, retoma', () => {
    const tique = vi.fn()
    render(<Sonda ativo aoTique={tique} />)
    act(() => void vi.advanceTimersByTime(1000))
    expect(tique).toHaveBeenCalledTimes(1)
    mudarAba('hidden')
    expect(vi.getTimerCount()).toBe(0)
    act(() => void vi.advanceTimersByTime(10000))
    expect(tique).toHaveBeenCalledTimes(1)
    mudarAba('visible')
    act(() => void vi.advanceTimersByTime(1000))
    expect(tique).toHaveBeenCalledTimes(2)
  })

  it('começa com a aba já escondida: não bate até ela aparecer', () => {
    mudarAba('hidden')
    const tique = vi.fn()
    render(<Sonda ativo aoTique={tique} />)
    expect(vi.getTimerCount()).toBe(0)
    mudarAba('visible')
    act(() => void vi.advanceTimersByTime(1000))
    expect(tique).toHaveBeenCalledTimes(1)
  })

  it('trocar a função não reinicia o relógio, e desmontar o desfaz', () => {
    const a = vi.fn()
    const b = vi.fn()
    const { rerender, unmount } = render(<Sonda ativo aoTique={a} />)
    act(() => void vi.advanceTimersByTime(600))
    rerender(<Sonda ativo aoTique={b} />)
    act(() => void vi.advanceTimersByTime(400))
    // O primeiro tique caiu em 1000 ms contados desde o começo, já na função nova.
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
