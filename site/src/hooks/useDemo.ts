import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { prefersReducedMotion } from './useReducedMotion'

/**
 * Inclina o aparelho para trás enquanto ele entra na tela e o endireita à
 * medida que a página rola — o monitor "se apresenta" para quem chega. Escreve
 * `--inclinacao` (graus) e `--escala` no elemento; o CSS faz o resto.
 *
 * Só trabalha enquanto o elemento está perto da tela, e em um quadro por vez.
 * Com movimento reduzido, o aparelho já nasce reto.
 */
export function useInclinacaoAoRolar<T extends HTMLElement>(
  ref: RefObject<T>,
  { graus = 16, escalaInicial = 0.94 }: { graus?: number; escalaInicial?: number } = {},
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const aplicar = (t: number) => {
      el.style.setProperty('--inclinacao', `${(graus * (1 - t)).toFixed(2)}deg`)
      el.style.setProperty('--escala', (escalaInicial + (1 - escalaInicial) * t).toFixed(4))
    }
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      aplicar(1)
      return
    }

    let quadro = 0
    let visivel = false
    const medir = () => {
      quadro = 0
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      // 0 com o topo do aparelho a 85 % da altura da janela; 1 com ele a 15 %.
      const t = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.7)))
      aplicar(t)
    }
    const pedir = () => {
      if (visivel && !quadro) quadro = window.requestAnimationFrame(medir)
    }
    const io = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting
      pedir()
    })
    io.observe(el)
    medir()
    window.addEventListener('scroll', pedir, { passive: true })
    window.addEventListener('resize', pedir)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', pedir)
      window.removeEventListener('resize', pedir)
      if (quadro) window.cancelAnimationFrame(quadro)
    }
  }, [ref, graus, escalaInicial])
}

/**
 * Vídeo de demonstração que só roda quando está na tela e que a pessoa pode
 * pausar (WCAG 2.2.2: movimento automático de mais de 5 s precisa de pausa).
 * Com movimento reduzido ele começa parado, no quadro de abertura.
 */
export function useVideoNaTela() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pausadoPelaPessoa, setPausadoPelaPessoa] = useState(prefersReducedMotion)
  const [tocando, setTocando] = useState(false)
  const naTela = useRef(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const aoTocar = () => setTocando(true)
    const aoParar = () => setTocando(false)
    v.addEventListener('playing', aoTocar)
    v.addEventListener('pause', aoParar)
    return () => {
      v.removeEventListener('playing', aoTocar)
      v.removeEventListener('pause', aoParar)
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => {
        naTela.current = e.isIntersecting
        if (e.isIntersecting && !pausadoPelaPessoa) void v.play().catch(() => undefined)
        else v.pause()
      },
      { threshold: 0.25 },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [pausadoPelaPessoa])

  const alternar = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      setPausadoPelaPessoa(false)
      void v.play().catch(() => undefined)
    } else {
      setPausadoPelaPessoa(true)
      v.pause()
    }
  }, [])

  return { videoRef, tocando, alternar }
}
