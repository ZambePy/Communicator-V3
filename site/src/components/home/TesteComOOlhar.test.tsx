import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { TesteComOOlhar } from './TesteComOOlhar'
import { TESTE_AO_VIVO } from '@/data/home'

/* "Testar com o meu olhar" (v3, 21/10/2026): o teste ao vivo com a câmera é um
   pedaço à parte (TesteAoVivo, da Task 3) e só é baixado no clique. Antes do
   clique, nada dele chega ao navegador — nem câmera, nem modelo. */

const { importou } = vi.hoisted(() => ({ importou: vi.fn() }))

/* O pedaço é simulado por `vi.doMock` registrado a CADA teste (abaixo): a
   fábrica de um `vi.mock` roda uma vez por arquivo e o resultado fica em
   cache, então um contador dentro dela só enxergava a primeira importação. */

const matchMediaOriginal = window.matchMedia
const COMPUTADOR = '(min-width: 900px) and (pointer: fine)'

/** Um matchMedia que guarda quem escuta cada consulta, para simular a janela mudando. */
function midiaControlada(vale: (consulta: string) => boolean) {
  const ouvintes = new Map<string, Set<(e: { matches: boolean }) => void>>()
  window.matchMedia = ((consulta: string) => ({
    matches: vale(consulta),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_tipo: string, cb: (e: { matches: boolean }) => void) => {
      if (!ouvintes.has(consulta)) ouvintes.set(consulta, new Set())
      ouvintes.get(consulta)!.add(cb)
    },
    removeEventListener: (_tipo: string, cb: (e: { matches: boolean }) => void) => {
      ouvintes.get(consulta)?.delete(cb)
    },
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  return {
    mudar(consulta: string, matches: boolean) {
      act(() => ouvintes.get(consulta)?.forEach((cb) => cb({ matches })))
    },
  }
}

// Sem isto o contador `importou` nunca zerava (a fábrica do mock roda uma vez
// por arquivo) e o teste do clique só passava por ser o primeiro (revisão de
// 21/10/2026, M3). Zerar o contador, o registro de módulos e refazer o mock faz
// cada teste começar como se ninguém tivesse importado o pedaço — em qualquer
// ordem (conferido com --sequence.shuffle.tests).
beforeEach(() => {
  importou.mockClear()
  vi.resetModules()
  vi.doMock('@/components/demo/TesteAoVivo', () => {
    importou()
    return { default: () => <p>o teste ao vivo abriu</p> }
  })
})

afterEach(() => {
  window.matchMedia = matchMediaOriginal
  vi.unstubAllGlobals()
})

describe('<TesteComOOlhar />', () => {
  it('o pedaço do teste só é importado no clique', async () => {
    render(<TesteComOOlhar />)
    const botao = screen.getByRole('button', { name: TESTE_AO_VIVO.botao })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    // Esperar não importa nada: o pedaço não vem sozinho.
    await new Promise((r) => setTimeout(r, 50))
    expect(importou).not.toHaveBeenCalled()
    expect(screen.queryByText('o teste ao vivo abriu')).toBeNull()

    fireEvent.click(botao)
    expect(await screen.findByText('o teste ao vivo abriu')).toBeInTheDocument()
    expect(importou).toHaveBeenCalledTimes(1)
  })

  it('aberto, o botão vira "Fechar o teste", e fechar desmonta o teste (a câmera para junto)', async () => {
    render(<TesteComOOlhar />)
    fireEvent.click(screen.getByRole('button', { name: TESTE_AO_VIVO.botao }))
    await screen.findByText('o teste ao vivo abriu')
    const fechar = screen.getByRole('button', { name: TESTE_AO_VIVO.fechar })
    expect(fechar).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(fechar)
    expect(screen.queryByText('o teste ao vivo abriu')).toBeNull()
    expect(screen.getByRole('button', { name: TESTE_AO_VIVO.botao })).toBeInTheDocument()
  })

  /* Integração com a Task 3 (relatório dela, 21/10/2026): o painel some pelo
     CSS fora de "computador com mouse, ≥ 900 px", mas o CSS não desmonta
     nada. Sem isto, estreitar a janela com o teste aberto deixaria a câmera
     ligada atrás de um painel escondido. */
  it('aberto, se a janela deixa de ser computador com mouse, o teste fecha: a câmera não fica ligada escondida', async () => {
    const midia = midiaControlada((q) => q === COMPUTADOR)
    render(<TesteComOOlhar />)
    fireEvent.click(screen.getByRole('button', { name: TESTE_AO_VIVO.botao }))
    await screen.findByText('o teste ao vivo abriu')
    midia.mudar(COMPUTADOR, false)
    expect(screen.queryByText('o teste ao vivo abriu')).toBeNull()
    expect(screen.getByRole('button', { name: TESTE_AO_VIVO.botao })).toHaveAttribute('aria-expanded', 'false')
  })

  it('diz antes do clique que a imagem não sai do computador', () => {
    render(<TesteComOOlhar />)
    expect(screen.getByText(TESTE_AO_VIVO.nota)).toBeInTheDocument()
    expect(TESTE_AO_VIVO.nota).toMatch(/não sai/)
  })

  it('se o pedaço não chega (rede caiu, deploy novo), diz isso com calma e deixa tentar de novo', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let tentativas = 0
    const carregar = () => {
      tentativas++
      return tentativas === 1
        ? Promise.reject(new Error('Failed to fetch dynamically imported module'))
        : Promise.resolve({ default: () => <p>abriu na segunda</p> })
    }
    render(<TesteComOOlhar carregar={carregar} />)
    fireEvent.click(screen.getByRole('button', { name: TESTE_AO_VIVO.botao }))
    expect(await screen.findByText(TESTE_AO_VIVO.falhou)).toBeInTheDocument()
    // O motivo vai para o console uma vez (sem falha silenciosa).
    expect(aviso).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: TESTE_AO_VIVO.tentarDeNovo }))
    expect(await screen.findByText('abriu na segunda')).toBeInTheDocument()
    expect(tentativas).toBe(2)
    erro.mockRestore()
    aviso.mockRestore()
  })
})
