import { useEffect, useState } from 'react'

function ler(consulta: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(consulta).matches
}

/** A consulta de mídia vale agora? Acompanha a mudança (mouse plugado, janela girada). */
export function useMidia(consulta: string): boolean {
  const [vale, setVale] = useState(() => ler(consulta))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(consulta)
    setVale(mq.matches)
    const aoMudar = (e: MediaQueryListEvent) => setVale(e.matches)
    mq.addEventListener('change', aoMudar)
    return () => mq.removeEventListener('change', aoMudar)
  }, [consulta])

  return vale
}
