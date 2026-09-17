import { useEffect, useState } from 'react'

export type Pointer = { x: number; y: number; nx: number; ny: number }

/**
 * Posição do ponteiro em pixels e normalizada (-1 a 1).
 * Alimenta o olho que acompanha o cursor no hero e os efeitos de parallax.
 */
export function usePointer(): Pointer {
  const [pointer, setPointer] = useState<Pointer>({ x: 0, y: 0, nx: 0, ny: 0 })

  useEffect(() => {
    let raf = 0

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const { innerWidth: w, innerHeight: h } = window
        setPointer({
          x: e.clientX,
          y: e.clientY,
          nx: (e.clientX / w) * 2 - 1,
          ny: (e.clientY / h) * 2 - 1,
        })
      })
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return pointer
}
