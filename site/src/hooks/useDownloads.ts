import { useEffect, useState } from 'react'
import { DOWNLOADS, fetchDownloads, type Downloads } from '@/services/api'

/**
 * URLs dos instaladores, lidas da tabela app_releases.
 *
 * Começa no fallback '#' e troca quando a consulta volta, então a tela
 * nunca fica esperando por isso. Se o banco estiver fora do ar ou sem
 * release cadastrada, os botões seguem inertes em vez de sumir.
 */
export function useDownloads(): Downloads {
  const [downloads, setDownloads] = useState<Downloads>(DOWNLOADS)

  useEffect(() => {
    let vivo = true

    fetchDownloads()
      .then((d) => {
        if (vivo) setDownloads(d)
      })
      .catch(() => {
        /* mantém o fallback */
      })

    return () => {
      vivo = false
    }
  }, [])

  return downloads
}
