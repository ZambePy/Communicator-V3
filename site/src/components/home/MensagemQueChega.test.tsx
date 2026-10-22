import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'
import { instalarObservadorFalso, MOVIMENTO_REDUZIDO, responderMidia } from '@/test/observador'
import { CuidadorDestaque } from './CuidadorDestaque'
import { MensagemQueChega } from './MensagemQueChega'

/* Quem cuida (rodada 3, 21/10/2026): quando a seção entra na tela, o que o
   paciente escreveu chega ao celular — o cartão "Carlos escreveu, agora" com a
   frase, como a tela inicial do IrisFlow Cuidador mostra a última mensagem.
   Uma vez. Com movimento reduzido, o cartão já está lá. */

let restaurarMidia = () => {}
afterEach(() => {
  restaurarMidia()
  restaurarMidia = () => {}
  vi.unstubAllGlobals()
})

function montar() {
  return render(
    <div className="celular">
      <div className="celular__tela">
        <MensagemQueChega nome="Carlos" iniciais="CS" frase="Quero água" />
      </div>
    </div>,
  )
}
const cartao = (c: HTMLElement) => c.querySelector<HTMLElement>('.v3-chega')!
const celular = (c: HTMLElement) => c.querySelector<HTMLElement>('.celular')!

describe('<MensagemQueChega />', () => {
  it('o cartão diz quem escreveu e o que, como o app do cuidador, e é decorativo', () => {
    const { container } = montar()
    const el = cartao(container)
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el).toHaveTextContent('Carlos escreveu, agora')
    expect(el).toHaveTextContent('Quero água')
    expect(el.querySelector('.v3-chega__avatar')).toHaveTextContent('CS')
    expect(el.querySelector('a, button, input, [tabindex]')).toBeNull()
  })

  it('espera a seção: antes de o celular entrar na tela, o cartão ainda não chegou', () => {
    instalarObservadorFalso()
    const { container } = montar()
    expect(cartao(container)).toHaveClass('is-aguardando')
    expect(cartao(container)).not.toHaveClass('is-chegando')
  })

  it('quando o celular entra na tela, o cartão chega — uma vez só', () => {
    const obs = instalarObservadorFalso()
    const { container } = montar()
    obs.avisar(true, celular(container))
    expect(cartao(container)).toHaveClass('is-chegando')
    expect(cartao(container)).not.toHaveClass('is-aguardando')
    obs.avisar(false, celular(container))
    obs.avisar(true, celular(container))
    expect(cartao(container)).toHaveClass('is-chegando')
    // Parou de observar: não há como chegar de novo.
    expect(obs.observados()).toBe(0)
  })

  it('movimento reduzido: o cartão já está lá, sem classe de espera e sem observar nada', () => {
    restaurarMidia = responderMidia(MOVIMENTO_REDUZIDO)
    const obs = instalarObservadorFalso()
    const { container } = montar()
    expect(cartao(container)).not.toHaveClass('is-aguardando')
    expect(cartao(container)).not.toHaveClass('is-chegando')
    expect(obs.observados()).toBe(0)
  })

  it('sem IntersectionObserver: o cartão já está lá (nada fica escondido)', () => {
    const { container } = montar()
    expect(cartao(container)).not.toHaveClass('is-aguardando')
  })

  describe('o CSS', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'mensagem-que-chega.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

    it('só anima transform e opacity, e só se esconde com a classe de espera', () => {
      const blocos = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
      expect(blocos.length).toBeGreaterThan(0)
      for (const bloco of blocos) {
        const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
        expect(props.every((p) => p === 'transform' || p === 'opacity')).toBe(true)
      }
      const fora = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
      expect(fora).toMatch(/\.v3-chega\.is-aguardando\s*\{[^}]*opacity:\s*0/)
      expect(fora.replace(/\.v3-chega\.is-aguardando\s*\{[^}]*\}/g, '')).not.toMatch(/opacity:\s*0\s*;/)
    })

    it('não pega clique nem foco e some da animação com movimento reduzido', () => {
      expect(css).toMatch(/\.v3-chega\s*\{[^}]*pointer-events:\s*none/)
      const reduzido = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)![0]
      expect(reduzido).toMatch(/animation:\s*none/)
      expect(reduzido).toMatch(/opacity:\s*1/)
    })
  })
})

describe('no destaque de quem cuida', () => {
  it('o cartão chega dentro da tela do celular, depois da gravação, e o resto da seção não muda', () => {
    const { container } = render(
      <MemoryRouter future={FUTURO_DO_ROTEADOR}>
        <CuidadorDestaque />
      </MemoryRouter>,
    )
    const tela = container.querySelector('.celular__tela')!
    const el = tela.querySelector('.v3-chega')!
    expect(el).not.toBeNull()
    expect(el.previousElementSibling?.matches('video, .demo-pausa, span')).toBe(true)
    expect(container.querySelectorAll('.v3-chega')).toHaveLength(1)
    expect(container.querySelector('video')).not.toBeNull()
    expect(container.querySelector('h2')).not.toBeNull()
  })
})
