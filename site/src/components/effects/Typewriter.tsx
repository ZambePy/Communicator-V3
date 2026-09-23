import { useEffect, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import './typography.css'

type Props = {
  /** Frases que se alternam, escritas letra a letra. */
  phrases: string[]
  typeMs?: number
  eraseMs?: number
  holdMs?: number
}

/**
 * Máquina de escrever: escreve e apaga frases em ciclo. No contexto da
 * IrisFlow a metáfora é literal, porque é assim que o usuário compõe uma
 * frase no teclado ocular: uma letra por fixação.
 */
export function Typewriter({ phrases, typeMs = 62, eraseMs = 28, holdMs = 1900 }: Props) {
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  const [erasing, setErasing] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    // Com movimento reduzido, nada de letra a letra: a frase inteira, parada.
    if (reduced) return
    const full = phrases[index % phrases.length]

    if (!erasing && text === full) {
      const t = window.setTimeout(() => setErasing(true), holdMs)
      return () => window.clearTimeout(t)
    }

    if (erasing && text === '') {
      setErasing(false)
      setIndex((i) => (i + 1) % phrases.length)
      return
    }

    const t = window.setTimeout(
      () => {
        setText((prev) => (erasing ? full.slice(0, prev.length - 1) : full.slice(0, prev.length + 1)))
      },
      erasing ? eraseMs : typeMs,
    )

    return () => window.clearTimeout(t)
  }, [text, erasing, index, phrases, typeMs, eraseMs, holdMs, reduced])

  const full = phrases[index % phrases.length]

  /* O texto que muda a cada 62 ms fica fora da árvore de acessibilidade
     (um aria-live aqui faria o leitor de tela soletrar sem parar); a frase
     completa vai num sr-only, uma vez. */
  return (
    <span className="typewriter">
      <span className="sr-only">{full}</span>
      <span aria-hidden="true">{reduced ? full : text}</span>
      {!reduced && <span className="typewriter__caret" aria-hidden="true" />}
    </span>
  )
}
