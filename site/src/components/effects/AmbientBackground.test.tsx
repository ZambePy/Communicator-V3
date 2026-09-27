import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { AmbientBackground } from './AmbientBackground'

/* O fundo animado: partículas, manchas de luz, grade e varredura — e o modo
   leve (tela estreita ou máquina modesta), que corta o que custa caro. */

const larguraOriginal = window.innerWidth
const nucleosOriginais = Object.getOwnPropertyDescriptor(navigator, 'hardwareConcurrency')

function largura(px: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: px })
}

function nucleos(n: number) {
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: n })
}

beforeEach(() => {
  largura(1440)
  nucleos(8)
})
afterEach(() => {
  largura(larguraOriginal)
  if (nucleosOriginais) Object.defineProperty(navigator, 'hardwareConcurrency', nucleosOriginais)
  else delete (navigator as { hardwareConcurrency?: number }).hardwareConcurrency
})

describe('<AmbientBackground />', () => {
  it('destaque: gradiente, manchas, grade e as partículas pedidas, fora do leitor de tela', () => {
    const { container } = render(<AmbientBackground particulas={18} varredura />)
    const fundo = container.querySelector('.ambient')!
    expect(fundo).toHaveAttribute('aria-hidden', 'true')
    expect(fundo.querySelector('.ambient__mesh')).not.toBeNull()
    expect(fundo.querySelectorAll('.ambient__blob')).toHaveLength(2)
    expect(fundo.querySelector('.ambient__grid')).not.toBeNull()
    expect(fundo.querySelector('.ambient__scan')).not.toBeNull()
    expect(fundo.querySelectorAll('.ambient__dot')).toHaveLength(18)
  })

  it('suave: sem varredura, mesmo se pedida', () => {
    const { container } = render(<AmbientBackground variante="suave" varredura />)
    expect(container.querySelector('.ambient--suave')).not.toBeNull()
    expect(container.querySelector('.ambient__scan')).toBeNull()
    expect(container.querySelectorAll('.ambient__dot')).toHaveLength(10)
  })

  it('partículas: só as partículas, sem luz nem grade', () => {
    const { container } = render(<AmbientBackground variante="particulas" particulas={8} />)
    expect(container.querySelector('.ambient__mesh')).toBeNull()
    expect(container.querySelector('.ambient__blob')).toBeNull()
    expect(container.querySelector('.ambient__grid')).toBeNull()
    expect(container.querySelectorAll('.ambient__dot')).toHaveLength(8)
  })

  it('tela estreita: modo leve, com metade das partículas, uma mancha e sem varredura', () => {
    largura(390)
    const { container } = render(<AmbientBackground particulas={18} varredura />)
    expect(container.querySelector('.ambient--leve')).not.toBeNull()
    expect(container.querySelectorAll('.ambient__dot')).toHaveLength(9)
    expect(container.querySelectorAll('.ambient__blob')).toHaveLength(1)
    expect(container.querySelector('.ambient__scan')).toBeNull()
  })

  it('máquina com poucos núcleos também entra no modo leve', () => {
    nucleos(4)
    const { container } = render(<AmbientBackground particulas={14} />)
    expect(container.querySelector('.ambient--leve')).not.toBeNull()
    expect(container.querySelectorAll('.ambient__dot')).toHaveLength(7)
  })
})
