import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Intensidade: negativo sobe mais devagar, positivo desce. */
  speed?: number
  className?: string
}

/**
 * Camada que se desloca em parallax conforme a rolagem. Respeita a
 * preferência de movimento reduzido do sistema.
 */
export function Parallax({ children, speed = -0.12, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [y, setY] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const center = rect.top + rect.height / 2 - window.innerHeight / 2
        setY(center * speed)
      })
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      cancelAnimationFrame(raf)
    }
  }, [speed])

  return (
    <div ref={ref} className={className} style={{ transform: `translate3d(0, ${y}px, 0)` }}>
      {children}
    </div>
  )
}
