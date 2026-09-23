import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** Leitura síncrona, para decisões fora do React (ex.: transições de rota). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(QUERY).matches
}

/**
 * Verdadeiro quando o sistema pede menos movimento. Todo componente que
 * anima por JavaScript (máquina de escrever, mock do app, demo de fixação)
 * consulta isto e entrega o estado final direto — o CSS já é coberto pela
 * regra global em global.css.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * Máquina modesta: poucos núcleos, tela estreita ou preferência por menos
 * movimento. Usado para desligar o fundo ambiente pesado (blur, partículas).
 */
export function useLowPower(): boolean {
  const [low, setLow] = useState(() => detectLowPower())

  useEffect(() => {
    const onResize = () => setLow(detectLowPower())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return low
}

function detectLowPower(): boolean {
  if (typeof window === 'undefined') return false
  if (prefersReducedMotion()) return true
  const cores = navigator.hardwareConcurrency
  if (typeof cores === 'number' && cores > 0 && cores <= 4) return true
  return window.innerWidth < 720
}
