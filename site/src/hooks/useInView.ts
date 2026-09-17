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
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.unobserve(entry.target)
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold, rootMargin },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  return { ref, inView }
}
