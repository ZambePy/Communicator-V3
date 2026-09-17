import type { ElementType } from 'react'
import { useInView } from '@/hooks/useInView'
import './typography.css'

type Props = {
  text: string
  as?: ElementType
  className?: string
  /** Palavras destacadas com o gradiente da marca (a comparação ignora acento e caixa). */
  highlight?: string[]
  /** Atraso entre palavras, em ms. */
  stagger?: number
  delay?: number
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()

/**
 * Cada palavra do título sobe para o lugar quando ele entra na viewport.
 * As palavras marcadas em `highlight` recebem o gradiente da marca.
 */
export function AnimatedHeadline({
  text,
  as: Tag = 'h2',
  className = '',
  highlight = [],
  stagger = 70,
  delay = 0,
}: Props) {
  const { ref, inView } = useInView<HTMLHeadingElement>({ threshold: 0.3 })
  const words = text.split(' ')
  const marks = highlight.map(norm)

  return (
    <Tag ref={ref} className={`headline ${className}`}>
      {words.map((word, i) => (
        <span className="headline__mask" key={`${word}-${i}`}>
          <span
            className={`headline__word${marks.includes(norm(word)) ? ' gradient-text' : ''}`}
            style={{
              animation: inView
                ? `word-rise 800ms var(--ease-out) ${delay + i * stagger}ms both`
                : undefined,
              opacity: inView ? undefined : 0,
            }}
          >
            {word}
          </span>
        </span>
      ))}
    </Tag>
  )
}
