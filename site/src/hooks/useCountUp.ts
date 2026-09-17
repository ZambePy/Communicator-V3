import { useEffect, useRef, useState } from 'react'

/**
 * Contador animado com easing, disparado quando `active` vira true.
 * Usado nos indicadores técnicos e de mercado.
 */
export function useCountUp(target: number, active: boolean, duration = 1500, decimals = 0) {
  const [value, setValue] = useState(0)
  const frame = useRef<number>()

  useEffect(() => {
    if (!active) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      setValue(target)
      return
    }

    const start = performance.now()

    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Number((target * eased).toFixed(decimals)))
      if (p < 1) frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [target, active, duration, decimals])

  return value
}
