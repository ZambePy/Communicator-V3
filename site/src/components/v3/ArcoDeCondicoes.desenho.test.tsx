import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CONDICOES_NO_ARCO, PARA_QUEM_O_OLHAR } from '@/data/home'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'
import { instalarObservadorFalso, MOVIMENTO_REDUZIDO, responderMidia } from '@/test/observador'
import { ArcoDeCondicoes } from './ArcoDeCondicoes'

/* "Para quem" (rodada 3, 21/10/2026): a linha do arco se desenha da esquerda
   para a direita quando a seção entra na tela, e cada condição aparece quando
   a linha passa por ela — uma vez. Com movimento reduzido, o arco já
   desenhado (o estado final). Sem IntersectionObserver, também: o conteúdo
   nunca fica escondido à espera de um aviso que não vem. */

let restaurarMidia = () => {}
afterEach(() => {
  restaurarMidia()
  restaurarMidia = () => {}
  vi.unstubAllGlobals()
})

function montar() {
  return render(
    <MemoryRouter future={FUTURO_DO_ROTEADOR}>
      <ArcoDeCondicoes condicoes={CONDICOES_NO_ARCO} titulo={PARA_QUEM_O_OLHAR.titulo} texto={PARA_QUEM_O_OLHAR.texto} />
    </MemoryRouter>,
  )
}
const arcoDe = (c: HTMLElement) => c.querySelector<HTMLElement>('.v3-arco')!

describe('o arco se desenha quando a seção entra na tela', () => {
  it('antes de entrar: preparado (a linha e as condições esperam), sem desenhar', () => {
    instalarObservadorFalso()
    const { container } = montar()
    expect(arcoDe(container)).toHaveClass('is-preparado')
    expect(arcoDe(container)).not.toHaveClass('is-desenhando')
  })

  it('ao entrar na tela: desenha — e fica assim (uma vez só, sem repetir ao sair e voltar)', () => {
    const obs = instalarObservadorFalso()
    const { container } = montar()
    const arco = arcoDe(container)
    obs.avisar(true, arco)
    expect(arco).toHaveClass('is-desenhando')
    expect(arco).not.toHaveClass('is-preparado')
    obs.avisar(false, arco)
    obs.avisar(true, arco)
    expect(arco).toHaveClass('is-desenhando')
    expect(arco).not.toHaveClass('is-preparado')
  })

  it('cada condição leva o instante em que o traço passa por ela, da esquerda para a direita', () => {
    instalarObservadorFalso()
    const { container } = montar()
    const itens = Array.from(container.querySelectorAll<HTMLElement>('.v3-arco__item'))
    for (const variavel of ['--entra-arco', '--entra-lista']) {
      const t = itens.map((li) => parseFloat(li.style.getPropertyValue(variavel)))
      expect(t.every(Number.isFinite)).toBe(true)
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1])
    }
  })

  it('movimento reduzido: o arco já desenhado, sem classe de espera e sem observar nada', () => {
    restaurarMidia = responderMidia(MOVIMENTO_REDUZIDO)
    const obs = instalarObservadorFalso()
    const { container } = montar()
    expect(arcoDe(container)).not.toHaveClass('is-preparado')
    expect(arcoDe(container)).not.toHaveClass('is-desenhando')
    expect(obs.observados()).toBe(0)
  })

  it('sem IntersectionObserver: o arco já desenhado (nada fica escondido)', () => {
    const { container } = montar()
    expect(arcoDe(container)).not.toHaveClass('is-preparado')
    expect(arcoDe(container)).not.toHaveClass('is-desenhando')
  })

  it('a linha e os itens são os mesmos de antes: seis links, a curva decorativa', () => {
    const { container } = montar()
    expect(container.querySelectorAll('.v3-arco__item a')).toHaveLength(CONDICOES_NO_ARCO.length)
    expect(container.querySelector('.v3-arco__curva')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('o CSS do desenho do arco', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'arco.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('o traço é um recorte da esquerda para a direita (clip-path), nada que mexa no layout', () => {
    expect(css).toMatch(/\.v3-arco\.is-desenhando\s+\.v3-arco__linha\s*\{[^}]*animation:\s*arco-tracar/)
    const bloco = css.match(/@keyframes arco-tracar\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)![0]
    const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
    expect(props.every((p) => p === 'clip-path')).toBe(true)
  })

  it('as condições aparecem só com opacity/transform, no instante de cada uma (--entra-*)', () => {
    expect(css).toMatch(/\.v3-arco\.is-desenhando\s+\.v3-arco__link\s*\{[^}]*animation:[^;]*var\(--entra-arco/)
    const bloco = css.match(/@keyframes arco-aparece\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)![0]
    const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
    expect(props.every((p) => p === 'opacity' || p === 'transform')).toBe(true)
  })

  it('só esconde com a classe de espera, que o componente só põe quando vai animar', () => {
    // Sem classe nenhuma o CSS não esconde nada: sem JavaScript, o arco aparece.
    const fora = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/\.v3-arco\.is-preparado[^{]*\{[^}]*\}/g, '')
    expect(fora).not.toMatch(/opacity:\s*0\s*;/)
    expect(css).toMatch(/\.v3-arco\.is-preparado\s+\.v3-arco__link\s*\{[^}]*opacity:\s*0/)
  })

  it('movimento reduzido: sem animação nenhuma', () => {
    const reduzido = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)![0]
    expect(reduzido).toMatch(/animation:\s*none/)
  })
})
