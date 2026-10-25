import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MOVIMENTO_REDUZIDO, responderMidia } from '@/test/observador'
import { Atmosfera, particulas } from './Atmosfera'

let restaurar = () => {}
afterEach(() => {
  restaurar()
  restaurar = () => {}
})

const aqui = dirname(fileURLToPath(import.meta.url))

describe('<Atmosfera />', () => {
  it('é decoração: fora do leitor de tela, sem nada que receba foco, sem canvas', () => {
    const { container } = render(<Atmosfera variante="abertura" />)
    const el = container.querySelector('.atmosfera')!
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el.querySelector('a, button, input, [tabindex], canvas')).toBeNull()
  })

  it('cada variante tem a sua dose: abertura com aurora e partículas, calmo sem nenhum dos dois', () => {
    const abertura = render(<Atmosfera variante="abertura" />)
    expect(abertura.container.querySelector('.atmosfera__aurora')).not.toBeNull()
    expect(abertura.container.querySelectorAll('.atmosfera__particulas span').length).toBe(26)
    abertura.unmount()
    const calmo = render(<Atmosfera variante="calmo" />)
    expect(calmo.container.querySelector('.atmosfera__aurora, .atmosfera__particulas')).toBeNull()
  })

  it('com movimento reduzido, nenhuma partícula', () => {
    restaurar = responderMidia(MOVIMENTO_REDUZIDO)
    const { container } = render(<Atmosfera variante="abertura" />)
    expect(container.querySelector('.atmosfera__particulas')).toBeNull()
  })

  it('as partículas nascem sempre nos mesmos lugares (sem pulo entre renderizações)', () => {
    expect(particulas(5, 3)).toEqual(particulas(5, 3))
    for (const p of particulas(40)) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(100)
      expect(p.atraso).toBeLessThanOrEqual(0)
    }
  })

  it('o CSS só anima transform e opacity', () => {
    const css = readFileSync(resolve(aqui, 'atmosfera.css'), 'utf8')
    const blocos = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
    expect(blocos.length).toBeGreaterThan(2)
    for (const bloco of blocos) {
      const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
      expect(props.every((p) => p === 'transform' || p === 'opacity'), bloco.slice(0, 40)).toBe(true)
    }
  })
})
