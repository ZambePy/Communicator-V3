import { useEffect, useRef, useState } from 'react'

/** A aba está à vista? (Acompanha a troca de aba e a janela minimizada.) */
export function useAbaVisivel(): boolean {
  const [visivel, setVisivel] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')

  useEffect(() => {
    const aoMudar = () => setVisivel(document.visibilityState !== 'hidden')
    aoMudar()
    document.addEventListener('visibilitychange', aoMudar)
    return () => document.removeEventListener('visibilitychange', aoMudar)
  }, [])

  return visivel
}

/**
 * O relógio dos efeitos de fundo (rodada 3, 21/10/2026): chama `aoTique` a
 * cada `intervaloMs` enquanto `ativo` (a seção está na tela e o movimento não
 * foi reduzido) E a aba está visível. Em qualquer outro momento o temporizador
 * nem existe — não é pausado, é desfeito —, então um efeito fora da tela, ou
 * numa aba escondida, não gasta nada. Ao voltar, o relógio recomeça do zero.
 *
 * A função mais recente é a que roda, sem reiniciar o relógio quando ela muda.
 */
export function useTique(ativo: boolean, intervaloMs: number, aoTique: () => void): void {
  const abaVisivel = useAbaVisivel()
  const funcao = useRef(aoTique)
  funcao.current = aoTique

  useEffect(() => {
    if (!ativo || !abaVisivel) return
    const id = window.setInterval(() => funcao.current(), intervaloMs)
    return () => window.clearInterval(id)
  }, [ativo, abaVisivel, intervaloMs])
}
