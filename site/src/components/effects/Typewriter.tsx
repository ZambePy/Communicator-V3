import { useEffect, useState } from 'react'
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

  useEffect(() => {
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
  }, [text, erasing, index, phrases, typeMs, eraseMs, holdMs])

  return (
    <span className="typewriter">
      <span aria-live="polite">{text}</span>
      <span className="typewriter__caret" aria-hidden="true" />
    </span>
  )
}
