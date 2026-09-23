import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GazeStory } from './GazeStory'

/* O setup responde "sem preferência" ao matchMedia; aqui dá para pedir
   movimento reduzido e devolver o original no fim. */
const matchMediaOriginal = window.matchMedia
function preferirMenosMovimento() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

function numeros(el: Element, ...nomes: string[]) {
  return nomes.map((n) => Number(el.getAttribute(n)))
}

/** Caixa do botão realçado e ponto do cursor, no viewBox. O cursor vem
    como origem + ângulo + distância (o mesmo caminho do feixe). */
function mira(container: HTMLElement) {
  const realce = container.querySelector('.gs-alvo__fundo')
  const cursor = container.querySelector<SVGGElement>('.gs-cursor')!
  const [ox, oy, angulo, alcance] = (cursor.style.transform.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number)
  const rad = (angulo * Math.PI) / 180
  return { realce, cursor: { x: ox + alcance * Math.cos(rad), y: oy + alcance * Math.sin(rad) } }
}

const fase = (container: HTMLElement) =>
  container.querySelector('.gaze-story')!.className.match(/is-(vai|passa|fixa|aciona)/)?.[1]

afterEach(() => {
  window.matchMedia = matchMediaOriginal
  vi.useRealTimers()
})

describe('GazeStory (ilustração do hero)', () => {
  it('descreve a cena numa frase só e esconde as camadas dos leitores de tela', () => {
    const { container } = render(<GazeStory />)
    expect(
      screen.getByRole('img', {
        name: /pessoa em cadeira de rodas usando o IrisFlow com o olhar, com a tela inicial do app no monitor/,
      }),
    ).toBeInTheDocument()
    container.querySelectorAll('svg').forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'))

    const captura = container.querySelector('img')!
    expect(captura).toHaveAttribute('alt', '')
    expect(captura).toHaveAttribute('src', '/produto/tela-inicial-800.webp')
    expect(captura.getAttribute('srcset')).toBe(
      '/produto/tela-inicial-800.webp 800w, /produto/tela-inicial-1600.webp 1600w',
    )
  })

  it('mira um botão de verdade: o realce fica dentro da tela e o cursor dentro do botão', () => {
    const { container } = render(<GazeStory />)
    const [tx, ty, tw, th] = numeros(container.querySelector('.gs-tela')!, 'x', 'y', 'width', 'height')
    const { realce, cursor } = mira(container)
    const [bx, by, bw, bh] = numeros(realce!, 'x', 'y', 'width', 'height')

    expect(bx).toBeGreaterThan(tx)
    expect(by).toBeGreaterThan(ty)
    expect(bx + bw).toBeLessThan(tx + tw)
    expect(by + bh).toBeLessThan(ty + th)
    expect(cursor.x).toBeGreaterThan(bx)
    expect(cursor.x).toBeLessThan(bx + bw)
    expect(cursor.y).toBeGreaterThan(by)
    expect(cursor.y).toBeLessThan(by + bh)
  })

  describe('animação', () => {
    beforeEach(() => vi.useFakeTimers())

    it('anda em laço: vai até o botão, passa sem acionar, fixa e aciona', () => {
      const { container } = render(<GazeStory />)
      const primeiro = mira(container).cursor
      expect(fase(container)).toBe('aciona')

      act(() => void vi.advanceTimersByTime(1600))
      expect(fase(container)).toBe('vai')
      expect(mira(container).realce).toBeNull()
      expect(mira(container).cursor).not.toEqual(primeiro)

      act(() => void vi.advanceTimersByTime(600))
      expect(fase(container)).toBe('passa')

      act(() => void vi.advanceTimersByTime(700))
      expect(fase(container)).toBe('vai')
      act(() => void vi.advanceTimersByTime(600))
      expect(fase(container)).toBe('fixa')
      act(() => void vi.advanceTimersByTime(1300))
      expect(fase(container)).toBe('aciona')
      expect(container.querySelector('.gs-cursor__onda')).not.toBeNull()
    })

    it('com movimento reduzido fica parado no estado final', () => {
      preferirMenosMovimento()
      const { container } = render(<GazeStory />)
      const antes = mira(container)
      const caixa = numeros(antes.realce!, 'x', 'y', 'width', 'height')

      act(() => void vi.advanceTimersByTime(20000))
      const raiz = container.querySelector('.gaze-story')!
      expect(raiz).toHaveClass('is-static')
      expect(fase(container)).toBe('aciona')
      expect(numeros(mira(container).realce!, 'x', 'y', 'width', 'height')).toEqual(caixa)
      expect(mira(container).cursor).toEqual(antes.cursor)
      // anel cheio, sem a onda da confirmação
      expect(container.querySelector('.gs-cursor__anel')).toHaveAttribute('stroke-dashoffset', '0')
      expect(container.querySelector('.gs-cursor__onda')).toBeNull()
    })
  })
})
