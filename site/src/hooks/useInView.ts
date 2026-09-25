import { useEffect, useRef, useState } from 'react'

type Options = {
  /** Fração do elemento visível para disparar. */
  threshold?: number
  /** Margem do observador. Negativa adia o disparo. */
  rootMargin?: string
  /** Dispara uma única vez e para de observar. */
  once?: boolean
}

/**
 * O limiar de fração visível pode ser inalcançável?
 *
 * A fração visível de um elemento nunca passa de (altura da área observada ÷
 * altura do elemento). Um bloco mais alto que isso — o formulário da beta, o
 * painel de download, uma seção longa da política — com o zoom em 400 % (a
 * viewport encolhe para ~256 px de altura) nunca chegava aos 18 % e ficava
 * INVISÍVEL para sempre (o Reveal o mantém com opacidade 0 até entrar em cena).
 */
export function limiarInalcancavel(
  alturaDoElemento: number,
  alturaObservada: number,
  threshold: number,
): boolean {
  if (!(alturaDoElemento > 0) || !(alturaObservada > 0) || threshold <= 0) return false
  return alturaDoElemento * threshold >= alturaObservada * 0.95
}

/**
 * Observa a entrada do elemento na viewport.
 * Base de todas as entradas em cena do site.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.18,
  rootMargin = '0px 0px -10% 0px',
  once = true,
}: Options = {}) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // O limiar 0 também é observado: é o aviso de que um bloco alto demais
        // para o limiar começou a entrar — e então ele entra em cena já.
        const alturaObservada = entry.rootBounds?.height ?? window.innerHeight
        const visivel =
          entry.isIntersecting &&
          (entry.intersectionRatio >= threshold ||
            limiarInalcancavel(entry.boundingClientRect.height, alturaObservada, threshold))
        if (visivel) {
          setInView(true)
          if (once) observer.unobserve(entry.target)
        } else if (!once && !entry.isIntersecting) {
          setInView(false)
        }
      },
      { threshold: [0, threshold], rootMargin },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  return { ref, inView }
}
