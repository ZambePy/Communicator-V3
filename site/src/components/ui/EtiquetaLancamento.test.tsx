import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EtiquetaLancamento } from './EtiquetaLancamento'

/* A etiqueta vermelha da beta: o dia até o lançamento e, depois, que a beta
   foi liberada (a beta abriu em 29/09/2026, antes marcada para 10/11). Quem
   lê a tela ouve a frase inteira, não "10 barra 11". */

const AQUI = dirname(fileURLToPath(import.meta.url))
const ANTES = '2099-11-10T03:00:00Z'
const DEPOIS = '2026-09-30T00:50:00Z'

afterEach(() => vi.useRealTimers())

describe('<EtiquetaLancamento />', () => {
  it('antes do lançamento: o dia, curto no menu e com "Lançamento" nas páginas', () => {
    const { rerender, container } = render(<EtiquetaLancamento lancamento={ANTES} variante="curta" />)
    expect(screen.getByText('10/11')).toBeInTheDocument()
    expect(screen.getByText('Lançamento em 10 de novembro')).toHaveClass('sr-only')
    rerender(<EtiquetaLancamento lancamento={ANTES} />)
    expect(container.querySelector('.etiqueta-lancamento--longa')).toHaveTextContent('Lançamento 10/11')
    expect(container.querySelector('.etiqueta-lancamento--liberada')).toBeNull()
  })

  it('depois do lançamento: "Liberada" no menu e "Beta liberada" nas páginas', () => {
    const { rerender, container } = render(<EtiquetaLancamento lancamento={DEPOIS} variante="curta" />)
    expect(screen.getByText('Liberada')).toBeInTheDocument()
    expect(screen.getByText('Beta liberada: o download está aberto')).toHaveClass('sr-only')
    expect(container.querySelector('.etiqueta-lancamento--liberada')).not.toBeNull()
    rerender(<EtiquetaLancamento lancamento={DEPOIS} />)
    expect(screen.getByText('Beta liberada')).toBeInTheDocument()
    expect(screen.queryByText('10/11')).not.toBeInTheDocument()
  })

  it('troca sozinha na virada, com a página aberta', () => {
    vi.useFakeTimers()
    const agora = Date.parse('2026-09-30T00:49:58Z')
    vi.setSystemTime(agora)
    render(<EtiquetaLancamento lancamento={DEPOIS} variante="curta" />)
    // 00:50 UTC do dia 30 é 21:50 do dia 29 em Brasília.
    expect(screen.getByText('29/09')).toBeInTheDocument()
    act(() => {
      vi.setSystemTime(agora + 3000)
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('Liberada')).toBeInTheDocument()
  })

  it('o CSS mantém o vermelho e o ponto de "no ar" só anima transform e opacity', () => {
    const css = readFileSync(resolve(AQUI, 'etiqueta-lancamento.css'), 'utf8')
    expect(css).toContain('background: #d6293a')
    const blocos = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
    expect(blocos.length).toBeGreaterThan(0)
    for (const bloco of blocos) {
      const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
      expect(props.every((p) => p === 'transform' || p === 'opacity')).toBe(true)
    }
  })
})
